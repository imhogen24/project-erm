"use client"

import { useEffect, useRef, useState } from "react"

import type { FieldError, FormValues } from "@/lib/tool-definition"

export type SaveResult =
  | { status: "done"; recordId: string; updatedAt: string }
  | {
      status: "invalid"
      errors: FieldError[]
      recordId?: string
      updatedAt?: string
    }
  | { status: "stale" }
  | { status: "error"; message: string }

export type SaveInput = {
  projectId: string
  toolId: string
  cycle: number
  values: FormValues
  expectedUpdatedAt?: string
}

type Options = {
  projectId: string
  toolId: string
  cycle: number
  recordId?: string
  updatedAt?: string
  save: (input: SaveInput) => Promise<SaveResult>
}

// Saves a tool's sheet as it is typed. Each edit saves a moment later; an edit
// made while a save is on its way is saved right after it. A failure drops
// what was queued, so an older copy is never saved over a newer one: the next
// edit saves the whole sheet again. `saveNow` waits for any save on its way,
// then saves what is on screen, and says whether it worked, so a step such as
// sending reads what was typed.
export function useAutosave({
  projectId,
  toolId,
  cycle,
  recordId: savedRecordId,
  updatedAt: savedUpdatedAt,
  save,
}: Options) {
  const [recordId, setRecordId] = useState(savedRecordId)
  const [updatedAt, setUpdatedAt] = useState(savedUpdatedAt)
  const [seen, setSeen] = useState({ id: savedRecordId, at: savedUpdatedAt })

  // The page hands a newer record after a refresh.
  if (seen.id !== savedRecordId || seen.at !== savedUpdatedAt) {
    setSeen({ id: savedRecordId, at: savedUpdatedAt })
    setRecordId(savedRecordId)
    setUpdatedAt(savedUpdatedAt)
  }

  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle")
  const [message, setMessage] = useState<string>()
  const [stale, setStale] = useState(false)

  const latest = useRef({ recordId, updatedAt })
  // The record the screen holds, kept even while a save is on its way, so a
  // failed save goes back to it instead of an older one.
  const shown = useRef({ recordId, updatedAt })
  const busy = useRef(false)
  const queued = useRef<FormValues | null>(null)
  // The newest values typed, so a step never saves an older copy.
  const newest = useRef<FormValues | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    shown.current = { recordId, updatedAt }

    if (!busy.current) {
      latest.current = { recordId, updatedAt }
    }
  }, [recordId, updatedAt])

  useEffect(() => () => clearTimeout(timer.current), [])

  function failed(line: string) {
    queued.current = null
    latest.current = shown.current
    setSaving("idle")
    setMessage(line)
  }

  async function saveValues(values: FormValues): Promise<boolean> {
    if (busy.current) {
      queued.current = values

      return false
    }

    busy.current = true
    setSaving("saving")

    try {
      let next: FormValues | null = values

      while (next) {
        const result = await save({
          projectId,
          toolId,
          cycle,
          values: next,
          expectedUpdatedAt: latest.current.updatedAt,
        })

        next = null

        if (result.status === "done") {
          latest.current = {
            recordId: result.recordId,
            updatedAt: result.updatedAt,
          }
          setRecordId(result.recordId)
          setUpdatedAt(result.updatedAt)
          setSaving("saved")
          setMessage(undefined)
          next = queued.current
          queued.current = null
        } else if (result.status === "stale") {
          setStale(true)
          failed("Not saved. Someone else saved this record.")

          return false
        } else if (result.status === "invalid") {
          failed(
            `Not saved: ${result.errors.map((error) => error.message).join("; ")}`
          )

          return false
        } else {
          failed(`Not saved. ${result.message}`)

          return false
        }
      }

      return true
    } catch {
      failed("Not saved. The connection failed.")

      return false
    } finally {
      busy.current = false
    }
  }

  // Saves a moment after the last edit.
  function changed(values: FormValues) {
    newest.current = values
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void saveValues(values), 600)
  }

  // An edit made while this waits is the one saved, never the older copy it
  // was called with.
  async function saveNow(values: FormValues): Promise<boolean> {
    newest.current = values

    while (busy.current) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    clearTimeout(timer.current)
    queued.current = null

    return saveValues(newest.current)
  }

  // What the foot of the sheet says: the last message, else how saving went.
  let footLine = message

  if (!footLine && saving === "saving") {
    footLine = "Saving…"
  } else if (!footLine && saving === "saved") {
    footLine = "✓ Saved"
  }

  return {
    recordId,
    latest,
    changed,
    saveNow,
    footLine,
    stale,
    setStale,
    setMessage,
    setRecord(next: { recordId: string; updatedAt: string }) {
      setRecordId(next.recordId)
      setUpdatedAt(next.updatedAt)
    },
  }
}
