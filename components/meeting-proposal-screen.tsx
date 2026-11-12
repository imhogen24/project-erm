"use client"

import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { DatePicker } from "@/components/date-picker"
import { SegmentedChoice } from "@/components/segmented-choice"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  IN_PERSON,
  clientProposal,
  meetingPlatforms,
  missingToConfirm,
  missingToSendTimes,
  schedulingEmail,
  slotStatus,
  type MeetingProposal,
  type Slot,
} from "@/lib/meeting-proposal"
import {
  DEFAULT_ZONE,
  formatMeeting,
  meetingInstant,
  meetingZones,
  sheetDate,
  zoneLabel,
} from "@/lib/meeting-time"
import type { FieldError, FormValues } from "@/lib/tool-definition"

type Result =
  | { status: "done"; recordId: string; updatedAt: string }
  | {
      status: "invalid"
      errors: FieldError[]
      recordId?: string
      updatedAt?: string
    }
  | { status: "stale" }
  | { status: "error"; message: string }

type Save = {
  projectId: string
  toolId: string
  cycle: number
  values: FormValues
  expectedUpdatedAt?: string
}

type Props = {
  projectId: string
  cycle: number
  recordId?: string
  updatedAt?: string
  saved: MeetingProposal
  // What the scheduling email is written from.
  context: { contact: string; title: string; requestId: string }
  canWrite: boolean
  save: (values: Save) => Promise<Result>
  sendTimes: (values: { recordId: string }) => Promise<Result>
  confirm: (values: { recordId: string }) => Promise<Result>
}

type Details = {
  platform: string
  meetingLink: string
  calendarInviteSent: boolean | undefined
  note: string
}

const editWidths =
  "minmax(0,calc(100%/var(--page-columns,5))) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.4fr) auto"

const sentWidths =
  "minmax(0,calc(100%/var(--page-columns,5))) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)"

const detailWidths = "minmax(0,calc(100%/var(--page-columns,5))) minmax(0,1fr)"

const STALE = "Someone else saved this record. Reload to see their changes."

const emptySlot: Slot = { date: "", time: "", timeZone: DEFAULT_ZONE }

function StatusChip({ status }: { status: ReturnType<typeof slotStatus> }) {
  if (status === "Pending") {
    return (
      <span data-open="true" className="status-chip self-start">
        Pending
      </span>
    )
  }

  return (
    <span
      data-tone={status === "Accepted" ? "good" : undefined}
      className="result-chip self-start"
    >
      {status === "Accepted" ? (
        <CheckIcon aria-hidden className="size-3.5" />
      ) : (
        <XIcon aria-hidden className="size-3.5" />
      )}
      {status}
    </span>
  )
}

// "11/08/2026" and "14:00 GMT", as the sheet writes them.
function slotTime(slot: Slot) {
  return `${slot.time.slice(0, 5)} ${zoneLabel(slot.timeZone)}`
}

