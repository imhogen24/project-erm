"use client"

import { CheckIcon, XIcon } from "@phosphor-icons/react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Choice = {
  value: string
  // What choosing it means. "good" fills soft orange with a tick, such as Pass
  // or Reviewed; "bad" fills red with a cross, such as Fail. Without a tone the
  // chosen option fills grey.
  tone?: "good" | "bad"
}

// One choice out of a few, drawn as one rounded track with the options inside:
// Pass | Fail, Pending | Reviewed. The chosen option fills with what it means;
// the others stay plain. Once the record is locked the track stays, the chosen
// option stays bright and the others fade, so it reads as an answer. Every
// tool picks between short options this way. An empty value means nothing is
// chosen yet. Drawn by .segmented in globals.css.
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
      spacing={0}
      aria-label={label}
      value={value}
      disabled={disabled}
      className="segmented"
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
          data-tone={choice.tone}
          className="segmented-item"
        >
          {choice.value === value && choice.tone === "good" && (
            <CheckIcon aria-hidden weight="bold" className="segmented-icon" />
          )}
          {choice.value === value && choice.tone === "bad" && (
            <XIcon aria-hidden weight="bold" className="segmented-icon" />
          )}
          {choice.value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
