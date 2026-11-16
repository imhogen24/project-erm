"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { SegmentedChoice } from "@/components/segmented-choice"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { LeaveGuard, StaleNotice } from "@/components/unsaved-guard"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { ClientFile } from "@/lib/client-files"
import type { FieldError, FormValues, TableRow } from "@/lib/tool-definition"
import { PROCEED, REJECT, type TriageValues } from "@/lib/triage"
import {
  useAutosave,
  type SaveInput as Save,
  type SaveResult as Result,
} from "@/lib/use-autosave"

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
}

// How wide each column is when there is room. Narrow, the rows stack instead.
const filesWidths =
  "minmax(0,calc(100%/var(--page-columns,3))) minmax(0,1fr) minmax(0,1fr)"

const checksWidths =
  "minmax(0,calc(100%/var(--page-columns,3))) minmax(0,1fr) minmax(0,1fr)"

type Answer = { status: string; notes: string }

type Held = { descriptions: string[]; answers: Answer[]; decision: string }

// The OM's triage of a request: describe each file, answer the three fixed
// checks, and choose to proceed or reject. It saves by itself as it is
// filled in. The server decides every rule; this sends what was typed and
// shows what came back. The decision buttons only choose. Submit for approval
// is what sends.
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
}: Props) {
  const [pending, startTransition] = useTransition()

  const [descriptions, setDescriptions] = useState(
    files.map((_, index) => saved.digitalRecords[index]?.fileName ?? "")
  )

  const [answers, setAnswers] = useState<Answer[]>(
    checks.map((_, index) => ({
      status: saved.triageChecklist[index]?.status ?? "",
      notes: saved.triageChecklist[index]?.reviewerNotes ?? "",
    }))
  )

  const [decision, setDecision] = useState(saved.triageDecision)

  const sheet = useAutosave({
    projectId,
    toolId: "D1.2",
    cycle,
    recordId: savedRecordId,
    updatedAt: savedUpdatedAt,
    save,
  })

  const recordId = sheet.recordId

  // What Submit found wrong. A refused save's own errors show otherwise.
  const [stepErrors, setStepErrors] = useState<FieldError[]>([])
  const errors = stepErrors.length > 0 ? stepErrors : sheet.errors

  const failed = answers.some((answer) => answer.status === "Fail")
  const proceedLabel = tier3 ? "Proceed to D1.3a" : PROCEED

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

  // Every edit is shown at once and saved a moment later.
  function edit(change: Partial<Held>) {
    const next = { ...held, ...change }

    setDescriptions(next.descriptions)
    setAnswers(next.answers)
    setDecision(next.decision)
    sheet.changed(valuesOf(next))
  }

  function setAnswer(index: number, change: Partial<Answer>) {
    edit({
      answers: answers.map((answer, at) =>
        at === index ? { ...answer, ...change } : answer
      ),
      // A failed check takes Proceed away, so a chosen Proceed is let go.
      ...(change.status === "Fail" && decision === PROCEED && { decision: "" }),
    })
  }

  function typed(): Save {
    return {
      projectId,
      toolId: "D1.2",
      cycle,
      values: valuesOf(held),
      // Read once the save before it is done, so it is the newest.
      expectedUpdatedAt: sheet.updatedAt(),
    }
  }

  function run(send: () => Promise<Result>, saidDone: string) {
    sheet.setMessage(undefined)
    setStepErrors([])
    startTransition(async () => {
      // What was typed is saved first. When that save fails the step does not
      // run: the foot already says why.
      if (canWrite && !(await sheet.flush())) {
        return
      }

      // Every step revalidates the page, so its response draws the page again.
      const result = await send()

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
        setStepErrors(result.errors)

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

  const decisionError = errors.find(
    (error) => error.field === "triageDecision"
  )?.message

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
          onValueChange={(value) => edit({ decision: value })}
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
      {(canWrite || (canApprove && recordId) || sheet.footLine) && (
        <SheetActions message={sheet.footLine}>
          {canWrite && (
            <ActionButton
              disabled={pending}
              onClick={() => run(() => submit(typed()), "Submitted.")}
            >
              Submit for approval
            </ActionButton>
          )}
          {canApprove && recordId && (
            <ActionButton
              disabled={pending}
              onClick={() => run(() => approve({ recordId }), "Approved.")}
            >
              Approve
            </ActionButton>
          )}
        </SheetActions>
      )}
      {sheet.stale && <StaleNotice sheet={sheet} />}
      {canWrite && <LeaveGuard sheet={sheet} />}
    </div>
  )
}
