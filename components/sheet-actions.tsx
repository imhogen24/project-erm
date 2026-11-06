import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// The row at the foot of a tool sheet: what the last action said, on the left,
// and the buttons on the right. Every tool puts its buttons here, so a person
// always looks in the same place.
export function SheetActions({
  message,
  children,
}: {
  message?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-foreground/20 pt-6 @md:flex-row @md:items-center @md:justify-between">
      <div className="min-w-0">
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 @md:flex-row">{children}</div>
    </div>
  )
}

export function ActionButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      size="lg"
      className={cn("h-12 w-full px-8 text-base @md:w-fit", className)}
      {...props}
    />
  )
}
