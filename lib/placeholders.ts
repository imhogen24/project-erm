import { z } from "zod"

// `[Client Name]` in a tool's fixed text: a value filled in from the project
// when the text is shown or exported, and never stored.
const placeholderPattern = /\[([^[\]]+)\]/g

// What each placeholder is filled with, by its name, such as
// { "Client Name": "Client Test Ltd" }.
export type Fills = Record<string, string>

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(placeholderPattern)].map((match) => match[1]!)
}

// The text with each placeholder that has a value filled in. One with no value
// yet stays as it is written, so the reader sees what is still missing.
export function fillText(text: string, fills: Fills): string {
  return text.replaceAll(placeholderPattern, (whole, name: string) => {
    const value = Object.hasOwn(fills, name) ? fills[name]?.trim() : undefined

    return value ? value : whole
  })
}

type FillSource = "system" | { field: string }

// A field's value as a record or a form holds it.
export type FillInput = string | number | boolean | null | object | undefined

// Only a value typed as text or a number fills a placeholder.
const fillValue = z.union([z.string(), z.number()]).transform(String)

// The placeholders a tool fills from its own fields, such as [X] from a
// percentage typed beside the table, read through `valueOf` from what the
// record holds now.
export function fieldFills(
  fills: Record<string, FillSource> | undefined,
  valueOf: (field: string) => FillInput
): Fills {
  return Object.fromEntries(
    Object.entries(fills ?? {}).flatMap(
      ([name, source]): [string, string][] => {
        const value =
          source === "system"
            ? undefined
            : fillValue.safeParse(valueOf(source.field)).data

        return value === undefined ? [] : [[name, value]]
      }
    )
  )
}

// The fields a tool's placeholders are filled from.
export function fillFields(
  fills: Record<string, FillSource> | undefined
): string[] {
  return Object.values(fills ?? {}).flatMap((source) =>
    source === "system" ? [] : [source.field]
  )
}
