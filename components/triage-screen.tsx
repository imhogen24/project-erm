"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { SegmentedChoice } from "@/components/segmented-choice"
import {
  SendBackButton,
  SendBackForm,
  SentBackNotice,
} from "@/components/send-back"
import { LeaveGuard } from "@/components/leave-guard"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { ClientFile } from "@/lib/client-files"
import type { FieldError, FormValues, TableRow } from "@/lib/tool-definition"
import { PROCEED, REJECT, type TriageValues } from "@/lib/triage"
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
  projectId: string
  cycle: number
  // The D1.2 record and the time to save over. Both are empty before the first
  // save.
  recordId?: string
  updatedAt?: string
  // The files of D1.1, read live, and the D1.1 record they are opened through.
  files: ClientFile[]
  filesRecordId: string | null
  // The fixed checks, in order.
  checks: string[]
  // What the OM saved.
  saved: TriageValues
  // Tier 3 shows "Proceed to D1.3a", and stores the same option.
  tier3: boolean
  canWrite: boolean
  canApprove: boolean
  save: (values: Save) => Promise<Result>
  submit: (values: Save) => Promise<Result>
  approve: (values: { recordId: string }) => Promise<Result>
  // Given to whoever may approve: returns the record to the OM, saying why.
  sendBack?: (values: { recordId: string; reason: string }) => Promise<Result>
  // Why the approver sent this draft back, shown above the sheet.
  sentBack?: string
  // The writer's button once the triage is out of their hands: Withdraw while
  // it waits for approval, Request a change once it is locked.
  writerAction?: ReactNode
}

// How wide each column is when there is room. Narrow, the rows stack instead.
const filesWidths =
  "minmax(0,calc(100%/var(--page-columns,3))) minmax(0,1fr) minmax(0,1fr)"

const checksWidths =
  "minmax(0,calc(100%/var(--page-columns,3))) minmax(0,1fr) minmax(0,1fr)"

const STALE = "Someone else saved this record. Reload to see their changes."

