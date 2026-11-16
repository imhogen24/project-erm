"use client"

import { useEffect, useRef, useState } from "react"

import {
  AUTOSAVE_DELAY,
  RETRY_DELAY,
  createAutosave,
  type Autosave,
  type AutosaveState,
  type SaveOutcome,
} from "@/lib/autosave"
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
  // After each save, such as to refresh what the server works out from the
  // saved record. `created` is true for the save that made the record. A
  // refresh a link click overtakes is simply dropped.
  onSaved?: (saved: { created: boolean }) => void
}

type Saved = { recordId?: string; updatedAt?: string }

function isNewer(next: string | undefined, than: string | undefined) {
  return (
    next !== undefined &&
    (than === undefined || Date.parse(next) > Date.parse(than))
  )
}

const footLines = {
  saving: "Saving…",
  saved: "✓ Saved",
  retrying: "Not saved. Retrying…",
  refused: "Not saved.",
} satisfies { [status in AutosaveState["status"]]: string }

// Saves a tool's sheet as it is typed: a moment after each edit, again after
// a failure, and at once when a step such as Submit needs it saved first. A
// refused save (someone else's newer save, a value the server will not take)
// is not tried again. The sheet says how saving went at its foot.
export function useAutosave({
  projectId,
  toolId,
  cycle,
  recordId: savedRecordId,
  updatedAt: savedUpdatedAt,
  save,
  onSaved,
}: Options) {
  const [recordId, setRecordId] = useState(savedRecordId)
  const [seen, setSeen] = useState({ id: savedRecordId, at: savedUpdatedAt })

  // The newest record and time to save over. Saves follow each other faster
  // than the screen renders, so they are held in a ref.
  const latest = useRef<Saved>({
    recordId: savedRecordId,
    updatedAt: savedUpdatedAt,
  })

  // The page hands a newer record after a refresh.
  if (seen.id !== savedRecordId || seen.at !== savedUpdatedAt) {
    setSeen({ id: savedRecordId, at: savedUpdatedAt })
    setRecordId(savedRecordId)
  }

  useEffect(() => {
    if (isNewer(savedUpdatedAt, latest.current.updatedAt)) {
      latest.current = { recordId: savedRecordId, updatedAt: savedUpdatedAt }
    }
  }, [savedRecordId, savedUpdatedAt])

  const [state, setState] = useState<AutosaveState>()
  const [message, setMessage] = useState<string>()
  const [stale, setStale] = useState(false)
  const [errors, setErrors] = useState<FieldError[]>([])

  const where = useRef({ projectId, toolId, cycle, save, onSaved })

  useEffect(() => {
    where.current = { projectId, toolId, cycle, save, onSaved }
  })

  const saver = useRef<Autosave<FormValues>>(null)

  useEffect(() => {
    async function send(values: FormValues): Promise<SaveOutcome> {
      const { save: run, onSaved: saved, ...at } = where.current

      const result = await run({
        ...at,
        values,
        expectedUpdatedAt: latest.current.updatedAt,
      })

      if (result.status === "done") {
        const created = latest.current.recordId === undefined

        latest.current = {
          recordId: result.recordId,
          updatedAt: result.updatedAt,
        }
        setRecordId(result.recordId)
        setErrors([])
        saved?.({ created })

        return { status: "saved" }
      }

      if (result.status === "stale") {
        setStale(true)

        return { status: "refused", message: "Someone else saved this record." }
      }

      if (result.status === "invalid") {
        setErrors(result.errors)

        return {
          status: "refused",
          message: result.errors.map((error) => error.message).join("; "),
        }
      }

      // The server said why in words, such as a record no longer a draft:
      // trying again would not change it.
      return { status: "refused", message: result.message }
    }

    const created = createAutosave<FormValues>({
      send,
      delay: AUTOSAVE_DELAY,
      retryDelay: RETRY_DELAY,
      onState: setState,
    })

    // Back online, a failed save goes at once rather than at the next retry.
    const online = () => void created.flush()

    saver.current = created
    window.addEventListener("online", online)

    return () => {
      window.removeEventListener("online", online)
      created.dispose()
      saver.current = null
    }
  }, [])

  // What the foot of the sheet says: what the last step said, else how
  // saving went.
  let footLine = message

  if (!footLine && state) {
    footLine =
      state.status === "refused"
        ? `${footLines.refused} ${state.message}`
        : footLines[state.status]
  }

  function flush() {
    return saver.current?.flush() ?? Promise.resolve(true)
  }

  return {
    recordId,
    latest,
    footLine,
    stale,
    errors,
    setStale,
    setMessage,
    // An edit: saved a moment after editing stops.
    changed(values: FormValues) {
      setMessage(undefined)
      saver.current?.edit(values)
    },
    // Saves anything waiting now, and says whether everything is saved.
    flush,
    // Saves these values now, or what is waiting when none are given.
    saveNow(values?: FormValues) {
      if (values) {
        saver.current?.edit(values)
      }

      return flush()
    },
    unsaved() {
      return saver.current?.unsaved() ?? false
    },
    // Gives up on anything unsaved, such as before a reload.
    discard() {
      saver.current?.dispose()
    },
    updatedAt() {
      return latest.current.updatedAt
    },
    // A step such as Submit moved the record on.
    setRecord(next: { recordId: string; updatedAt: string }) {
      latest.current = { recordId: next.recordId, updatedAt: next.updatedAt }
      setRecordId(next.recordId)
    },
  }
}

export type Sheet = ReturnType<typeof useAutosave>
