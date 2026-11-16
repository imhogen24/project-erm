"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { ActionButton } from "@/components/sheet-actions"

type Result =
  | { status: "done" }
  | { status: "invalid" }
  | { status: "stale" }
  | { status: "error"; message: string }

type Props = {
  recordId: string
  withdraw: (values: { recordId: string }) => Promise<Result>
}

// The submitter's Withdraw while the record waits for approval. It asks first,
// in the row of buttons, and on Yes the record is a draft again.
export function WithdrawRecord({ recordId, withdraw }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState<string>()

  function confirm() {
    setMessage(undefined)
    startTransition(async () => {
      const result = await withdraw({ recordId })

      if (result.status === "done") {
        setAsking(false)
        router.refresh()

        return
      }

      setMessage(
        result.status === "error" ? result.message : "Reload and try again."
      )
    })
  }

  if (!asking) {
    return (
      <ActionButton variant="secondary" onClick={() => setAsking(true)}>
        Withdraw
      </ActionButton>
    )
  }

  return (
    <div
      role="group"
      aria-label="Withdraw"
      className="flex flex-col gap-3 @md:flex-row @md:items-center"
    >
      <p className="text-sm font-medium">Take this back to fix it?</p>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <ActionButton
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setAsking(false)
          setMessage(undefined)
        }}
      >
        Cancel
      </ActionButton>
      <ActionButton disabled={pending} onClick={confirm}>
        Yes, withdraw
      </ActionButton>
    </div>
  )
}
