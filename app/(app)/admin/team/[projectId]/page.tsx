import { notFound, redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { StaffChoice } from "@/components/staff-choice"
import { Badge } from "@/components/ui/badge"
import type { Role } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { availableStaff } from "@/server/staff/staff"
import { teamOf } from "@/server/staff/team"

import { trackName } from "../names"
import { assignStaffAction, unassignStaffAction } from "./actions"

const square = "grid-square relative isolate bg-background"

// The choices of the screen: what each is called, the roles whose people it
// lists, and whether a project has only one person in it.
const choices: {
  title: string
  roles: Role[]
  single: boolean
  button: string
}[] = [
  { title: "Project manager", roles: ["PM"], single: true, button: "Assign" },
  {
    title: "Onboarding manager",
    roles: ["OM"],
    single: true,
    button: "Assign",
  },
  {
    title: "Engineers",
    roles: ["LE", "AE"],
    single: false,
    button: "Add engineer",
  },
  {
    title: "Finance checker",
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
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} current="team" canInvite />
        <main className="table-project table-home">
          <div
            className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-2 px-6 py-6`}
          >
            <Grain />
            <BackLink href="/admin/team">Projects that need a team</BackLink>
            <h1 className="text-4xl font-semibold tracking-tight break-words sm:text-5xl">
              Assign team
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{team.project.requestId}</span>
              <Badge variant="outline">
                {trackName(team.project.serviceTrack)}
              </Badge>
              <span className="break-words">{team.project.name}</span>
            </p>
          </div>
          <div className={`${square} mt-[var(--cell)] px-6 py-8`}>
            <Grain />
            <div className="relative flex max-w-2xl flex-col">
              {lists.map((list) => (
                <StaffChoice
                  key={list.title}
                  projectId={projectId}
                  title={list.title}
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
          </div>
        </main>
      </div>
    </>
  )
}
