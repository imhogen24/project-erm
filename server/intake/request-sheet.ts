import { z } from "zod"

import type { JsonObject, ServiceTrack } from "@/db/schema"
import {
  requestLayouts,
  submissionFields,
  type RequestGroup,
  type RequestSheet,
} from "@/lib/request-sheet"

// The website's own bookkeeping and the file list. The files are opened from
// D1.1's Attached files, and the request ID is shown with the request.
const internalColumns = new Set([
  "custom_engineering_id",
  "drafting_digitization_id",
  "updated_at",
  "admin_notified_at",
  "confirmation_sent_at",
  "notify_attempts",
  "file_attachments",
  "file_attachment",
  "request_id",
])

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

const text = z.string()

const list = z.array(z.string())

// "project_title" becomes "Project title".
function labelOf(column: string) {
  const words = column.replaceAll("_", " ")

  return words.charAt(0).toUpperCase() + words.slice(1)
}

// One column of the website row as a line of text. A list of choices is joined
// with commas, a time reads as a date and time, and anything missing reads as
// empty.
export function valueOf(row: JsonObject, column: string) {
  const choices = list.safeParse(row[column])

  if (choices.success) {
    return choices.data.join(", ")
  }

  const single = text.safeParse(row[column])

  if (single.success && column.endsWith("_at")) {
    const date = new Date(single.data)

    return Number.isNaN(date.getTime())
      ? single.data
      : `${when.format(date)} UTC`
  }

  if (single.success) {
    return single.data.trim()
  }

  return row[column] === null || row[column] === undefined
    ? ""
    : JSON.stringify(row[column])
}

// The saved copy of a website request as groups of labelled values: what the
// track's form asks, when it came in, and any column the website has added
// since, so nothing the client filled in is left out. The answers are client
// details, so nothing here puts them in a log or an error message.
export function requestSheetOf(copy: {
  requestId: string
  serviceTrack: ServiceTrack
  submission: JsonObject
}): RequestSheet | null {
  if (copy.serviceTrack !== "Tier_1" && copy.serviceTrack !== "Tier_3") {
    return null
  }

  const asked = requestLayouts[copy.serviceTrack]

  const known = new Set([
    ...internalColumns,
    ...asked.flatMap((group) => group.fields.map((field) => field.column)),
    ...submissionFields.map((field) => field.column),
  ])

  const extra = Object.keys(copy.submission).filter(
    (column) => !known.has(column)
  )

  const groups: RequestGroup[] = [
    ...asked.map((group) => ({
      title: group.title,
      rows: group.fields.map((field) => ({
        label: field.label,
        value: valueOf(copy.submission, field.column),
      })),
    })),
    {
      title: "Submission",
      rows: submissionFields.map((field) => ({
        label: field.label,
        value: valueOf(copy.submission, field.column),
      })),
    },
    ...(extra.length === 0
      ? []
      : [
          {
            title: "Other answers",
            rows: extra.map((column) => ({
              label: labelOf(column),
              value: valueOf(copy.submission, column),
            })),
          },
        ]),
  ]

  return { track: copy.serviceTrack, requestId: copy.requestId, groups }
}
