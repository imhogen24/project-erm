"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

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
}

// Typed text that is empty is left out, since the server refuses an empty date
// or number and an empty text is the same as none. An inherited value is the
// system's, so it is never sent.
function sendable(tool: ToolDefinition, values: FormValues): FormValues {
  const inherited = new Set(
    tool.fields.filter((field) => field.inherited).map((field) => field.key)
  )

  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => !inherited.has(key) && value !== "" && value !== null
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
        signable={signable}
        onSave={(held) => run(() => save(saving(held)), "Draft saved.")}
        onSubmit={(held) => run(() => submit(saving(held)), "Submitted.")}
        onSign={(fieldKey) => {
          if (recordId) {
            run(() => sign({ recordId, fieldKey }), "Signed.")
          }
        }}
      />
      {canApprove && recordId && (
        <Button
          type="button"
          size="lg"
          className="h-12 w-full px-8 text-base sm:w-fit"
          disabled={pending}
          onClick={() => run(() => approve({ recordId }), "Approved.")}
        >
          Approve
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
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
