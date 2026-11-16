"use client"

import { useState } from "react"

import { ActionButton } from "@/components/sheet-actions"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// Why the approver sent the draft back, shown to the writer above the sheet.
export function SentBackNotice({ reason }: { reason?: string }) {
  if (!reason) {
    return null
  }

  return (
    <div role="status" data-tone="error" className="note-panel text-sm">
      <p className="font-medium">Sent back for changes</p>
      <p className="whitespace-pre-wrap">{reason}</p>
    </div>
  )
}

// The approver's button beside Approve. It opens and closes the reason form.
export function SendBackButton({
  open,
  disabled,
  onToggle,
}: {
  open: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <ActionButton
      variant="secondary"
      disabled={disabled}
      aria-expanded={open}
      onClick={onToggle}
    >
      Send back
    </ActionButton>
  )
}

// The approver says what needs changing and sends the record back with it.
// It holds the reason until it is closed, or the record has gone back and the
// screen no longer shows it.
export function SendBackForm({
  pending,
  onSend,
  onCancel,
}: {
  pending: boolean
  onSend: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState("")

  return (
    <form
      className="flex flex-col gap-3 border border-foreground/20 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSend(reason)
      }}
    >
      <Label htmlFor="send-back-reason">What needs changing?</Label>
      <Textarea
        id="send-back-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        required
      />
      <div className="flex flex-col gap-3 @md:flex-row @md:justify-end">
        <ActionButton variant="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={pending || reason.trim() === ""}>
          Send back to the writer
        </ActionButton>
      </div>
    </form>
  )
}
