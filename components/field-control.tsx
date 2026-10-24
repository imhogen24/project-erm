"use client"

import { z } from "zod"

import { DatePicker } from "@/components/date-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Column, Field, FieldValue } from "@/lib/tool-definition"

// What the inputs hold while a person is typing: numbers stay text until the
// form hands its values over.
export type RawCell = string | boolean | Record<string, boolean>

export type RawRow = Record<string, RawCell>

export type RawValue = RawCell | RawRow[]

export const controlClass =
  "h-12 border-foreground/20 bg-background text-base md:text-base"

const signed = z.object({ signedBy: z.string(), signedAt: z.string() })

const flags = z.record(z.string(), z.boolean())

const words = z.string()

// The text an input holds, or nothing when the value is not text.
export function textOf(value: FieldValue | RawValue | undefined) {
  return words.safeParse(value).data
}

// The yes and no answers of a checklist, or nothing when there are none.
export function flagsOf(value: FieldValue | RawValue | undefined) {
  return flags.safeParse(value).data
}

export function checklistFlags(value: FieldValue | RawValue | undefined) {
  return flagsOf(value) ?? {}
}

export function signatureText(value: FieldValue | RawValue | undefined) {
  const signature = signed.safeParse(value).data

  if (!signature) {
    return "Not signed yet"
  }

  const when = new Date(signature.signedAt)

  if (Number.isNaN(when.getTime())) {
    return `Signed by ${signature.signedBy}`
  }

  const day = when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

  return `Signed by ${signature.signedBy} on ${day}`
}

const readOnlyBlock =
  "border border-dashed border-foreground/30 bg-muted/50 px-3 py-2 text-sm text-muted-foreground"

const inputType = {
  text: "text",
  number: "number",
  time: "time",
  email: "email",
  fileLink: "url",
} as const

type Props = {
  cell: Field | Column
  id: string
  // What is saved, for blocks that are shown but never edited, or what the
  // person has typed.
  value: RawCell | FieldValue | undefined
  onChange: (value: RawCell) => void
  invalid?: boolean
  describedBy?: string
  required?: boolean
  // Extra classes for the text-like inputs, so a table cell can drop the box.
  inputClassName?: string
}

// The input for one field or one table cell. The label and the error message
// belong to whoever places it.
export function FieldControl({
  cell,
  id,
  value,
  onChange,
  invalid,
  describedBy,
  required,
  inputClassName = "",
}: Props) {
  const shared = {
    id,
    "aria-required": required ? (true as const) : undefined,
    "aria-invalid": invalid ? (true as const) : undefined,
    "aria-describedby": describedBy,
  }

  const text = textOf(value) ?? ""

  if (cell.type === "table") {
    return null
  }

  if (cell.inherited) {
    return (
      <Input
        {...shared}
        readOnly
        value={text}
        className={`${controlClass} bg-muted/50 ${inputClassName}`}
      />
    )
  }

  switch (cell.type) {
    case "instruction":
      return <p className={readOnlyBlock}>{cell.content}</p>
    case "staticList":
      return (
        <ul className={`${readOnlyBlock} list-inside list-disc`}>
          {cell.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case "signature":
      return <p className={readOnlyBlock}>{signatureText(value)}</p>
    case "longText":
      return (
        <Textarea
          {...shared}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`min-h-28 border-foreground/20 bg-background text-base md:text-base ${inputClassName}`}
        />
      )
    case "boolean":
      return (
        <Checkbox
          {...shared}
          className="border-foreground/40"
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      )
    case "select":
      return (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger
            {...shared}
            className={`${controlClass} w-full data-[size=default]:h-12 ${inputClassName}`}
          >
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            {cell.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "checklist": {
      const answers = checklistFlags(value)

      return (
        <div
          role="group"
          id={id}
          aria-describedby={describedBy}
          className="flex flex-col gap-3"
        >
          {cell.items.map((item, index) => (
            <div key={item} className="flex items-center gap-3">
              <Checkbox
                id={`${id}-${index}`}
                className="border-foreground/40"
                aria-invalid={invalid ? true : undefined}
                checked={answers[item] === true}
                onCheckedChange={(checked) =>
                  onChange(
                    Object.fromEntries(
                      cell.items.map((each) => [
                        each,
                        each === item
                          ? checked === true
                          : (answers[each] ?? false),
                      ])
                    )
                  )
                }
              />
              <label htmlFor={`${id}-${index}`} className="text-sm">
                {item}
              </label>
            </div>
          ))}
        </div>
      )
    }

    case "currency":
    case "percentage":
      return (
        <div className="relative">
          {cell.type === "currency" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
            >
              GHS
            </span>
          )}
          <Input
            {...shared}
            type="number"
            inputMode="decimal"
            step="any"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            className={`${controlClass} ${cell.type === "currency" ? "pl-12" : "pr-9"} ${inputClassName}`}
          />
          {cell.type === "percentage" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
            >
              %
            </span>
          )}
        </div>
      )
    case "date":
      return (
        <DatePicker
          id={id}
          value={text}
          onChange={onChange}
          invalid={invalid}
          required={required}
          describedBy={describedBy}
          className={inputClassName}
        />
      )

    case "text":
    case "number":
    case "time":
    case "email":
    case "fileLink":
      return (
        <Input
          {...shared}
          type={inputType[cell.type]}
          placeholder={cell.type === "fileLink" ? "https://" : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${controlClass} ${inputClassName}`}
        />
      )
  }
}
