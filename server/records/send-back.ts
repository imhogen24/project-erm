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
import {
  notifyReviewAgain,
  notifyRolesSentBack,
  notifySentBack,
  type PendingEmail,
} from "@/server/notifications/raise"
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
      lockedAt: toolRecords.lockedAt,
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
// reviews for whoever wrote it. That work, locked again, reopens the first of
// the reviews before the one that sent it back, which approved what is now
// revised: D2.3 when D2.4 or D2.5 sent the draft back. The reviews after it
// wait their turn, and each reopens, for its reviewer, once the work is
// locked again, every review it waits for has run again since, and the rule
// that opens it holds again: after D2.5 sent the draft back, D2.3 runs again,
// then D2.4 once D2.3 is locked with Approved, then D2.5 once D2.4 is. The
// emails to the roles a review `notifies` go into `outbox`, to send once the
// transaction commits.
export async function applySendBack(
  transaction: Transaction,
  actor: string,
  record: LockedRecord,
  outbox: PendingEmail[]
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

      if (review.notifies) {
        outbox.push(
          ...(await notifyRolesSentBack(
            transaction,
            actor,
            held,
            review.notifies,
            reason
          ))
        )
      }
    }
  }

  // The reviews on this track, each with the tools it reviews as the track
  // names them, and every tool its rule waits for.
  const reviews = all.flatMap((tool) => {
    const back = tool.sendsBackTo

    if (!back || !catalog.onTrack(tool.id, track)) {
      return []
    }

    const reviewed = back.tools.flatMap((id) => {
      const used = catalog.onTrack(id, track)

      return used ? [used] : []
    })

    return [{ id: tool.id, back, reviewed, waits: waitsOn(tool.id, track) }]
  })

  type Review = (typeof reviews)[number]

  const newest = (id: string) => newestRecord(transaction, record.projectId, id)

  const sentBack = (each: Review, held: Held | undefined) =>
    held?.state === "locked" && held.payload[each.back.field] === each.back.is

  // A locked review whose work was locked again after it, so it approved
  // what is now revised.
  const outdated = async (each: Review, held: Held | undefined) => {
    if (held?.state !== "locked" || !held.lockedAt) {
      return false
    }

    for (const id of each.reviewed) {
      const work = await newest(id)

      if (
        work?.state === "locked" &&
        work.lockedAt &&
        work.lockedAt > held.lockedAt
      ) {
        return true
      }
    }

    return false
  }

  // The reviews locked with their send-back answer now.
  const senders: Review[] = []

  for (const each of reviews) {
    if (sentBack(each, await newest(each.id))) {
      senders.push(each)
    }
  }

  const ofThis = reviews.filter((each) => each.reviewed.includes(record.toolId))

  const sentThis = senders.filter((each) => ofThis.includes(each))

  const waitedOn = new Set(sentThis.flatMap((each) => [...each.waits]))

  const candidates: Review[] = []

  for (const each of ofThis) {
    if (
      !sentThis.includes(each) &&
      waitedOn.has(each.id) &&
      (await newest(each.id))?.state === "locked"
    ) {
      candidates.push(each)
    }
  }

  // Only the first of them runs again now: one that waits for none of the
  // others, nor for a review that sent the work back.
  const blocking = new Set([...candidates, ...sentThis].map((each) => each.id))

  for (const each of candidates) {
    if ([...each.waits].some((id) => blocking.has(id))) {
      continue
    }

    const held = await newest(each.id)

    if (held?.state !== "locked") {
      continue
    }

    const reason = `${record.toolId} was revised after ${sentThis.map((sender) => sender.id).join(" and ")} sent it back: review it again`

    await reopen(transaction, systemActor, held, reason)
    await notifyReviewAgain(transaction, actor, held, reason)
  }

  for (const each of reviews) {
    if (
      !each.reviewed.includes(record.toolId) &&
      !each.waits.has(record.toolId)
    ) {
      continue
    }

    const held = await newest(each.id)

    // It runs again when it sent the work back, or when it approved work a
    // later review sent back since.
    const due =
      held &&
      (sentBack(each, held) ||
        (senders.some((sender) => sender.waits.has(each.id)) &&
          (await outdated(each, held))))

    if (!held || !due) {
      continue
    }

    let revised = true

    for (const id of each.reviewed) {
      revised &&= (await newest(id))?.state === "locked"
    }

    // Every review it waits for has run again since the work was revised.
    for (const before of reviews) {
      if (!revised || !each.waits.has(before.id)) {
        continue
      }

      const earlier = await newest(before.id)

      revised &&=
        earlier?.state === "locked" && !(await outdated(before, earlier))
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
