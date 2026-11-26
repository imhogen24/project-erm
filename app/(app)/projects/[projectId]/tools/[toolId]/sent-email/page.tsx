import { and, desc, eq, ne } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"

import { toolRecords } from "@/db/schema"
import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { registeredTools } from "@/lib/tools"
import { sentEmailOf } from "@/server/contract/transmittal"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"
import { RecordNotFoundError, getRecord } from "@/server/records/records"

import { projectNav } from "../../../sidebar"

const sentOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// The copy of the email a tool sent, such as D2.7's draft contract to the
// client, exactly as it went out. Whoever may read the tool may read it. A
// tool run once per payment milestone, such as D3.6, names the cycle, as
// ?cycle=2; otherwise the newest record's email shows.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; toolId: string }>
  searchParams: Promise<{ cycle?: string | string[] }>
}) {
  const { projectId, toolId } = await params
  const session = await requireSession()

  const cycle = z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .catch(undefined)
    .parse((await searchParams).cycle)

  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  const database = getDatabase()

  const [newest] = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void"),
        ...(cycle === undefined ? [] : [eq(toolRecords.cycle, cycle)])
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  if (!newest) {
    notFound()
  }

  let overview

  try {
    await getRecord(database, session.user.id, newest.id)
    overview = await getProjectOverview(
      database,
      session.user.id,
      projectId,
      registeredTools
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof RecordNotFoundError
    ) {
      notFound()
    }

    throw error
  }

  const email = await sentEmailOf(database, newest.id)

  if (!email) {
    notFound()
  }

  const canInvite = await isItAdmin(session.user.id)
  const back = `/projects/${projectId}/tools/${toolId}${cycle === undefined ? "" : `?cycle=${cycle}`}`

  const facts = [
    { label: "To", value: email.to },
    ...(email.cc.length > 0
      ? [{ label: "CC", value: email.cc.join(", ") }]
      : []),
    { label: "Sent", value: `${sentOn.format(email.sentAt)} GMT` },
    ...email.attachments.map((name) => ({ label: "Attached", value: name })),
  ]

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} project={projectNav(overview)} />
        <main className="table-wide table-home">
          <BackLink href={back} className="mb-3 border-y bg-background">
            {`${toolId} ${overview.name}`}
          </BackLink>
          <PageSheet title={email.subject}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {facts.map((fact) => (
                <div key={`${fact.label}-${fact.value}`} className="contents">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="note-panel mt-6 p-6 text-base leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
              {email.text}
            </div>
          </PageSheet>
        </main>
      </div>
    </>
  )
}
