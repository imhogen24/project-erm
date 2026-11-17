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

// How long after the last edit a save goes, and how long after a dropped
// connection it tries again.
export const AUTOSAVE_DELAY = 800

const RETRY_DELAY = 3000

// Saves a tool's sheet as it is typed. Each edit saves a moment later; an edit
// made while a save is on its way is saved right after it. A failure drops
// what was queued, so an older copy is never saved over a newer one: the next
// edit saves the whole sheet again. When the connection drops, it tries the
// newest copy again until it gets through. `saveNow` waits for any save on its
// way, then saves what is on screen, and says whether it worked, so a step
// such as sending reads what was typed. `unsaved` is true while anything
// typed is not yet on the server, so leaving can be checked.
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

  const [saving, setSaving] = useState<
    "idle" | "saving" | "saved" | "retrying"
  >("idle")

  const [message, setMessage] = useState<string>()
  const [errors, setErrors] = useState<FieldError[]>([])
  const [stale, setStale] = useState(false)
  const [unsaved, setUnsaved] = useState(false)

  const latest = useRef({ recordId, updatedAt })
  // The record the screen holds, kept even while a save is on its way, so a
  // failed save goes back to it instead of an older one.
  const shown = useRef({ recordId, updatedAt })
  const busy = useRef(false)
  const queued = useRef<FormValues | null>(null)
  // The newest values typed, so a step never saves an older copy.
  const newest = useRef<FormValues | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The same as `unsaved`, read at once by a save that ends.
  const dirty = useRef(false)
  // False once the screen is gone, so a late failure never tries again.
  const active = useRef(true)

  useEffect(() => {
    shown.current = { recordId, updatedAt }

    if (!busy.current) {
      latest.current = { recordId, updatedAt }
    }
  }, [recordId, updatedAt])

  useEffect(() => {
    active.current = true

    return () => {
      active.current = false
      clearTimeout(timer.current)
      clearTimeout(retry.current)
    }
  }, [])

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
    clearTimeout(retry.current)
    setSaving("saving")

    try {
      let next: FormValues | null = values

      while (next) {
        const sent: FormValues = next

        const result = await save({
          projectId,
          toolId,
          cycle,
          values: sent,
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
          setErrors([])
          next = queued.current
          queued.current = null

          // Saved up to date, unless something newer waits to go.
          if (!next && newest.current === sent) {
            dirty.current = false
            setUnsaved(false)
          }
        } else if (result.status === "stale") {
          setStale(true)
          failed("Not saved. Someone else saved this record.")

          return false
        } else if (result.status === "invalid") {
          setErrors(result.errors)
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
      // The connection dropped: the newest copy goes again shortly.
      queued.current = null
      latest.current = shown.current
      setSaving("retrying")
      clearTimeout(retry.current)

      if (active.current) {
        retry.current = setTimeout(
          () => void saveValues(newest.current ?? values),
          RETRY_DELAY
        )
      }

      return false
    } finally {
      busy.current = false
    }
  }

  // Saves a moment after the last edit.
  function changed(values: FormValues) {
    newest.current = values
    dirty.current = true
    setUnsaved(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void saveValues(values), AUTOSAVE_DELAY)
  }

  // An edit made while this waits is the one saved, never the older copy it
  // was called with.
  async function saveNow(values: FormValues): Promise<boolean> {
    newest.current = values

    while (busy.current) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    clearTimeout(timer.current)
    clearTimeout(retry.current)
    queued.current = null

    return saveValues(newest.current)
  }

  // Saves anything typed that is not saved yet, now, such as before leaving
  // the page. True when nothing is left unsaved.
  async function flush(): Promise<boolean> {
    if (!dirty.current || !newest.current) {
      while (busy.current) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      return !dirty.current
    }

    // An edit made while this saved is still waiting, so not all is saved.
    return (await saveNow(newest.current)) && !dirty.current
  }

  // What the foot of the sheet says: the last message, else how saving went.
  let footLine = message

  if (!footLine && saving === "saving") {
    footLine = "Saving…"
  } else if (!footLine && saving === "saved") {
    footLine = "✓ Saved"
  } else if (!footLine && saving === "retrying") {
    footLine = "Not saved. Retrying…"
  }

  return {
    recordId,
    latest,
    changed,
    saveNow,
    flush,
    footLine,
    unsaved,
    errors,
    setErrors,
    stale,
    setStale,
    setMessage,
    setRecord(next: { recordId: string; updatedAt: string }) {
      setRecordId(next.recordId)
      setUpdatedAt(next.updatedAt)
    },
  }
}
