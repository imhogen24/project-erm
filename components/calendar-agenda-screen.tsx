"use client"

import { PlusIcon, XIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { SegmentedChoice } from "@/components/segmented-choice"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DONE,
  agendaItems,
  checksOf,
  missingToBeReady,
  missingToInvite,
  type AgendaItem,
  type Attendee,
  type CalendarAgenda,
  type MeetingDetails,
} from "@/lib/calendar-agenda"
import { meetingInstant, sheetDate, zoneLabel } from "@/lib/meeting-time"
import type { FormValues } from "@/lib/tool-definition"
import {
  useAutosave,
  type SaveInput,
  type SaveResult,
} from "@/lib/use-autosave"

type Member = { personId: string; name: string; roles: string[] }

type Props = {
  projectId: string
  cycle: number
  recordId?: string
  updatedAt?: string
  saved: CalendarAgenda
  // The meeting confirmed on D1.5.
  meeting: MeetingDetails | null
  // IMHOGEN's people on the project, to choose attendees from.
  team: Member[]
  // Who attends from the client.
  client: string[]
  canWrite: boolean
  save: (input: SaveInput) => Promise<SaveResult>
  sendInvite: (values: { recordId: string }) => Promise<SaveResult>
  ready: (values: { recordId: string }) => Promise<SaveResult>
}

const detailWidths = "minmax(0,calc(100%/var(--page-columns,5))) minmax(0,1fr)"

// SN and the minutes are short, so the words get the room.
const agendaWidths =
  "3.5rem 6.5rem minmax(0,2fr) minmax(0,1.3fr) minmax(0,2fr) 3.5rem"

const checkWidths =
  "minmax(0,calc(100%/var(--page-columns,5)*2)) minmax(0,1fr) minmax(0,1fr)"

const STALE = "Someone else saved this record. Reload to see their changes."

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

type Check = ReturnType<typeof checksOf>[number]