// The OM's triage of a request: describe each file, answer the three fixed
// checks, and choose to proceed or reject. The server decides every rule; this
// sends what was typed and shows what came back. The decision buttons only
// choose, and pressing the chosen one again leaves neither chosen. Submit for
// approval is what sends.
export function TriageScreen({
  projectId,
  cycle,
  recordId: savedRecordId,
  updatedAt: savedUpdatedAt,
  files,
  filesRecordId,
  checks,
  saved,
  tier3,
  canWrite,
  canApprove,
  save,
  submit,
  approve,
  sendBack,
  sentBack,
  writerAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [descriptions, setDescriptions] = useState(
    files.map((_, index) => saved.digitalRecords[index]?.fileName ?? "")
  )

  const [answers, setAnswers] = useState(
    checks.map((_, index) => ({
      status: saved.triageChecklist[index]?.status ?? "",
      notes: saved.triageChecklist[index]?.reviewerNotes ?? "",
    }))
  )

  const [decision, setDecision] = useState(saved.triageDecision)

  // Every edit is saved a moment after typing stops; a dropped connection is
  // tried again, and leaving asks first while anything is not saved.
  const sheet = useAutosave({
    projectId,
    toolId: "D1.2",
    cycle,
    recordId: savedRecordId,
    updatedAt: savedUpdatedAt,
    save,
  })

  const recordId = sheet.recordId
  const errors = sheet.errors
  const [sendingBack, setSendingBack] = useState(false)

  const failed = answers.some((answer) => answer.status === "Fail")
  const proceedLabel = tier3 ? "Proceed to D1.3a" : PROCEED

  type Held = {
    descriptions: string[]
    answers: typeof answers
    decision: string
  }

  const held: Held = { descriptions, answers, decision }

  function valuesOf(next: Held): FormValues {
    return {
      digitalRecords: next.descriptions.map((fileName): TableRow =>
        fileName === "" ? {} : { fileName }
      ),
      triageChecklist: checks.map((check, index) => ({
        check,
        ...(next.answers[index]?.status && {
          status: next.answers[index].status,
        }),
        ...(next.answers[index]?.notes && {
          reviewerNotes: next.answers[index].notes,
        }),
      })),
      ...(next.decision !== "" && { triageDecision: next.decision }),
    }
  }

  function edit(change: Partial<Held>) {
    const next = { ...held, ...change }

    setDescriptions(next.descriptions)
    setAnswers(next.answers)
    setDecision(next.decision)
    sheet.changed(valuesOf(next))
  }

  function setAnswer(index: number, change: Partial<(typeof answers)[number]>) {
    edit({
      answers: answers.map((answer, at) =>
        at === index ? { ...answer, ...change } : answer
      ),
      // A failed check takes Proceed away, so a chosen Proceed is let go.
      ...(change.status === "Fail" && decision === PROCEED && { decision: "" }),
    })
  }

  // Runs a step once every edit is saved, so the step reads it. When that save
  // fails, the step does not run: it would read an older copy.
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
      // Edits not saved yet go first. Submit sends the values itself.
      if (canWrite && !(await sheet.flush())) {
        return
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

  function errorAt(index: number, column: string) {
    return errors.find(
      (error) =>
        error.field === "triageChecklist" &&
        error.row === index &&
        error.column === column
    )?.message
  }

  const refused = errors.find(
    (error) => error.field === "triageDecision"
  )?.message

  const decisionError =
    refused === "Required" ? "Choose a triage decision to submit." : refused

  // Anything the fields above do not show.
  const other = errors.filter(
    (error) =>
      error.field !== "triageDecision" &&
      !(error.field === "triageChecklist" && error.row !== undefined)
  )

  const locked = !canWrite || pending

  const decisions = [
    {
      option: PROCEED,
      label: proceedLabel,
      effect: tier3 ? "Opens T3.D1.3a for the OM." : "Opens D1.3 for the OM.",
      off: failed,
    },
    {
      option: REJECT,
      label: REJECT,
      effect: "Ends the project as rejected. Nothing else happens.",
      off: false,
    },
  ]

  return (
    // Final when this person can no longer write it, never just while saving,
    // so a save in flight does not turn the fields into text.
    <div data-final={!canWrite} className="flex flex-col gap-8">
      <SentBackNotice reason={sentBack} />
      <TableBox title="Files">
        {files.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No files were attached to this request.
          </p>
        ) : (
          <DataTable
            label="Files"
            columns={["File", "", "Description"]}
            widths={filesWidths}
          >
            {files.map((file, index) => (
              <DataRow key={index} widths={filesWidths}>
                <DataCell label="File">
                  <span className="text-sm font-medium break-words">
                    {file.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Uploaded {file.dateUploaded}
                  </span>
                </DataCell>
                <DataCell label="">
                  {file.fileLink && filesRecordId && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="self-start"
                    >
                      <a
                        href={`/api/files/${filesRecordId}?ref=${encodeURIComponent(file.fileLink)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open file
                        <span className="sr-only">, {file.label}</span>
                      </a>
                    </Button>
                  )}
                </DataCell>
                <DataCell label="Description">
                  <Textarea
                    aria-label={`Description of ${file.label}`}
                    placeholder="Describe this file"
                    value={descriptions[index] ?? ""}
                    disabled={locked}
                    className="min-h-16 border-foreground/40 bg-background"
                    onChange={(event) =>
                      edit({
                        descriptions: descriptions.map((each, at) =>
                          at === index ? event.target.value : each
                        ),
                      })
                    }
                  />
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        )}
      </TableBox>
      <TableBox title="Triage checks">
        <DataTable
          label="Triage checks"
          columns={["Check", "Result", "Reviewer notes"]}
          widths={checksWidths}
        >
          {checks.map((check, index) => (
            <DataRow key={check} widths={checksWidths}>
              <DataCell label="Check">
                <span className="text-sm font-medium">{check}</span>
              </DataCell>
              <DataCell label="Result">
                <SegmentedChoice
                  label={`Result: ${check}`}
                  value={answers[index]?.status ?? ""}
                  choices={[
                    { value: "Pass", tone: "good" },
                    { value: "Fail", tone: "bad" },
                  ]}
                  disabled={locked}
                  onChange={(status) => setAnswer(index, { status })}
                />
                {errorAt(index, "status") && (
                  <p className="text-sm text-destructive">
                    {errorAt(index, "status")}
                  </p>
                )}
              </DataCell>
              <DataCell label="Reviewer notes">
                <Textarea
                  aria-label={`Reviewer notes: ${check}`}
                  aria-invalid={errorAt(index, "reviewerNotes") !== undefined}
                  placeholder="Reviewer notes"
                  value={answers[index]?.notes ?? ""}
                  disabled={locked}
                  className="min-h-16 border-foreground/40 bg-background"
                  onChange={(event) =>
                    setAnswer(index, { notes: event.target.value })
                  }
                />
                {errorAt(index, "reviewerNotes") && (
                  <p className="text-sm text-destructive">
                    {errorAt(index, "reviewerNotes")}
                  </p>
                )}
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </TableBox>
      <section aria-label="Triage decision" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Triage decision</h2>
        <RadioGroup
          aria-label="Triage decision"
          value={decision}
          disabled={locked}
          className="grid gap-3 md:grid-cols-2"
          onValueChange={(next) => edit({ decision: next })}
        >
          {decisions.map(({ option, label, effect, off }) => (
            <label
              key={option}
              htmlFor={`decision-${option}`}
              className="tile-choice"
            >
              <RadioGroupItem
                value={option}
                id={`decision-${option}`}
                aria-label={label}
                className="mt-0.5"
                disabled={locked || off}
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-sm text-muted-foreground">
                  {off && canWrite
                    ? "Resolve the failed checks to proceed"
                    : effect}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {decisionError && (
          <p className="text-sm text-destructive">{decisionError}</p>
        )}
      </section>
      {other.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1">
          {other.map((error, index) => (
            <li key={index} className="text-sm text-destructive">
              {error.message}
            </li>
          ))}
        </ul>
      )}
      {(canWrite ||
        (canApprove && recordId) ||
        writerAction ||
        sheet.footLine) && (
        <SheetActions message={sheet.footLine}>
          {canWrite && (
            <ActionButton
              disabled={pending}
              onClick={() =>
                run(
                  (record) =>
                    submit({
                      projectId,
                      toolId: "D1.2",
                      cycle,
                      values: valuesOf(held),
                      expectedUpdatedAt: record.updatedAt,
                    }),
                  "Submitted."
                )
              }
            >
              Submit for approval
            </ActionButton>
          )}
          {writerAction}
          {canApprove && recordId && (
            <>
              {sendBack && (
                <SendBackButton
                  open={sendingBack}
                  disabled={pending}
                  onToggle={() => setSendingBack((open) => !open)}
                />
              )}
              <ActionButton
                disabled={pending}
                onClick={() => run(() => approve({ recordId }), "Approved.")}
              >
                Approve
              </ActionButton>
            </>
          )}
        </SheetActions>
      )}
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
  )
}
