"use client"

import { useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { RecordUploads } from "@/components/file-cell"
import { LeaveGuard } from "@/components/leave-guard"
import {
  SendBackButton,
  SendBackForm,
  SentBackNotice,
} from "@/components/send-back"
import { ActionButton } from "@/components/sheet-actions"
import { ToolForm } from "@/components/tool-form"
import { Button } from "@/components/ui/button"
import type {
  FieldError,
  FormValues,
  ToolDefinition,
} from "@/lib/tool-definition"
import type { Fills } from "@/lib/placeholders"
import { useAutosave } from "@/lib/use-autosave"

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
  // What the system fills into the [bracketed] names of fixed text.
  fills?: Fills
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
  // Given to whoever may approve: returns the record to its writer, saying
  // why.
  sendBack?: (values: { recordId: string; reason: string }) => Promise<Result>
  // Why the approver sent this draft back, shown above the sheet.
  sentBack?: string
  // The writer's button once the record is out of their hands: Withdraw while
  // it waits for approval, Request a change once it is locked.
  writerAction?: ReactNode
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

const STALE = "Someone else saved this record. Reload to see their changes."

// The buttons of the record screen and what they say back. The server decides
// everything; this only sends, shows what came back, and keeps what was typed
// when a save is refused.
export function RecordForm({
  tool,
  projectId,
  cycle,
  values,
  fills,
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
  writerAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sendingBack, setSendingBack] = useState(false)

  // Every change is saved a moment after typing stops; a dropped connection
  // is tried again, and leaving asks first while anything typed is not saved.
  const sheet = useAutosave({
    projectId,
    toolId: tool.id,
    cycle,
    recordId: savedRecordId,
    updatedAt: savedUpdatedAt,
    save,
  })

  // The newest values typed, so a step saves them first.
  const typed = useRef<FormValues | null>(null)

  // Runs a step once what was typed is saved, so the step reads it. When that
  // save fails, the step does not run: it would read an older copy.
  function run(
    step: (record: {
      recordId?: string
      updatedAt?: string
    }) => Promise<Result>,
    saidDone: string
  ) {
    sheet.setMessage(undefined)
    sheet.setErrors([])
    sheet.setStale(false)
    startTransition(async () => {
      // A tool with no record yet is saved as it is on screen, which makes
      // the draft; otherwise only edits not saved yet go first.
      if (canWrite) {
        const saved =
          !sheet.latest.current.recordId && typed.current
            ? await sheet.saveNow(typed.current)
            : await sheet.flush()

        if (!saved) {
          return
        }
      }

      const result = await step(sheet.latest.current)

      if (result.status === "done") {
        sheet.setRecord(result)
        sheet.setMessage(saidDone)
        router.refresh()

        return
      }

      if (result.status === "stale") {
        sheet.setStale(true)

        return
      }

      if (result.status === "invalid") {
        sheet.setErrors(result.errors)

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

  const recordId = sheet.recordId

  return (
    <RecordUploads.Provider
      value={canWrite ? { projectId, toolId: tool.id } : null}
    >
      <div className="flex flex-col gap-6">
        <SentBackNotice reason={sentBack} />
        <ToolForm
          tool={tool}
          values={values}
          fills={fills}
          errors={sheet.errors}
          readOnly={!canWrite}
          pending={pending}
          recordId={recordId}
          signable={signable}
          message={sheet.footLine}
          submits={!tool.withoutSubmit}
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
                  <SendBackButton
                    open={sendingBack}
                    disabled={pending}
                    onToggle={() => setSendingBack((open) => !open)}
                  />
                )}
                {/* A tool signed in turn is approved by a signature. */}
                {!tool.signInTurn && (
                  <ActionButton
                    disabled={pending}
                    onClick={() =>
                      run(() => approve({ recordId }), "Approved.")
                    }
                  >
                    Approve
                  </ActionButton>
                )}
              </>
            ) : (
              writerAction
            )
          }
          onSave={(held) => {
            typed.current = sendable(tool, held)
            sheet.changed(typed.current)
          }}
          onSubmit={(held) => {
            typed.current = sendable(tool, held)
            run(
              (record) =>
                submit({
                  projectId,
                  toolId: tool.id,
                  cycle,
                  values: sendable(tool, held),
                  expectedUpdatedAt: record.updatedAt,
                }),
              tool.locksOnSubmit ? "Submitted and locked." : "Submitted."
            )
          }}
          onSign={(fieldKey, held) => {
            // Saved first as it is on screen, which also makes the draft on a
            // tool with none yet. The same values go with Submit later, so
            // the signature is not taken for an edit.
            typed.current = sendable(tool, held)
            run(
              async (record) =>
                record.recordId
                  ? sign({ recordId: record.recordId, fieldKey })
                  : { status: "error", message: "Reload and try again." },
              "Signed."
            )
          }}
        />
        {/* Stays open, holding the reason, until the record has gone back. */}
        {sendBack && sendingBack && canApprove && recordId && (
          <SendBackForm
            pending={pending}
            onSend={(reason) =>
              run(
                () => sendBack({ recordId, reason }),
                "Sent back to the writer."
              )
            }
            onCancel={() => setSendingBack(false)}
          />
        )}
        {sheet.stale && (
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
        <LeaveGuard active={canWrite && sheet.unsaved} flush={sheet.flush} />
      </div>
    </RecordUploads.Provider>
  )
}