// D1.6 for the IMHOGEN team: the meeting confirmed on D1.5, who attends, the
// agenda and the pre-meeting checks. The OM's edits save by themselves; Send
// calendar invite emails everyone the meeting with a calendar file, and Ready
// for the meeting locks D1.6. Everyone else reads it. The server decides every
// rule; this shows what still stops each step.
export function CalendarAgendaScreen({
  projectId,
  cycle,
  recordId,
  updatedAt,
  saved,
  meeting,
  team,
  client,
  canWrite,
  save,
  sendInvite,
  ready,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const sheet = useAutosave({
    projectId,
    toolId: "D1.6",
    cycle,
    recordId,
    updatedAt,
    save,
  })

  const [attending, setAttending] = useState<Attendee[]>(saved.imhogenAttendees)

  const [agenda, setAgenda] = useState<AgendaItem[]>(agendaItems(saved))
  const [checks, setChecks] = useState<Check[]>(checksOf(saved))
  const [notes, setNotes] = useState(saved.notes ?? "")

  type Held = {
    attending: Attendee[]
    agenda: AgendaItem[]
    checks: Check[]
    notes: string
  }

  function valuesOf(held: Held): FormValues {
    return {
      imhogenAttendees: held.attending.map((each) => ({
        personId: each.personId,
        ...(each.name && { name: each.name }),
        ...(each.role && { role: each.role }),
      })),
      agenda: held.agenda.map((item) => ({
        ...(item.minutes !== undefined && { minutes: item.minutes }),
        ...(item.topic && { topic: item.topic }),
        ...(item.leadSpeaker && { leadSpeaker: item.leadSpeaker }),
        ...(item.objective && { objective: item.objective }),
      })),
      preMeetingChecks: held.checks.map((each) => ({
        task: each.task,
        ...(each.assignee && { assignee: each.assignee }),
        ...(each.status && { status: each.status }),
      })),
      ...(held.notes.trim() !== "" && { notes: held.notes }),
    }
  }

  const held: Held = { attending, agenda, checks, notes }

  function edit(change: Partial<Held>) {
    const next = { ...held, ...change }

    setAttending(next.attending)
    setAgenda(next.agenda)
    setChecks(next.checks)
    setNotes(next.notes)

    sheet.changed(valuesOf(next))
  }

  function setItem(index: number, change: Partial<AgendaItem>) {
    edit({
      agenda: agenda.map((item, at) =>
        at === index ? { ...item, ...change } : item
      ),
    })
  }

  function setCheck(index: number, change: Partial<Check>) {
    edit({
      checks: checks.map((each, at) =>
        at === index ? { ...each, ...change } : each
      ),
    })
  }

  function toggle(member: Member, on: boolean) {
    edit({
      attending: on
        ? [
            ...attending,
            {
              personId: member.personId,
              name: member.name,
              role: member.roles.join(", "),
            },
          ]
        : attending.filter((each) => each.personId !== member.personId),
    })
  }

  function run(step: () => Promise<SaveResult>, saidDone: string) {
    sheet.setMessage(undefined)
    startTransition(async () => {
      // What was typed is saved first, so the step reads it.
      if (canWrite && !(await sheet.saveNow(valuesOf(held)))) {
        return
      }

      const result = await step()

      if (result.status === "done") {
        sheet.setRecord(result)
        sheet.setMessage(saidDone)
        router.refresh()

        return
      }

      if (result.status === "stale") {
        sheet.setStale(true)

        return
      }

      sheet.setMessage(
        result.status === "invalid"
          ? result.errors.map((error) => error.message).join("; ")
          : result.message
      )
    })
  }

  const at = meeting
    ? meetingInstant(meeting.date, meeting.time, meeting.timeZone)
    : undefined

  const current: CalendarAgenda = {
    ...saved,
    imhogenAttendees: attending,
    agenda,
    preMeetingChecks: checks,
  }

  const toInvite = missingToInvite(current, { at, now: new Date() })
  const toBeReady = missingToBeReady(current)
  const locked = !canWrite

  function stepId() {
    return sheet.latest.current.recordId!
  }

  return (
    <div data-final={locked} className="flex flex-col gap-8">
      <TableBox title="1.0 Finalized meeting details">
        <DataTable
          label="Finalized meeting details"
          columns={["Field", "Answer"]}
          widths={detailWidths}
        >
          {[
            ["Meeting Date", meeting ? sheetDate(meeting.date) : "-"],
            [
              "Meeting Time (Zone)",
              meeting
                ? `${meeting.time.slice(0, 5)} ${zoneLabel(meeting.timeZone)}`
                : "-",
            ],
            ["Platform/Location", meeting?.platform || "-"],
          ].map(([label, value]) => (
            <DataRow key={label} widths={detailWidths}>
              <DataCell label="Field">
                <span className="text-sm font-medium">{label}</span>
              </DataCell>
              <DataCell label="Answer">
                <span className="text-sm tabular-nums">{value}</span>
              </DataCell>
            </DataRow>
          ))}
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Meeting ID/PIN</span>
            </DataCell>
            <DataCell label="Answer">
              {meeting?.link ? (
                <a
                  href={meeting.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm break-all underline underline-offset-4"
                >
                  {meeting.link}
                </a>
              ) : (
                <span className="text-sm">-</span>
              )}
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">IMHOGEN Attendees</span>
            </DataCell>
            <DataCell label="Answer">
              {locked ? (
                <span className="text-sm break-words">
                  {attending.map((each) => each.name).join(", ") || "-"}
                </span>
              ) : (
                <div
                  role="group"
                  aria-label="IMHOGEN Attendees"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {team.map((member) => (
                    <label
                      key={member.personId}
                      className="tile-choice items-center p-3"
                    >
                      <Checkbox
                        aria-label={member.name}
                        checked={attending.some(
                          (each) => each.personId === member.personId
                        )}
                        onCheckedChange={(on) => toggle(member, on === true)}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium break-words">
                          {member.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {member.roles.join(", ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Client Attendees</span>
            </DataCell>
            <DataCell label="Answer">
              <span className="text-sm break-words">
                {client.join(", ") || "-"}
              </span>
            </DataCell>
          </DataRow>
        </DataTable>
      </TableBox>
      <TableBox title="2.0 Calendar integration">
        <DataTable
          label="Agenda"
          columns={[
            "SN",
            "Time Allotted (mins)",
            "Agenda Topic",
            "Lead Speaker",
            "Meeting Objective / Focus",
            "",
          ]}
          widths={agendaWidths}
        >
          {agenda.map((item, index) => (
            <DataRow key={index} widths={agendaWidths}>
              <DataCell label="SN">
                <span className="text-sm font-medium tabular-nums">
                  {index + 1}
                </span>
              </DataCell>
              <DataCell label="Time Allotted (mins)">
                {locked ? (
                  <span className="text-sm tabular-nums">
                    {item.minutes ?? "-"}
                  </span>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    aria-label={`Topic ${index + 1} minutes`}
                    value={item.minutes ?? ""}
                    className="h-12 bg-background"
                    onChange={(event) =>
                      setItem(index, {
                        minutes:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                )}
              </DataCell>
              <DataCell label="Agenda Topic">
                {locked ? (
                  <span className="text-sm break-words">{item.topic}</span>
                ) : (
                  <Textarea
                    aria-label={`Topic ${index + 1}`}
                    value={item.topic}
                    className="min-h-12 bg-background"
                    onChange={(event) =>
                      setItem(index, { topic: event.target.value })
                    }
                  />
                )}
              </DataCell>
              <DataCell label="Lead Speaker">
                {locked ? (
                  <span className="text-sm break-words">
                    {item.leadSpeaker}
                  </span>
                ) : (
                  <Input
                    aria-label={`Topic ${index + 1} lead speaker`}
                    value={item.leadSpeaker}
                    className="h-12 bg-background"
                    onChange={(event) =>
                      setItem(index, { leadSpeaker: event.target.value })
                    }
                  />
                )}
              </DataCell>
              <DataCell label="Meeting Objective / Focus">
                {locked ? (
                  <span className="text-sm break-words">{item.objective}</span>
                ) : (
                  <Textarea
                    aria-label={`Topic ${index + 1} objective`}
                    value={item.objective}
                    className="min-h-12 bg-background"
                    onChange={(event) =>
                      setItem(index, { objective: event.target.value })
                    }
                  />
                )}
              </DataCell>
              <DataCell label="">
                {!locked && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove topic ${index + 1}`}
                    disabled={agenda.length === 1}
                    onClick={() =>
                      edit({ agenda: agenda.filter((_, at) => at !== index) })
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                )}
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
        {(!locked || saved.inviteSentAt) && (
          <div className="flex flex-col gap-3 border-t border-foreground/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            {!locked && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() =>
                  edit({
                    agenda: [
                      ...agenda,
                      { topic: "", leadSpeaker: "", objective: "" },
                    ],
                  })
                }
              >
                <PlusIcon aria-hidden />
                Add a topic
              </Button>
            )}
            {saved.inviteSentAt && (
              <span data-tone="good" className="result-chip">
                Invite sent {when.format(new Date(saved.inviteSentAt))}
              </span>
            )}
          </div>
        )}
      </TableBox>
      <TableBox title="4.0 Pre-meeting checklist">
        <DataTable
          label="Pre-meeting checklist"
          columns={["Task", "Assignee", "Status"]}
          widths={checkWidths}
        >
          {checks.map((each, index) => (
            <DataRow key={each.task} widths={checkWidths}>
              <DataCell label="Task">
                <span className="text-sm font-medium">{each.task}</span>
              </DataCell>
              <DataCell label="Assignee">
                {locked ? (
                  <span className="text-sm">{each.assignee}</span>
                ) : (
                  <Input
                    aria-label={`Assignee: ${each.task}`}
                    value={each.assignee}
                    className="h-12 bg-background"
                    onChange={(event) =>
                      setCheck(index, { assignee: event.target.value })
                    }
                  />
                )}
              </DataCell>
              <DataCell label="Status">
                <SegmentedChoice
                  label={`Status: ${each.task}`}
                  value={each.status}
                  choices={[
                    { value: DONE, tone: "good" },
                    { value: "Not done", tone: "bad" },
                  ]}
                  disabled={locked}
                  onChange={(status) => setCheck(index, { status })}
                />
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </TableBox>
      <TableBox title="Notes">
        <div className="p-4">
          {locked ? (
            <p className="text-sm break-words whitespace-pre-line">
              {notes || "-"}
            </p>
          ) : (
            <Textarea
              aria-label="Notes"
              value={notes}
              className="min-h-24 bg-background"
              onChange={(event) => edit({ notes: event.target.value })}
            />
          )}
        </div>
      </TableBox>
      {(canWrite || sheet.footLine) && (
        <SheetActions message={sheet.footLine}>
          {canWrite && (
            <>
              <div className="flex flex-col gap-2 @md:items-end">
                <ActionButton
                  variant={saved.inviteSentAt ? "outline" : "default"}
                  disabled={pending || toInvite.length > 0}
                  onClick={() =>
                    run(
                      () => sendInvite({ recordId: stepId() }),
                      "Invite sent."
                    )
                  }
                >
                  Send calendar invite
                </ActionButton>
                {toInvite.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Send calendar invite needs: {toInvite.join("; ")}.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 @md:items-end">
                <ActionButton
                  disabled={pending || toBeReady.length > 0}
                  onClick={() =>
                    run(() => ready({ recordId: stepId() }), "Ready.")
                  }
                >
                  Ready for the meeting
                </ActionButton>
                {toBeReady.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ready for the meeting needs: {toBeReady.join("; ")}.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetActions>
      )}
      {sheet.stale && (
        <div
          role="alert"
          className="flex flex-col gap-3 border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-destructive">{STALE}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      )}
    </div>
  )
}
