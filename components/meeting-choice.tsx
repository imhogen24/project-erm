"use client"

import { CheckIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore, useTransition } from "react"

import { DatePicker } from "@/components/date-picker"
import { TimeInput } from "@/components/time-input"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import { TableBox } from "@/components/sheet-table"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
  type MeetingProposal,
  type Slot,
} from "@/lib/meeting-proposal"
import {
  DEFAULT_ZONE,
  formatMeeting,
  meetingInstant,
  meetingZones,
  zoneLabel,
} from "@/lib/meeting-time"

type Result =
  | { status: "done"; recordId: string; updatedAt: string }
  | { status: "invalid"; errors: { message: string }[] }
  | { status: "stale" }
  | { status: "error"; message: string }

type Props = {
  recordId?: string
  saved: MeetingProposal
  // Confirmed by the OM: the meeting is fixed.
  locked: boolean
  // The project is running, so the client can still answer.
  open: boolean
  choose: (values: {
    recordId: string
    slot: number
    comment?: string
  }) => Promise<Result>
  propose: (values: {
    recordId: string
    date: string
    time: string
    timeZone: string
    comment?: string
  }) => Promise<Result>
}

function noChange() {
  return () => {}
}

// The zone the client's browser is in. Empty on the server, which cannot know.
function useLocalZone(): string | undefined {
  return useSyncExternalStore(
    noChange,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined
  )
}

// A time as IMHOGEN set it, and under it the client's own clock when that
// reads differently.
function When({ slot, localZone }: { slot: Slot; localZone?: string }) {
  const at = meetingInstant(slot.date, slot.time, slot.timeZone)

  if (!at) {
    return <span className="text-sm">{`${slot.date} ${slot.time}`}</span>
  }

  const theirs = formatMeeting(at, slot.timeZone)
  const yours = localZone ? formatMeeting(at, localZone) : theirs

  // Only the clock when it is the same day for the client.
  const dayOf = (text: string) => text.slice(0, text.lastIndexOf(", "))
  const yourClock = yours.slice(yours.lastIndexOf(", ") + 2)
  const shown = dayOf(theirs) === dayOf(yours) ? yourClock : yours

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium tabular-nums">
        {theirs} {zoneLabel(slot.timeZone)}
      </span>
      {yours !== theirs && (
        <span className="text-sm text-muted-foreground tabular-nums">
          {shown} your time
        </span>
      )}
    </span>
  )
}

