"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

// The chosen value and how to change it, so an item can let go of itself.
const Picked = React.createContext<{
  value?: string | null
  onValueChange?: (value: string) => void
}>({})

// Like a checkbox: pressing the chosen option again, by click or Space, lets
// it go and leaves nothing chosen (an empty value). Pressing another option
// switches to it.
function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  // A group given only a starting value keeps its own choice here, so its
  // items can let go too. Like Radix, it holds null while nothing is chosen.
  const [own, setOwn] = React.useState<string | null>(defaultValue ?? null)
  const current = value === undefined ? own : value

  function change(next: string) {
    if (value === undefined) {
      setOwn(next === "" ? null : next)
    }

    onValueChange?.(next)
  }

  return (
    <Picked.Provider value={{ value: current, onValueChange: change }}>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        className={cn("grid w-full gap-3", className)}
        value={current}
        onValueChange={change}
        {...props}
      />
    </Picked.Provider>
  )
}

function RadioGroupItem({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const picked = React.useContext(Picked)

  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
        className
      )}
      onClick={(event) => {
        onClick?.(event)

        if (!event.defaultPrevented && picked.value === props.value) {
          picked.onValueChange?.("")
        }
      }}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute start-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground rtl:translate-x-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
