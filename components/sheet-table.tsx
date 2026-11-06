import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

function template(value: string): CSSProperties {
  // SAFETY: React hands custom properties such as --template to the DOM
  // untouched; CSSProperties only leaves them out of its list of known names.
  return { "--template": value } as CSSProperties
}

// A box with a title bar, ruled like the rest of the sheet. Every table on a
// sheet sits in one, so they look and read the same.
export function TableBox({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn("border border-foreground/20", className)}
    >
      <h2 className="border-b border-foreground/20 bg-muted/60 px-4 py-2.5 text-sm font-medium">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Columns with a header row when there is room. Narrow, the header goes and
// each row stacks with its own labels, so nothing scrolls sideways. The
// template is the width of each column, as a CSS grid template. The parent
// must be an `@container`.
export function DataTable({
  label,
  columns,
  widths,
  children,
}: {
  label: string
  columns: string[]
  widths: string
  children: ReactNode
}) {
  return (
    <div role="table" aria-label={label} className="flex flex-col">
      <div
        role="row"
        style={template(widths)}
        className="hidden border-b border-foreground/20 text-xs text-muted-foreground @xl:grid @xl:grid-cols-[var(--template)]"
      >
        {columns.map((column) => (
          <div
            key={column}
            role="columnheader"
            className="px-4 py-2 not-last:border-r not-last:border-foreground/20"
          >
            {column}
          </div>
        ))}
      </div>
      {children}
    </div>
  )
}

export function DataRow({
  widths,
  children,
  className,
}: {
  widths: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="row"
      style={template(widths)}
      className={cn(
        "flex flex-col gap-3 p-4 not-last:border-b not-last:border-foreground/20 @xl:grid @xl:grid-cols-[var(--template)] @xl:gap-0 @xl:p-0",
        className
      )}
    >
      {children}
    </div>
  )
}

export function DataCell({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="cell"
      className={cn(
        "flex min-w-0 flex-col gap-1.5 @xl:justify-center @xl:px-4 @xl:py-3 @xl:not-last:border-r @xl:not-last:border-foreground/20",
        className
      )}
    >
      <span className="text-xs text-muted-foreground @xl:sr-only">{label}</span>
      {children}
    </div>
  )
}
