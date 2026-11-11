import { CheckIcon, XIcon } from "@phosphor-icons/react/ssr"

// D1.4's delivery status as a result chip: soft orange with a tick once
// Delivered, red with a cross once Bounced, grey while only Sent. The words
// are the status itself, with "Email" before them for a screen reader.
export function DeliveryChip({ status }: { status: string }) {
  const tone =
    status === "Delivered" ? "good" : status === "Bounced" ? "bad" : undefined

  return (
    <span data-tone={tone} className="result-chip">
      {tone === "good" && (
        <CheckIcon aria-hidden weight="bold" className="size-3.5" />
      )}
      {tone === "bad" && (
        <XIcon aria-hidden weight="bold" className="size-3.5" />
      )}
      <span className="sr-only">Email </span>
      {status}
    </span>
  )
}
