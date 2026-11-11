import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { ClientRequestForm } from "@/components/client-request-form"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import type { Tier } from "@/lib/client-request-form"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { isClientAccount } from "@/server/intake/client-requests"

import { startProjectAction } from "./actions"

// The two kinds of request, named as on the IMHOGEN website.
const tiers: { track: Tier; title: string; detail: string }[] = [
  {
    track: "Tier_1",
    title: "Tier 1: Custom Engineering & Factory Solutions",
    detail: "A product, a machine or a process line to design and build.",
  },
  {
    track: "Tier_3",
    title: "Tier 3: Engineering Drafting & Digitization",
    detail:
      "Drawings, 3D models or manuals from a part, a sketch or old files.",
  },
]

// A client starts a project: they choose the tier, then fill the web form.
// Sending it creates the project with D1.1 locked.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>
}) {
  const session = await requireSession()

  if (!(await isClientAccount(getDatabase(), session.user.id))) {
    redirect("/")
  }

  const { tier } = await searchParams
  const chosen = tiers.find((each) => each.track === tier)

  return (
    <>
      <MobileBar className="xl:hidden" />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} />
        <main className="table-project table-home">
          <PageSheet
            above={
              <BackLink href={chosen ? "/projects/new" : "/"}>
                {chosen ? "Choose the tier" : "Your projects"}
              </BackLink>
            }
            title={chosen ? chosen.title : "Start new project"}
          >
            {chosen ? (
              <ClientRequestForm
                track={chosen.track}
                submitLabel="Send request"
                submit={async (answers) => {
                  "use server"

                  return startProjectAction({ track: chosen.track, answers })
                }}
              />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {tiers.map((each) => (
                  <li key={each.track} className="tile link-tile relative">
                    <Link
                      href={`/projects/new?tier=${each.track}`}
                      className="stretched-link flex flex-col gap-2"
                    >
                      <span className="text-base font-semibold">
                        {each.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {each.detail}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PageSheet>
        </main>
      </div>
    </>
  )
}
