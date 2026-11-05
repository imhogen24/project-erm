import type { RequestMetadata } from "@/lib/request-details"

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// Where the request came from, as labelled values. It is read only and the
// same for everyone who sees it, so it has no inputs.
export function RequestMetadataBlock({
  metadata,
}: {
  metadata: RequestMetadata | null
}) {
  if (!metadata) {
    return (
      <p className="text-sm text-muted-foreground">
        This project has no saved request.
      </p>
    )
  }

  const rows = [
    ["Notification source", metadata.source],
    [
      "Date and time received",
      metadata.receivedAt ? `${when.format(metadata.receivedAt)} UTC` : "-",
    ],
    ["Sender", metadata.sender ?? "-"],
    ["Recipient", metadata.recipient],
    ["Subject", metadata.subject],
  ]

  return (
    <dl className="grid max-w-3xl grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="pt-2 text-muted-foreground sm:pt-0">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