// D1.5 for the IMHOGEN team. The OM proposes times, which save by themselves,
// and sends them; the client answers on their dashboard; the OM fills in the
// platform and link and confirms, which locks D1.5. Everyone else reads it.
// The server decides every rule; this shows what still stops each step.
export function MeetingProposalScreen({
  projectId,
  cycle,
  recordId: savedRecordId,
  updatedAt: savedUpdatedAt,
  saved,
  context,
  canWrite,
  save,
  sendTimes,
  confirm,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const sent = saved.sentToClientAt !== undefined

  const [slots, setSlots] = useState<Slot[]>(
    saved.slots.length > 0 ? saved.slots : [emptySlot]
  )

  const [details, setDetails] = useState<Details>({
    platform: saved.platform ?? "",
    meetingLink: saved.meetingLink ?? "",
    calendarInviteSent: saved.calendarInviteSent,
    note: saved.note ?? "",
  })

  // Before the first send the times are always open to edit. Once sent, the
  // OM opens them again with Change the times.
  const [editing, setEditing] = useState(!sent)
  const [seenSent, setSeenSent] = useState(saved.sentToClientAt)

  if (seenSent !== saved.sentToClientAt) {
    setSeenSent(saved.sentToClientAt)
    setEditing(!saved.sentToClientAt)
  }

  const [recordId, setRecordId] = useState(savedRecordId)
  const [updatedAt, setUpdatedAt] = useState(savedUpdatedAt)
  const [seen, setSeen] = useState({ id: savedRecordId, at: savedUpdatedAt })

  if (seen.id !== savedRecordId || seen.at !== savedUpdatedAt) {
    setSeen({ id: savedRecordId, at: savedUpdatedAt })
    setRecordId(savedRecordId)
    setUpdatedAt(savedUpdatedAt)
  }

  const [message, setMessage] = useState<string>()
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle")
  const [stale, setStale] = useState(false)

  // Saves follow each other faster than the screen renders, so the newest
  // record and time are held in a ref, and an edit made during a save is
  // saved right after it.
  const latest = useRef({ recordId, updatedAt })
  const busy = useRef(false)
  const queued = useRef<FormValues | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!busy.current) {
      latest.current = { recordId, updatedAt }
    }
  }, [recordId, updatedAt])

  useEffect(() => () => clearTimeout(timer.current), [])

  function valuesOf(rows: Slot[], held: Details): FormValues {
    return {
      slots: rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([, value]) => value !== "")
        )
      ),
      ...(held.platform !== "" && { platform: held.platform }),
      ...(held.meetingLink.trim() !== "" && {
        meetingLink: held.meetingLink.trim(),
      }),
      ...(held.calendarInviteSent !== undefined && {
        calendarInviteSent: held.calendarInviteSent,
      }),
      ...(held.note.trim() !== "" && { note: held.note }),
    }
  }

  // Saves the values, then anything typed while that save was on its way.
  // True only when everything typed is saved. A failure drops what was
  // queued: the next edit saves the whole sheet again, so nothing is lost,
  // and an older copy is never saved over a newer one.
  async function autosave(values: FormValues): Promise<boolean> {
    if (busy.current) {
      queued.current = values

      return false
    }

    busy.current = true
    setSaving("saving")

    function failed(line: string) {
      queued.current = null
      setSaving("idle")
      setMessage(line)
    }

    try {
      let next: FormValues | null = values

      while (next) {
        const result = await save({
          projectId,
          toolId: "D1.5",
          cycle,
          values: next,
          expectedUpdatedAt: latest.current.updatedAt,
        })

        next = null

        if (result.status === "done") {
          latest.current = {
            recordId: result.recordId,
            updatedAt: result.updatedAt,
          }
          setRecordId(result.recordId)
          setUpdatedAt(result.updatedAt)
          setSaving("saved")
          setMessage(undefined)
          next = queued.current
          queued.current = null
        } else if (result.status === "stale") {
          setStale(true)
          failed("Not saved. Someone else saved this record.")

          return false
        } else if (result.status === "invalid") {
          failed(
            `Not saved: ${result.errors.map((error) => error.message).join("; ")}`
          )

          return false
        } else {
          failed(`Not saved. ${result.message}`)

          return false
        }
      }

      return true
    } catch {
      failed("Not saved. The connection failed.")

      return false
    } finally {
      busy.current = false
    }
  }

  // Waits for a save on its way, then saves what is on screen now.
  async function saveNow(values: FormValues): Promise<boolean> {
    while (busy.current) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    queued.current = null

    return autosave(values)
  }

  function changed(rows: Slot[], held: Details) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void autosave(valuesOf(rows, held)), 600)
  }

  function setSlot(index: number, change: Partial<Slot>) {
    const rows = slots.map((row, at) =>
      at === index ? { ...row, ...change } : row
    )

    setSlots(rows)
    changed(rows, details)
  }

  function setRows(rows: Slot[]) {
    setSlots(rows)
    changed(rows, details)
  }

  function setDetail(change: Partial<Details>) {
    const held = { ...details, ...change }

    setDetails(held)
    changed(slots, held)
  }

  function run(step: () => Promise<Result>, saidDone: string) {
    clearTimeout(timer.current)
    setMessage(undefined)
    startTransition(async () => {
      // What was typed is saved first, so the step reads it. When that save
      // fails, the step does not run: it would read an older copy.
      if (canWrite && !(await saveNow(valuesOf(slots, details)))) {
        return
      }

      const result = await step()

      if (result.status === "done") {
        setRecordId(result.recordId)
        setUpdatedAt(result.updatedAt)
        setMessage(saidDone)
        router.refresh()

        return
      }

      if (result.status === "stale") {
        setStale(true)

        return
      }

      setMessage(
        result.status === "invalid"
          ? result.errors.map((error) => error.message).join("; ")
          : result.message
      )
    })
  }

  const current: MeetingProposal = {
    ...saved,
    slots,
    platform: details.platform || undefined,
    meetingLink: details.meetingLink || undefined,
  }

  const toSend = missingToSendTimes(current)
  const toConfirm = missingToConfirm(current)
  const proposed = clientProposal(saved)
  const chosen = saved.chosenSlot !== undefined
  const locked = !canWrite

  const preview =
    editing || !saved.emailText
      ? schedulingEmail(
          context,
          slots.filter((row) => row.date && row.time && row.timeZone)
        )
      : saved.emailText

  const agreed =
    saved.agreedDate && saved.agreedTime && saved.agreedTimeZone
      ? meetingInstant(saved.agreedDate, saved.agreedTime, saved.agreedTimeZone)
      : undefined

  const proposedAt = proposed
    ? meetingInstant(proposed.date, proposed.time, proposed.timeZone)
    : undefined

  let footLine = message

  if (!footLine && saving === "saving") {
    footLine = "Saving…"
  } else if (!footLine && saving === "saved") {
    footLine = "✓ Saved"
  }

  return (
    <div data-final={locked} className="flex flex-col gap-8">
      <TableBox title="1.0 Proposed meeting times">
        {canWrite && editing ? (
          <>
            <DataTable
              label="Proposed meeting times"
              columns={["Slot No.", "Date", "Time", "Time zone", ""]}
              widths={editWidths}
            >
              {slots.map((slot, index) => (
                <DataRow key={index} widths={editWidths}>
                  <DataCell label="Slot No.">
                    <span className="text-sm font-medium tabular-nums">
                      {index + 1}
                    </span>
                  </DataCell>
                  <DataCell label="Date">
                    <label htmlFor={`slot-${index}-date`} className="sr-only">
                      Slot {index + 1} date
                    </label>
                    <DatePicker
                      id={`slot-${index}-date`}
                      value={slot.date}
                      onChange={(date) => setSlot(index, { date })}
                    />
                  </DataCell>
                  <DataCell label="Time">
                    <Input
                      type="time"
                      aria-label={`Slot ${index + 1} time`}
                      value={slot.time.slice(0, 5)}
                      className="h-12 bg-background"
                      onChange={(event) =>
                        setSlot(index, { time: event.target.value })
                      }
                    />
                  </DataCell>
                  <DataCell label="Time zone">
                    <Select
                      value={slot.timeZone}
                      onValueChange={(timeZone) => setSlot(index, { timeZone })}
                    >
                      <SelectTrigger
                        aria-label={`Slot ${index + 1} time zone`}
                        className="h-12 w-full bg-background"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meetingZones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DataCell>
                  <DataCell label="">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove slot ${index + 1}`}
                      disabled={slots.length === 1}
                      onClick={() =>
                        setRows(slots.filter((_, at) => at !== index))
                      }
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </DataCell>
                </DataRow>
              ))}
            </DataTable>
            <div className="border-t border-foreground/20 p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRows([
                    ...slots,
                    {
                      ...emptySlot,
                      timeZone: slots.at(-1)?.timeZone ?? DEFAULT_ZONE,
                    },
                  ])
                }
              >
                <PlusIcon aria-hidden />
                Add a time
              </Button>
            </div>
          </>
        ) : saved.offeredSlots.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No times proposed yet.
          </p>
        ) : (
          <DataTable
            label="Proposed meeting times"
            columns={[
              "Slot No.",
              "Date",
              "Time (Zone)",
              "Status",
              "Client comments",
            ]}
            widths={sentWidths}
          >
            {saved.offeredSlots.map((slot, index) => (
              <DataRow key={index} widths={sentWidths}>
                <DataCell label="Slot No.">
                  <span className="text-sm font-medium tabular-nums">
                    {index + 1}
                  </span>
                </DataCell>
                <DataCell label="Date">
                  <span className="text-sm tabular-nums">
                    {sheetDate(slot.date)}
                  </span>
                </DataCell>
                <DataCell label="Time (Zone)">
                  <span className="text-sm tabular-nums">{slotTime(slot)}</span>
                </DataCell>
                <DataCell label="Status">
                  <StatusChip status={slotStatus(saved, index + 1)} />
                </DataCell>
                <DataCell label="Client comments">
                  <span className="text-sm break-words">
                    {saved.chosenSlot === index + 1
                      ? (saved.clientComment ?? "")
                      : ""}
                  </span>
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        )}
        {proposed && (
          <div className="flex flex-col gap-3 border-t border-foreground/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium">
                The client proposed{" "}
                {proposedAt
                  ? `${formatMeeting(proposedAt, proposed.timeZone)} ${zoneLabel(proposed.timeZone)}`
                  : `${proposed.date} ${proposed.time}`}
              </p>
              {saved.clientComment && (
                <p className="text-sm break-words text-muted-foreground">
                  {saved.clientComment}
                </p>
              )}
            </div>
            {canWrite && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  setEditing(true)
                  setRows([
                    ...slots.filter((row) => row.date || row.time),
                    {
                      date: proposed.date,
                      time: proposed.time,
                      timeZone: meetingZones.some(
                        (zone) => zone.id === proposed.timeZone
                      )
                        ? proposed.timeZone
                        : DEFAULT_ZONE,
                    },
                  ])
                }}
              >
                <PlusIcon aria-hidden />
                Add as a time
              </Button>
            )}
          </div>
        )}
      </TableBox>
      <TableBox title="3.0 Standard scheduling email">
        <p className="px-4 py-4 text-sm leading-relaxed break-words whitespace-pre-line">
          {preview}
        </p>
      </TableBox>
      <TableBox title="4.0 Final meeting confirmation">
        <DataTable
          label="Final meeting confirmation"
          columns={["Field", "Answer"]}
          widths={detailWidths}
        >
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Agreed Date</span>
            </DataCell>
            <DataCell label="Answer">
              <span className="text-sm tabular-nums">
                {saved.agreedDate ? sheetDate(saved.agreedDate) : "-"}
              </span>
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Agreed Time</span>
            </DataCell>
            <DataCell label="Answer">
              <span className="text-sm tabular-nums">
                {agreed && saved.agreedTimeZone
                  ? slotTime({
                      date: saved.agreedDate ?? "",
                      time: saved.agreedTime ?? "",
                      timeZone: saved.agreedTimeZone,
                    })
                  : "-"}
              </span>
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">
                Meeting Platform/Location
              </span>
            </DataCell>
            <DataCell label="Answer">
              {locked ? (
                <span className="text-sm">{details.platform || "-"}</span>
              ) : (
                <Select
                  value={details.platform}
                  onValueChange={(platform) => setDetail({ platform })}
                >
                  <SelectTrigger
                    aria-label="Meeting Platform/Location"
                    className="h-12 w-full bg-background"
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {meetingPlatforms.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {platform}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </DataCell>
          </DataRow>
          {details.platform !== IN_PERSON && (
            <DataRow widths={detailWidths}>
              <DataCell label="Field">
                <span className="text-sm font-medium">Direct Meeting Link</span>
              </DataCell>
              <DataCell label="Answer">
                {locked ? (
                  details.meetingLink ? (
                    <a
                      href={details.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm break-all underline underline-offset-4"
                    >
                      {details.meetingLink}
                    </a>
                  ) : (
                    <span className="text-sm">-</span>
                  )
                ) : (
                  <Input
                    type="url"
                    aria-label="Direct Meeting Link"
                    placeholder="https://"
                    value={details.meetingLink}
                    className="h-12 bg-background"
                    onChange={(event) =>
                      setDetail({ meetingLink: event.target.value })
                    }
                  />
                )}
              </DataCell>
            </DataRow>
          )}
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Calendar Invite Sent?</span>
            </DataCell>
            <DataCell label="Answer">
              <SegmentedChoice
                label="Calendar Invite Sent?"
                value={
                  details.calendarInviteSent === undefined
                    ? ""
                    : details.calendarInviteSent
                      ? "Yes"
                      : "No"
                }
                choices={[
                  { value: "Yes", tone: "good" },
                  { value: "No", tone: "bad" },
                ]}
                disabled={locked}
                onChange={(value) =>
                  setDetail({
                    calendarInviteSent:
                      value === "" ? undefined : value === "Yes",
                  })
                }
              />
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Client Confirmed?</span>
            </DataCell>
            <DataCell label="Answer">
              <span className="text-sm">
                {saved.clientConfirmed ? "Yes" : "No"}
              </span>
            </DataCell>
          </DataRow>
          <DataRow widths={detailWidths}>
            <DataCell label="Field">
              <span className="text-sm font-medium">Note</span>
            </DataCell>
            <DataCell label="Answer">
              {locked ? (
                <span className="text-sm break-words whitespace-pre-line">
                  {details.note || "-"}
                </span>
              ) : (
                <Textarea
                  aria-label="Note"
                  value={details.note}
                  className="min-h-16 bg-background"
                  onChange={(event) => setDetail({ note: event.target.value })}
                />
              )}
            </DataCell>
          </DataRow>
        </DataTable>
      </TableBox>
      {(canWrite || footLine) && (
        <SheetActions message={footLine}>
          {canWrite && editing && (
            <div className="flex flex-col gap-2 @md:items-end">
              <ActionButton
                disabled={pending || toSend.length > 0}
                onClick={() =>
                  run(
                    () => sendTimes({ recordId: latest.current.recordId! }),
                    "Sent."
                  )
                }
              >
                Send to client
              </ActionButton>
              {toSend.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Send to client needs: {toSend.join("; ")}.
                </p>
              )}
            </div>
          )}
          {canWrite && !editing && (
            <>
              <ActionButton
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setSlots(
                    saved.offeredSlots.length > 0 ? saved.offeredSlots : slots
                  )
                  setEditing(true)
                }}
              >
                Change the times
              </ActionButton>
              <div className="flex flex-col gap-2 @md:items-end">
                <ActionButton
                  disabled={pending || toConfirm.length > 0 || !chosen}
                  onClick={() =>
                    run(
                      () => confirm({ recordId: latest.current.recordId! }),
                      "Confirmed."
                    )
                  }
                >
                  Confirm meeting
                </ActionButton>
                {toConfirm.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Confirm meeting needs: {toConfirm.join("; ")}.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetActions>
      )}
      {stale && (
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
