"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { ActionButton } from "@/components/sheet-actions"

type Result =
  | { status: "done"; recordId: string; updatedAt: string }
  | { status: "invalid"; errors: { message: string }[] }
  | { status: "stale" }
  | { status: "error"; message: string }

type Props = {
  recordId?: string
  // What still stops each step, in words; empty when it can go.
  toSend: string[]
  toInvite: string[]
  sentToClientAt?: string
  inviteSentAt?: string
  sendTimes: (values: { recordId: string }) => Promise<Result>
  sendInvite: (values: { recordId: string }) => Promise<Result>
}

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

// D1.13's meeting steps for the Lead Engineer: send the saved times to the
// client, then, once they have chosen, send the calendar invite.
export function AlignmentMeetingActions({
  recordId,
  toSend,
  toInvite,
  sentToClientAt,
  inviteSentAt,
  sendTimes,
  sendInvite,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()

  function run(
    step: (values: { recordId: string }) => Promise<Result>,
    said: string
  ) {
    if (!recordId) {
      return
    }

    setMessage(undefined)
    startTransition(async () => {
      const result = await step({ recordId })

      if (result.status === "done") {
        setMessage(said)
        router.refresh()
      } else if (result.status === "error") {
        setMessage(result.message)
      } else if (result.status === "invalid") {
        setMessage(result.errors.map((each) => each.message).join("; "))
      } else {
        setMessage("Reload and try again.")
      }
    })
  }

  const unsaved = recordId ? [] : ["save the draft"]

  return (
    <section
      aria-label="Alignment meeting"
      className="flex flex-col gap-4 border border-foreground/20 p-4"
    >
      <h2 className="text-base font-medium">Alignment meeting</h2>
      <div className="flex flex-col gap-2">
        <ActionButton
          variant="secondary"
          disabled={pending || unsaved.length + toSend.length > 0}
          onClick={() => run(sendTimes, "Times sent.")}
        >
          Send times to client
        </ActionButton>
        {sentToClientAt && (
          <p className="text-sm">
            Times sent {when.format(new Date(sentToClientAt))}
          </p>
        )}
        {[...unsaved, ...toSend].length > 0 && (
          <p className="text-sm text-muted-foreground">
            Send times to client needs: {[...unsaved, ...toSend].join("; ")}.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <ActionButton
          disabled={pending || unsaved.length + toInvite.length > 0}
          onClick={() => run(sendInvite, "Invite sent.")}
        >
          Send calendar invite
        </ActionButton>
        {inviteSentAt && (
          <p className="text-sm">
            Invite sent {when.format(new Date(inviteSentAt))}
          </p>
        )}
        {[...unsaved, ...toInvite].length > 0 && (
          <p className="text-sm text-muted-foreground">
            Send calendar invite needs: {[...unsaved, ...toInvite].join("; ")}.
          </p>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
