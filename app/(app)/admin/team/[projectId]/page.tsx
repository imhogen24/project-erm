import { notFound, redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { StaffChoice } from "@/components/staff-choice"
import { Badge } from "@/components/ui/badge"
import type { Role } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { limitFor } from "@/server/staff/limits"
import { availableStaff } from "@/server/staff/staff"
import { teamOf } from "@/server/staff/team"

import { trackName } from "../names"
import { assignStaffAction, unassignStaffAction } from "./actions"

function limitOf(role: Role) {
  return limitFor(role)?.limit ?? "any number of"
}

// The choices of the screen: what each is called, the roles whose people it
// lists, and whether a project has only one person in it.
const choices: {
  title: string
  hint: string
  roles: Role[]
  single: boolean
  button: string
}[] = [
  {
    title: "Project manager",
    hint: `One per project. A PM leads up to ${limitOf("PM")} projects.`,
    roles: ["PM"],
    single: true,
    button: "Assign",
  },
  {
    title: "Onboarding manager",
    hint: `One per project. An OM handles up to ${limitOf("OM")} projects.`,
    roles: ["OM"],
    single: true,
    button: "Assign",
  },
  {
    title: "Engineers",
    hint: `Lead and assigned engineers, up to ${limitOf("LE")} projects each.`,
    roles: ["LE", "AE"],
    single: false,
    button: "Add engineer",
  },
  {
    title: "Finance checker",
    hint: `A finance officer checks up to ${limitOf("FO")} projects.`,
    roles: ["FO"],
    single: false,
    button: "Assign",
  },
]

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await requireSession()

  if (!(await isItAdmin(session.user.id))) {
    redirect("/")
  }

  const { projectId } = await params
  const database = getDatabase()
  const team = await teamOf(database, session.user.id, projectId)

  if (!team) {
    notFound()
  }

  const lists = await Promise.all(
    choices.map(async (choice) => {
      const found = await Promise.all(
        choice.roles.map(async (role) => ({
          role,
          ...(await availableStaff(database, session.user.id, role)),
        }))
      )

      return {
        ...choice,
        someoneFree: found.some((each) => each.someoneFree),
        options: found.flatMap((each) =>
          each.people
            // Someone already in this role on the project is shown as a
            // member, not offered again.
            .filter(
              (person) =>
                !team.members.some(
                  (member) =>
                    member.personId === person.personId &&
                    member.role === each.role
                )
            )
            .map((person) => ({ ...person, role: each.role }))
        ),
      }
    })
  )

  return (
    <>
      <MobileBar className="xl:hidden" canInvite />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} current="team" canInvite />
        <main className="table-project table-home">
          <PageSheet
            above={
              <BackLink href="/admin/team">Projects that need a team</BackLink>
            }
            title={team.project.name}
            below={
              <>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {trackName(team.project.serviceTrack)}
                  </Badge>
                  <span className="tabular-nums">{team.project.requestId}</span>
                </p>
              </>
            }
          >
            <div className="relative grid gap-3 lg:grid-cols-2">
              {lists.map((list) => (
                <StaffChoice
                  key={list.title}
                  projectId={projectId}
                  title={list.title}
                  hint={list.hint}
                  single={list.single}
                  buttonLabel={list.button}
                  members={team.members.filter((member) =>
                    list.roles.includes(member.role)
                  )}
                  options={list.options}
                  someoneFree={list.someoneFree}
                  assign={assignStaffAction}
                  unassign={unassignStaffAction}
                />
              ))}
            </div>
          </PageSheet>
        </main>
      </div>
    </>
  )
}
