"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Choice = {
  value: string
  // A choice that means trouble, such as Fail, is drawn in the danger colour.
  danger?: boolean
}

// One choice out of a few, drawn as joined buttons: Pass | Fail, Pending |
// Reviewed. Every tool picks between short options this way, so they look the
// same. An empty value means nothing is chosen yet.
export function SegmentedChoice({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string
  value: string
  choices: Choice[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      aria-label={label}
      value={value}
      disabled={disabled}
      // Pressing the chosen button again would send nothing. A chosen option
      // stays chosen until another is pressed.
      onValueChange={(next) => {
        if (next !== "") {
          onChange(next)
        }
      }}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          className={
            choice.danger
              ? "h-10 border-foreground/40 px-5 data-[state=on]:bg-destructive data-[state=on]:text-white"
              : "h-10 border-foreground/40 px-5 data-[state=on]:bg-foreground data-[state=on]:text-background"
          }
        >
          {choice.value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
