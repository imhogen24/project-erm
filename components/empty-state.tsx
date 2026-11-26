import type { ReactNode } from "react"

import { EmptyDrawing, type Drawing } from "@/components/empty-drawing"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

// What every screen shows where a list, a table or a whole tool has nothing in
// it yet: a small engineering drawing, a title, and what happens next.
//
// - `page` fills the space it is given, centred, with the drawing drawn in.
//   Use it when the empty result is the whole page or panel.
// - `inline` sits in a row, the drawing at the left. Use it inside a table, a
//   box or a list that is one part of a page.
export function EmptyState({
  title,
  description,
  action,
  drawing = "flange",
  size = "page",
  className,
}: {
  title: ReactNode
  description?: ReactNode
  // A button or link that fills the empty space, such as "Clear filters".
  action?: ReactNode
  // gear: work not started. flange: a list with nothing in it. bracket:
  // nothing fits what was asked.
  drawing?: Drawing
  size?: "page" | "inline"
  className?: string
}) {
  if (size === "inline") {
    return (
      <Empty
        className={cn(
          "flex-row items-center justify-start gap-4 rounded-none p-0 text-left",
          className
        )}
      >
        <EmptyMedia className="mb-0">
          <EmptyDrawing
            drawing={drawing}
            dimensioned={false}
            className="w-16"
          />
        </EmptyMedia>
        <EmptyHeader className="max-w-none items-start">
          <EmptyTitle className="text-sm font-medium">{title}</EmptyTitle>
          {description && (
            <EmptyDescription className="text-sm">
              {description}
            </EmptyDescription>
          )}
        </EmptyHeader>
        {action}
      </Empty>
    )
  }

  return (
    // On a phone the sheet runs well below the fold, so the drawing sits near
    // the top there and in the middle from the small breakpoint up.
    <Empty
      className={cn(
        "justify-start gap-6 rounded-none px-6 py-10 sm:justify-center sm:p-10",
        className
      )}
    >
      <EmptyMedia className="mb-0">
        <EmptyDrawing drawing={drawing} animate className="w-60 sm:w-72" />
      </EmptyMedia>
      <EmptyHeader className="gap-2">
        <EmptyTitle className="text-lg font-semibold">{title}</EmptyTitle>
        {description && (
          <EmptyDescription className="text-sm">{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