// D1.5 on the client's dashboard: choose one of the times IMHOGEN sent, or
// propose another. Once the OM confirms, it shows the meeting.
export function MeetingChoice({
  recordId,
  saved,
  locked,
  open,
  choose,
  propose,
}: Props) {
  const router = useRouter()
  const localZone = useLocalZone()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()

  const [picked, setPicked] = useState(
    saved.chosenSlot !== undefined ? String(saved.chosenSlot) : ""
  )

  const [comment, setComment] = useState(saved.clientComment ?? "")
  const [proposing, setProposing] = useState(false)

  const [own, setOwn] = useState({ date: "", time: "", timeZone: "" })

  const proposed = clientProposal(saved)
  const ownZone = own.timeZone || localZone || DEFAULT_ZONE

  const zones = [
    ...(localZone && !meetingZones.some((zone) => zone.id === localZone)
      ? [{ id: localZone, label: zoneLabel(localZone) }]
      : []),
    ...meetingZones,
  ]

  function run(step: () => Promise<Result>, saidDone: string) {
    setMessage(undefined)
    startTransition(async () => {
      const result = await step()

      if (result.status === "done") {
        setMessage(saidDone)
        setProposing(false)
        router.refresh()

        return
      }

      setMessage(
        result.status === "invalid"
          ? result.errors.map((error) => error.message).join("; ")
          : result.status === "stale"
            ? "Reload and try again."
            : result.message
      )
    })
  }

  if (locked && saved.agreedDate && saved.agreedTime && saved.agreedTimeZone) {
    return (
      <TableBox title="Your discovery meeting">
        <div className="flex flex-col gap-4 px-4 py-4">
          <When
            slot={{
              date: saved.agreedDate,
              time: saved.agreedTime,
              timeZone: saved.agreedTimeZone,
            }}
            localZone={localZone}
          />
          {saved.platform && <p className="text-sm">{saved.platform}</p>}
          {saved.platform !== IN_PERSON && saved.meetingLink && (
            <Button asChild className="h-12 w-full px-8 sm:w-fit">
              <a
                href={saved.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join the meeting
              </a>
            </Button>
          )}
        </div>
      </TableBox>
    )
  }

  if (!recordId || saved.offeredSlots.length === 0) {
    return (
      <TableBox title="Meeting times">
        <p className="px-4 py-4 text-sm text-muted-foreground">No times yet.</p>
      </TableBox>
    )
  }

  const unchanged =
    picked === String(saved.chosenSlot ?? "") &&
    comment === (saved.clientComment ?? "")

  return (
    <div className="flex flex-col gap-8">
      <TableBox title="Choose a time for your discovery meeting">
        <div className="flex flex-col gap-5 px-4 py-4">
          <RadioGroup
            aria-label="Meeting times"
            value={picked}
            disabled={!open || pending}
            className="grid gap-3 md:grid-cols-2"
            onValueChange={setPicked}
          >
            {saved.offeredSlots.map((slot, index) => (
              <label
                key={index}
                htmlFor={`slot-${index + 1}`}
                className="tile-choice"
              >
                <RadioGroupItem
                  value={String(index + 1)}
                  id={`slot-${index + 1}`}
                  aria-label={`Option ${index + 1}`}
                  className="mt-0.5"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <When slot={slot} localZone={localZone} />
                  {saved.chosenSlot === index + 1 && (
                    <span data-tone="good" className="result-chip">
                      <CheckIcon aria-hidden className="size-3.5" />
                      Your choice
                    </span>
                  )}
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="meeting-comment" className="text-sm">
              Comment
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Textarea
              id="meeting-comment"
              value={comment}
              disabled={!open || pending}
              className="min-h-16 bg-background"
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          {proposed && (
            <p role="status" className="note-panel text-sm">
              You proposed <When slot={proposed} localZone={localZone} />
            </p>
          )}
        </div>
      </TableBox>
      {proposing && (
        <TableBox title="Propose another time">
          <div className="grid gap-5 px-4 py-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="own-date" className="text-sm">
                Date
              </FieldLabel>
              <DatePicker
                id="own-date"
                value={own.date}
                onChange={(date) => setOwn({ ...own, date })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="own-time" className="text-sm">
                Time
              </FieldLabel>
              <TimeInput
                id="own-time"
                value={own.time}
                onChange={(event) =>
                  setOwn({ ...own, time: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="own-zone" className="text-sm">
                Time zone
              </FieldLabel>
              <Select
                value={ownZone}
                onValueChange={(timeZone) => setOwn({ ...own, timeZone })}
              >
                <SelectTrigger
                  id="own-zone"
                  className="h-12 w-full bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TableBox>
      )}
      {open && (
        <SheetActions message={message}>
          {proposing ? (
            <>
              <ActionButton
                variant="outline"
                disabled={pending}
                onClick={() => setProposing(false)}
              >
                Back to the times
              </ActionButton>
              <ActionButton
                disabled={pending || !own.date || !own.time}
                onClick={() =>
                  run(
                    () =>
                      propose({
                        recordId,
                        date: own.date,
                        time: own.time,
                        timeZone: ownZone,
                        comment,
                      }),
                    "Proposed."
                  )
                }
              >
                Propose this time
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                variant="outline"
                disabled={pending}
                onClick={() => setProposing(true)}
              >
                None of these suit me
              </ActionButton>
              <ActionButton
                disabled={pending || picked === "" || unchanged}
                onClick={() =>
                  run(
                    () => choose({ recordId, slot: Number(picked), comment }),
                    "Chosen."
                  )
                }
              >
                Choose this time
              </ActionButton>
            </>
          )}
        </SheetActions>
      )}
    </div>
  )
}
