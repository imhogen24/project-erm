"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { RecordUploads } from "@/components/file-cell"
import { ActionButton } from "@/components/sheet-actions"
import { ToolForm } from "@/components/tool-form"
import { LeaveGuard, StaleNotice } from "@/components/unsaved-guard"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  FieldError,
  FormValues,
  ToolDefinition,
} from "@/lib/tool-definition"
import {
  useAutosave,
  type SaveInput,
  type SaveResult as Result,
} from "@/lib/use-autosave"

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
  save: (values: SaveInput) => Promise<Result>
  submit: (values: SaveInput) => Promise<Result>
  sign: (values: { recordId: string; fieldKey: string }) => Promise<Result>
  approve: (values: { recordId: string }) => Promise<Result>
  // A tool whose approval is sending something, such as D1.4: the button, and
  // what still stops it, said in words. Only given to whoever may send.
  send?: {
    missing: string[]
    run: (values: { recordId: string }) => Promise<Result>
  }
  // Given to whoever may approve: returns the record to its writer, saying
  // why.
  sendBack?: (values: { recordId: string; reason: string }) => Promise<Result>
  // Why the approver sent this draft back, shown above the sheet.
  sentBack?: string
  // The page shows things the server works out from the saved record, such
  // as what still stops D1.13's meeting steps, so it is drawn again after
  // each save. The form keeps what is typed: it reads its values only once.
  refreshOnSave?: boolean
}

// Typed text that is empty is left out, since the server refuses an empty date
// or number and an empty text is the same as none. An inherited or
// system-filled value is the system's, so it is never sent.
function sendable(tool: ToolDefinition, values: FormValues): FormValues {
  const systems = new Set(
    tool.fields
      .filter((field) => field.inherited || field.systemFilled)
      .map((field) => field.key)
  )

  // An empty table is the same as no table, so saving one never reads as an
  // edit that clears a signature.
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !systems.has(key) &&
        value !== "" &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0)
    )
  )
}

// The record screen: the sheet saves by itself as it is typed, and its buttons
// send the steps. The server decides everything; this only sends, shows what
// came back, and keeps what was typed when a save is refused.
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
  sendBack,
  sentBack,
  refreshOnSave = false,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const sheet = useAutosave({
    projectId,
    toolId: tool.id,
    cycle,
    recordId: savedRecordId,
    updatedAt: savedUpdatedAt,
    save,
    // The first save makes the record, which the server needs to see to offer
    // Sign and to show the record as a draft, so the page is drawn again
    // then. Later saves only draw it again when the page asks to.
    onSaved: ({ created }) => {
      if (created || refreshOnSave) {
        router.refresh()
      }
    },
  })

  const recordId = sheet.recordId

  // What a step found wrong. A refused save's own errors show otherwise.
  const [errors, setErrors] = useState<FieldError[]>([])
  const [sendingBack, setSendingBack] = useState(false)
  const [reason, setReason] = useState("")

  function run(step: () => Promise<Result>, saidDone: string) {
    sheet.setMessage(undefined)
    setErrors([])
    startTransition(async () => {
      // What was typed is saved first, so the step reads it. When that save
      // fails the step does not run: the foot already says why.
      if (canWrite && !(await sheet.flush())) {
        return
      }

      // Every step revalidates the page, so its response draws the page again;
      // no second refresh is needed.
      const result = await step()

      if (result.status === "done") {
        sheet.setRecord(result)
        sheet.setMessage(saidDone)

        return
      }

      if (result.status === "stale") {
        sheet.setStale(true)

        return
      }

      if (result.status === "invalid") {
        setErrors(result.errors)

        if (result.recordId && result.updatedAt) {
          sheet.setRecord({
            recordId: result.recordId,
            updatedAt: result.updatedAt,
          })
        }

        return
      }

      sheet.setMessage(result.message)
    })
  }

  return (
    <RecordUploads.Provider
      value={canWrite ? { projectId, toolId: tool.id } : null}
    >
      <div className="flex flex-col gap-6">
        {sentBack && (
          <div role="status" data-tone="error" className="note-panel text-sm">
            <p className="font-medium">Sent back for changes</p>
            <p className="whitespace-pre-wrap">{sentBack}</p>
          </div>
        )}
        <ToolForm
          tool={tool}
          values={values}
          errors={errors.length > 0 ? errors : sheet.errors}
          readOnly={!canWrite}
          pending={pending}
          recordId={recordId}
          signable={signable}
          message={sheet.footLine}
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
              <>
                {sendBack && (
                  <ActionButton
                    variant="secondary"
                    disabled={pending}
                    aria-expanded={sendingBack}
                    onClick={() => setSendingBack((open) => !open)}
                  >
                    Send back
                  </ActionButton>
                )}
                <ActionButton
                  disabled={pending}
                  onClick={() => run(() => approve({ recordId }), "Approved.")}
                >
                  Approve
                </ActionButton>
              </>
            ) : undefined
          }
          onChange={
            canWrite ? (held) => sheet.changed(sendable(tool, held)) : undefined
          }
          onSubmit={(held) =>
            run(
              () =>
                submit({
                  projectId,
                  toolId: tool.id,
                  cycle,
                  values: sendable(tool, held),
                  // Read once the save before it is done, so it is the newest.
                  expectedUpdatedAt: sheet.updatedAt(),
                }),
              "Submitted."
            )
          }
          onSign={(fieldKey) => {
            if (recordId) {
              run(() => sign({ recordId, fieldKey }), "Signed.")
            }
          }}
        />
        {/* Stays open, holding the reason, until the record has gone back. */}
        {sendBack && sendingBack && canApprove && recordId && (
          <form
            className="flex flex-col gap-3 border border-foreground/20 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              run(
                () => sendBack({ recordId, reason }),
                "Sent back to the writer."
              )
            }}
          >
            <Label htmlFor="send-back-reason">What needs changing?</Label>
            <Textarea
              id="send-back-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              required
            />
            <div className="flex flex-col gap-3 @md:flex-row @md:justify-end">
              <ActionButton
                variant="ghost"
                onClick={() => {
                  setSendingBack(false)
                  setReason("")
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="submit"
                disabled={pending || reason.trim() === ""}
              >
                Send back to the writer
              </ActionButton>
            </div>
          </form>
        )}
        {sheet.stale && <StaleNotice sheet={sheet} />}
        {canWrite && <LeaveGuard sheet={sheet} />}
      </div>
    </RecordUploads.Provider>
  )
}
