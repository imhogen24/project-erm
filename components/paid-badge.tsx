import { Badge } from "@/components/ui/badge"

// Above a milestone's invoice tools once its payment is reconciled: D3.8
// approved with the funds fully accounted for.
export function PaidBadge() {
  return (
    <p
      aria-label="Invoice paid"
      className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
    >
      <Badge>PAID</Badge>
      <span>The client&apos;s payment for this milestone is reconciled.</span>
    </p>
  )
}
