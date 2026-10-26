"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

type Result = { status: "done" } | { status: "error"; message: string }

type Props = {
  requestId: string
  decide: (values: {
    requestId: string
    outcome: "approved" | "rejected"
    reason: string
  }) => Promise<Result>
}

// Approve and Reject for one waiting request. Rejecting asks for a reason
// first; an empty one is refused here without sending anything, and the
// server checks it again.
export function DecideChange({ requestId, decide }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  function send(outcome: "approved" | "rejected") {
    if (outcome === "rejected" && reason.trim() === "") {
      setMessage("Enter a reason for rejecting.")

      return
    }

    setMessage(undefined)
    startTransition(async () => {
      const result = await decide({ requestId, outcome, reason })

      if (result.status === "error") {
        setMessage(result.message)

        return
      }

      setOpen(false)
      setReason("")
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-10 px-5 text-sm"
          disabled={pending}
          onClick={() => send("approved")}
        >
          Approve
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-10 bg-foreground/10 px-5 text-sm hover:bg-foreground/20"
              disabled={pending}
            >
              Reject
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4"
          >
            <FieldLabel htmlFor={`rejection-${requestId}`} className="text-sm">
              Reason for rejecting
            </FieldLabel>
            <Textarea
              id={`rejection-${requestId}`}
              value={reason}
              aria-invalid={open && message ? true : undefined}
              className="min-h-24 border-foreground/20 bg-background text-base md:text-base"
              onChange={(event) => setReason(event.target.value)}
            />
            {open && message && <FieldError role="alert">{message}</FieldError>}
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => send("rejected")}
              >
                Reject request
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {!open && message && <FieldError role="alert">{message}</FieldError>}
    </div>
  )
}
