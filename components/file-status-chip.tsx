import { CheckIcon } from "@phosphor-icons/react/ssr"

// A file's status as a chip, the same shape as the state badge: soft orange
// with a tick once Approved or Reviewed, grey while Pending.
export function FileStatusChip({ status }: { status: string }) {
  const good = status === "Approved" || status === "Reviewed"

  return (
    <span data-tone={good ? "good" : undefined} className="result-chip">
      {good && <CheckIcon aria-hidden weight="bold" className="size-3.5" />}
      {status}
    </span>
  )
}
