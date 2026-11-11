"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { ActionButton } from "@/components/sheet-actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Result =
  | { status: "done" }
  | { status: "invalid"; errors: { field: string; message: string }[] }
  | { status: "stale" }
  | { status: "error"; message: string }

// The PM's box on D1.4 after a bounce: correct the client's address and send
// the same email again. A refusal shows beside the button in the server's
// words.
export function RetryEmail({
  recordId,
  sentTo,
  heading,
  retry,
}: {
  recordId: string
  sentTo: string
  heading: string
  retry: (values: { recordId: string; sentTo: string }) => Promise<Result>
}) {
  const router = useRouter()
  const id = useId()
  const [address, setAddress] = useState(sentTo)
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  function send() {
    setMessage(undefined)
    startTransition(async () => {
      let result: Result

      try {
        result = await retry({ recordId, sentTo: address })
      } catch {
        // The email may have gone before the connection dropped, so the page
        // shows what happened before anyone presses again.
        setMessage(
          "Retry did not finish. Reload the page to see whether the email was sent."
        )

        return
      }

      if (result.status === "done") {
        setMessage("Sent.")
        router.refresh()

        return
      }

      if (result.status === "invalid") {
        setMessage(result.errors.map((error) => error.message).join(" "))

        return
      }

      setMessage(
        result.status === "stale"
          ? "This email changed while you were here. Reload the page."
          : result.message
      )
    })
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      data-tone="error"
      className="note-panel flex flex-col gap-4"
    >
      <p id={`${id}-heading`} className="text-sm font-medium">
        {heading}
      </p>
      <div className="flex flex-col gap-3 @md:flex-row @md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-sent-to`}>Sent To (Client Email)</Label>
          <Input
            id={`${id}-sent-to`}
            type="email"
            autoComplete="off"
            value={address}
            disabled={pending}
            onChange={(event) => setAddress(event.target.value)}
            className="h-[var(--control-height)] bg-background"
          />
        </div>
        <ActionButton
          disabled={pending || address.trim() === ""}
          onClick={send}
        >
          Retry
        </ActionButton>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
