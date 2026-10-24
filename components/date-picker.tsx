"use client"

import { CalendarBlankIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type Props = {
  id: string
  // A date as YYYY-MM-DD, or empty.
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  required?: boolean
  describedBy?: string
  className?: string
}

const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/

// Dates travel as text, so the day a person picked is never moved by a time
// zone.
function toDate(value: string) {
  const match = isoDay.exec(value)

  if (!match) {
    return undefined
  }

  const [year, month, day] = [match[1], match[2], match[3]].map(Number)
  const date = new Date(year!, month! - 1, day)

  // 2026-02-31 would roll over to March. That is not a date, so it is not shown.
  return date.getFullYear() === year &&
    date.getMonth() === month! - 1 &&
    date.getDate() === day
    ? date
    : undefined
}

function toText(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${month}-${day}`
}

const shown = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export function DatePicker({
  id,
  value,
  onChange,
  invalid,
  required,
  describedBy,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const date = toDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-required={required ? true : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full justify-start border-foreground/20 bg-background text-base font-normal ${date ? "" : "text-muted-foreground"} ${className}`}
        >
          <CalendarBlankIcon aria-hidden />
          {date ? shown.format(date) : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date(2100, 11)}
          defaultMonth={date}
          selected={date}
          onSelect={(picked: Date | undefined) => {
            // Picking the chosen day again clears it, unless a date is required.
            if (picked || !required) {
              onChange(picked ? toText(picked) : "")
            }

            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
