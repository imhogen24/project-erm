import { and, desc, eq, inArray, ne } from "drizzle-orm"

import {
  changeRequests,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import {
  changeRequestChange,
  payloadChanges,
  stateChange,
  writeAudit,
  type Transaction,
} from "@/server/audit/audit"
import { notifyReviewAgain, notifySentBack } from "@/server/notifications/raise"
import { systemActor } from "@/server/system/system"
import { tools } from "@/server/tools/registry"
import { catalogOf } from "@/server/workflow/tracks"
import { opensAgainIn, waitsOn } from "@/server/workflow/workflow"

import { signaturesOf, withoutSignatures } from "./signatures"

type LockedRecord = {
  id: string
  projectId: string
  toolId: string
  payload: JsonObject
}

// The project's newest record of the tool that is not void, held until the
// transaction ends, so nothing else moves it meanwhile.
async function newestRecord(
  transaction: Transaction,
  projectId: string,
  toolId: string
) {
  const [record] = await transaction
    .select({
      id: toolRecords.id,
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      state: toolRecords.state,
      payload: toolRecords.payload,
      updatedAt: toolRecords.updatedAt,
      submittedBy: toolRecords.submittedBy,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle), desc(toolRecords.createdAt))
    .limit(1)
    .for("update")

  return record
}

type Held = NonNullable<Awaited<ReturnType<typeof newestRecord>>>

// Reopens a locked record as a draft, the way an approved change request
// does, so locking it again marks the request applied and raises its
// iteration (server/document-control). The request is the system's own,
// already approved, with the reason the record went back; a request the
// writer had already made is approved instead. Its signatures vouched for
// what is being revised, so they are cleared, and the reason is kept on the
// move back to draft, so the writer sees why.
async function reopen(
  transaction: Transaction,
  requester: string,
  record: Held,
  reason: string
): Promise<void> {
  const now = new Date()
  const entry = { recordId: record.id, projectId: record.projectId }

  const [open] = await transaction
    .select({ id: changeRequests.id })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.recordId, record.id),
        inArray(changeRequests.status, ["requested", "approved"])
      )
    )
    .for("update")

  let requestId = open?.id

  if (requestId) {
    await transaction
      .update(changeRequests)
      .set({ status: "approved", decidedBy: requester, decidedAt: now })
      .where(eq(changeRequests.id, requestId))
  } else {
    const [request] = await transaction
      .insert(changeRequests)
      .values({
        projectId: record.projectId,
        recordId: record.id,
        reason,
        requestedBy: requester,
        status: "approved",
        decidedBy: requester,
        decidedAt: now,
      })
      .returning({ id: changeRequests.id })

    requestId = request!.id

    await writeAudit(
      transaction,
      { ...entry, actor: requester, action: "change_requested" },
      [changeRequestChange(requestId, null, "requested", reason)]
    )
  }

  await writeAudit(
    transaction,
    { ...entry, actor: requester, action: "change_approved" },
    [changeRequestChange(requestId, "requested", "approved")]
  )

  const payload = withoutSignatures(record.toolId, record.payload)

  await transaction
    .update(toolRecords)
    .set({
      state: "draft",
      payload,
      updatedAt: new Date(
        Math.max(now.getTime(), record.updatedAt.getTime() + 1)
      ),
    })
    .where(eq(toolRecords.id, record.id))

  await writeAudit(
    transaction,
    {
      ...entry,
      actor: requester,
      action: "updated",
      reason: "Signatures cleared: sent back for revisions",
    },
    payloadChanges(signaturesOf(record.toolId, record.payload), {})
  )

  await writeAudit(
    transaction,
    { ...entry, actor: requester, action: "transitioned", reason },
    [stateChange("locked", "draft")]
  )
}

// Runs inside the transaction that locks `record`. A review locked with its
// send-back answer, such as D2.3 with Revisions Required, reopens the work it
// reviews for whoever wrote it. That work, locked again, reopens the reviews
// before the one that sent it back, which approved what is now revised, such
// as D2.3 when D2.4 sent the draft back. Each review that sent work back
// reopens, for the reviewer, once that work is locked again and the rule
// that opens the review holds again: D2.3 once the draft is locked, and
// D2.4 once D2.3 is locked with Approved too.
export async function applySendBack(
  transaction: Transaction,
  actor: string,
  record: LockedRecord
): Promise<void> {
  const [project] = await transaction
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, record.projectId))

  if (!project) {
    return
  }

  const { track } = project
  const all = tools.listTools()
  const catalog = catalogOf(all)
  const review = tools.getTool(record.toolId)?.sendsBackTo

  if (review && record.payload[review.field] === review.is) {
    for (const id of review.tools) {
      const used = catalog.onTrack(id, track)

      const held =
        used && (await newestRecord(transaction, record.projectId, used))

      if (!held || held.state !== "locked") {
        continue
      }

      const reason = `${record.toolId} sent it back: ${review.is}`

      await reopen(transaction, actor, held, reason)
      await notifySentBack(transaction, actor, held, reason)
    }
  }

  // The reviews on this track, each with the tools it reviews as the track
  // names them.
  const reviews = all.flatMap((tool) => {
    const back = tool.sendsBackTo

    if (!back || !catalog.onTrack(tool.id, track)) {
      return []
    }

    const reviewed = back.tools.flatMap((id) => {
      const used = catalog.onTrack(id, track)

      return used ? [used] : []
    })

    return [{ id: tool.id, back, reviewed }]
  })

  type Review = (typeof reviews)[number]

  const sentBack = (each: Review, held: Held | undefined) =>
    held?.state === "locked" && held.payload[each.back.field] === each.back.is

  const ofThis = reviews.filter((each) => each.reviewed.includes(record.toolId))

  const senders: string[] = []

  for (const each of ofThis) {
    if (
      sentBack(each, await newestRecord(transaction, record.projectId, each.id))
    ) {
      senders.push(each.id)
    }
  }

  const waitedOn = new Set(senders.flatMap((id) => [...waitsOn(id, track)]))

  for (const each of ofThis) {
    if (senders.includes(each.id) || !waitedOn.has(each.id)) {
      continue
    }

    const held = await newestRecord(transaction, record.projectId, each.id)

    if (held?.state !== "locked") {
      continue
    }

    const reason = `${record.toolId} was revised after ${senders.join(" and ")} sent it back: review it again`

    await reopen(transaction, systemActor, held, reason)
    await notifyReviewAgain(transaction, actor, held, reason)
  }

  for (const each of reviews) {
    if (
      !each.reviewed.includes(record.toolId) &&
      !waitsOn(each.id, track).has(record.toolId)
    ) {
      continue
    }

    const held = await newestRecord(transaction, record.projectId, each.id)

    if (!held || !sentBack(each, held)) {
      continue
    }

    let revised = true

    for (const id of each.reviewed) {
      const work = await newestRecord(transaction, record.projectId, id)

      revised &&= work?.state === "locked"
    }

    if (
      !revised ||
      !(await opensAgainIn(transaction, record.projectId, each.id))
    ) {
      continue
    }

    const reason = `${each.reviewed.join(" and ")} was revised: review it again`

    await reopen(transaction, systemActor, held, reason)
    await notifyReviewAgain(transaction, actor, held, reason)
  }
}
