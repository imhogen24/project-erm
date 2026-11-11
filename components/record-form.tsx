"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { ActionButton } from "@/components/sheet-actions"
import { ToolForm } from "@/components/tool-form"
import { Button } from "@/components/ui/button"
import type {
  FieldError,
  FormValues,
  ToolDefinition,
} from "@/lib/tool-definition"

type Result =
  | { status: "done"; recordId: string; updatedAt: string }
  | {
      status: "invalid"
      errors: FieldError[]
      recordId?: string
      updatedAt?: string
    }
  | { status: "stale" }
  | { status: "error"; message: string }

type Save = {
  projectId: string
  toolId: string
  cycle: number
  values: FormValues
  expectedUpdatedAt?: string
}

type Props = {
  tool: ToolDefinition
  projectId: string
  cycle: number
  // What is saved, and the record it is in. Both are empty before the first
  // save.
  values: FormValues
  recordId?: string
  updatedAt?: string
  // What the server allows this person to do with the record now.
  canWrite: boolean
  canApprove: boolean
  signable: readonly string[]
  save: (values: Save) => Promise<Result>
  submit: (values: Save) => Promise<Result>
  sign: (values: { recordId: string; fieldKey: string }) => Promise<Result>
  approve: (values: { recordId: string }) => Promise<Result>
  // A tool whose approval is sending something, such as D1.4: the button, and
  // what still stops it, said in words. Only given to whoever may send.
  send?: {
    missing: string[]
    run: (values: { recordId: string }) => Promise<Result>
  }
}

type Autosaved = "idle" | "saving" | "saved" | "failed"

// Typed text that is empty is left out, since the server refuses an empty date
// or number and an empty text is the same as none. An inherited or
// system-filled value is the system's, so it is never sent.
function sendable(tool: ToolDefinition, values: FormValues): FormValues {
  const systems = new Set(
    tool.fields
      .filter((field) => field.inherited || field.systemFilled)
      .map((field) => field.key)
  )

  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => !systems.has(key) && value !== "" && value !== null
    )
  )
}

const STALE = "Someone else saved this record. Reload to see their changes."

// The buttons of the record screen and what they say back. The server decides
// everything; this only sends, shows what came back, and keeps what was typed
// when a save is refused.
export function RecordForm({
  tool,
  projectId,
  cycle,
  values,
  recordId: savedRecordId,
  updatedAt: savedUpdatedAt,
  canWrite,
  canApprove,
  signable,
  save,
  submit,
  sign,
  approve,
  send,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // The record and the time to save over come from the server, and move on
  // with each save, so they are held here and taken again when the page does.
  const [recordId, setRecordId] = useState(savedRecordId)
  const [updatedAt, setUpdatedAt] = useState(savedUpdatedAt)
  const [seen, setSeen] = useState({ id: savedRecordId, at: savedUpdatedAt })

  if (seen.id !== savedRecordId || seen.at !== savedUpdatedAt) {
    setSeen({ id: savedRecordId, at: savedUpdatedAt })
    setRecordId(savedRecordId)
    setUpdatedAt(savedUpdatedAt)
  }

  const [errors, setErrors] = useState<FieldError[]>([])
  const [message, setMessage] = useState<string>()
  const [stale, setStale] = useState(false)

  // Autosave reads the newest record and time from refs, since saves follow
  // each other faster than the screen renders. A change made while a save is
  // on its way is saved right after it, so nothing typed is lost.
  const [autosaved, setAutosaved] = useState<Autosaved>("idle")
  const [autosaveError, setAutosaveError] = useState<string>()
  const latest = useRef({ recordId, updatedAt })
  const busy = useRef(false)
  const waiting = useRef<FormValues | null>(null)

  // Kept in step with the record the screen holds, such as after a reload.
  useEffect(() => {
    if (!busy.current) {
      latest.current = { recordId, updatedAt }
    }
  }, [recordId, updatedAt])

  async function autosave(held: FormValues) {
    if (busy.current) {
      waiting.current = held

      return
    }

    busy.current = true
    setAutosaved("saving")

    // A failed save drops what was queued behind it: the next edit saves the
    // whole form again, so nothing typed is lost.
    function failed(reason: string) {
      waiting.current = null
      setAutosaved("failed")
      setAutosaveError(reason)
    }

    try {
      let next: FormValues | null = held

      while (next) {
        const result: Result = await save({
          projectId,
          toolId: tool.id,
          cycle,
          values: sendable(tool, next),
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
          setErrors([])
          setAutosaved("saved")
          next = waiting.current
          waiting.current = null
        } else if (result.status === "stale") {
          setStale(true)
          failed("Someone else saved this record.")
        } else if (result.status === "invalid") {
          setErrors(result.errors)
          failed("Check the highlighted field.")
        } else {
          failed(result.message)
        }
      }
    } catch {
      failed("The connection failed.")
    } finally {
      busy.current = false
    }
  }

  let autosaveLine: string | undefined

  if (autosaved === "saving") {
    autosaveLine = "Saving…"
  } else if (autosaved === "saved") {
    autosaveLine = "✓ Saved"
  } else if (autosaved === "failed") {
    autosaveLine = `Not saved. ${autosaveError ?? ""} What you typed is still here.`
  }

  function run(send: () => Promise<Result>, saidDone: string) {
    setMessage(undefined)
    setErrors([])
    setStale(false)
    startTransition(async () => {
      const result = await send()

      if (result.status === "done") {
        setRecordId(result.recordId)
        setUpdatedAt(result.updatedAt)
        setMessage(saidDone)
        router.refresh()

        return
      }

      if (result.status === "stale") {
        setStale(true)

        return
      }

      if (result.status === "invalid") {
        setErrors(result.errors)

        if (result.recordId) {
          setRecordId(result.recordId)
          setUpdatedAt(result.updatedAt)
        }

        return
      }

      setMessage(result.message)
    })
  }

  function saving(held: FormValues): Save {
    return {
      projectId,
      toolId: tool.id,
      cycle,
      values: sendable(tool, held),
      expectedUpdatedAt: updatedAt,
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolForm
        tool={tool}
        values={values}
        errors={errors}
        readOnly={!canWrite}
        pending={pending}
        recordId={recordId}
        signable={signable}
        message={message ?? (tool.autosave ? autosaveLine : undefined)}
        autosave={tool.autosave}
        extraActions={
          send ? (
            <div className="flex flex-col gap-2 @md:items-end">
              <ActionButton
                disabled={pending || send.missing.length > 0 || !recordId}
                onClick={() => {
                  if (recordId) {
                    run(() => send.run({ recordId }), "Sent.")
                  }
                }}
              >
                Send
              </ActionButton>
              {send.missing.length > 0 && (
                <p className="text-sm text-muted-foreground @md:text-right">
                  Send needs: {send.missing.join("; ")}.
                </p>
              )}
            </div>
          ) : canApprove && recordId ? (
            <ActionButton
              disabled={pending}
              onClick={() => run(() => approve({ recordId }), "Approved.")}
            >
              Approve
            </ActionButton>
          ) : undefined
        }
        onSave={(held) =>
          tool.autosave
            ? void autosave(held)
            : run(() => save(saving(held)), "Draft saved.")
        }
        onSubmit={(held) => run(() => submit(saving(held)), "Submitted.")}
        onSign={(fieldKey) => {
          if (recordId) {
            run(() => sign({ recordId, fieldKey }), "Signed.")
          }
        }}
      />
      {stale && (
        <div
          role="alert"
          className="flex flex-col gap-3 border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-destructive">{STALE}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      )}
    </div>
  )
}
