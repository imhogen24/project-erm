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
  recordId: string
  request: (values: { recordId: string; reason: string }) => Promise<Result>
}

// The button on a locked record that opens a box asking why it needs to change.
// An empty reason is refused here without sending anything, and the server
// checks it again.
export function RequestChange({ recordId, request }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  function send() {
    if (reason.trim() === "") {
      setMessage("Enter a reason.")

      return
    }

    setMessage(undefined)
    startTransition(async () => {
      const result = await request({ recordId, reason })

      if (result.status === "error") {
        setMessage(result.message)

        return
      }

      setOpen(false)
      setReason("")
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background text-foreground hover:bg-background/80 hover:text-foreground"
        >
          Request a change
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4"
      >
        <FieldLabel htmlFor={`reason-${recordId}`} className="text-sm">
          Reason for the change
        </FieldLabel>
        <Textarea
          id={`reason-${recordId}`}
          value={reason}
          aria-invalid={message ? true : undefined}
          className="min-h-24 border-foreground/20 bg-background text-base md:text-base"
          onChange={(event) => setReason(event.target.value)}
        />
        {message && <FieldError role="alert">{message}</FieldError>}
        <div className="flex gap-2">
          <Button type="button" disabled={pending} onClick={send}>
            Send request
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
