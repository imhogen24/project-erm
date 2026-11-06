"use client"

import { useRouter } from "next/navigation"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { ReviewFile } from "@/lib/review"
import type { FieldError, FormValues, TableRow } from "@/lib/tool-definition"
import { PROCEED, REJECT, type TriageValues } from "@/lib/triage"

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
  files: ReviewFile[]
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
const filesWidths = "minmax(0,1.3fr) 7rem 7rem minmax(0,2fr)"

const checksWidths = "minmax(0,1.4fr) 11rem minmax(0,2fr)"

const decisionWidths = "3.5rem minmax(0,1fr) minmax(0,2fr)"

const STALE = "Someone else saved this record. Reload to see their changes."

// The OM's triage of a request: describe each file, answer the three fixed
// checks, and choose to proceed or reject. The server decides every rule; this
// sends what was typed and shows what came back. The decision buttons only
// choose. Submit for approval is what sends.
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

  // The record and the time to save over move on with each save, so they are
  // held here and taken again when the page gives new ones.
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

  const failed = answers.some((answer) => answer.status === "Fail")
  const proceedLabel = tier3 ? "Proceed to D1.3a" : PROCEED

  function setAnswer(index: number, change: Partial<(typeof answers)[number]>) {
    setAnswers(
      answers.map((answer, at) =>
        at === index ? { ...answer, ...change } : answer
      )
    )

    // A failed check takes Proceed away, so a chosen Proceed is let go.
    if (change.status === "Fail" && decision === PROCEED) {
      setDecision("")
    }
  }

  function typed(): Save {
    return {
      projectId,
      toolId: "D1.2",
      cycle,
      values: {
        digitalRecords: descriptions.map((fileName): TableRow =>
          fileName === "" ? {} : { fileName }
        ),
        triageChecklist: checks.map((check, index) => ({
          check,
          ...(answers[index]?.status && { status: answers[index].status }),
          ...(answers[index]?.notes && {
            reviewerNotes: answers[index].notes,
          }),
        })),
        ...(decision !== "" && { triageDecision: decision }),
      },
      expectedUpdatedAt: updatedAt,
    }
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
    <div className="flex flex-col gap-8">
      <TableBox title="Files">
        {files.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No files were attached to this request.
          </p>
        ) : (
          <DataTable
            label="Files"
            columns={["File", "Status", "", "Description"]}
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
                <DataCell label="Status">
                  <span className="text-sm">{file.status}</span>
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
                      setDescriptions(
                        descriptions.map((each, at) =>
                          at === index ? event.target.value : each
                        )
                      )
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
                  choices={[{ value: "Pass" }, { value: "Fail", danger: true }]}
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
      <TableBox title="Triage decision">
        <RadioGroup
          aria-label="Triage decision"
          value={decision}
          disabled={locked}
          className="gap-0"
          onValueChange={setDecision}
        >
          <DataTable
            label="Triage decision"
            columns={["", "Decision", "What happens"]}
            widths={decisionWidths}
          >
            {decisions.map(({ option, label, effect, off }) => (
              <DataRow key={option} widths={decisionWidths}>
                <DataCell label="">
                  <RadioGroupItem
                    value={option}
                    id={`decision-${option}`}
                    aria-label={label}
                    className="border-foreground/50"
                    disabled={locked || off}
                  />
                </DataCell>
                <DataCell label="Decision">
                  <label
                    htmlFor={`decision-${option}`}
                    className="text-sm font-medium"
                  >
                    {label}
                  </label>
                </DataCell>
                <DataCell label="What happens">
                  <span className="text-sm text-muted-foreground">
                    {off && canWrite
                      ? "Resolve the failed checks to proceed"
                      : effect}
                  </span>
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        </RadioGroup>
        {decisionError && (
          <p className="border-t border-foreground/20 px-4 py-3 text-sm text-destructive">
            {decisionError}
          </p>
        )}
      </TableBox>
      {other.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1">
          {other.map((error, index) => (
            <li key={index} className="text-sm text-destructive">
              {error.message}
            </li>
          ))}
        </ul>
      )}
      <SheetActions message={message}>
        {canWrite && (
          <>
            <ActionButton
              variant="outline"
              disabled={pending}
              onClick={() => run(() => save(typed()), "Draft saved.")}
            >
              Save draft
            </ActionButton>
            <ActionButton
              disabled={pending}
              onClick={() => run(() => submit(typed()), "Submitted.")}
            >
              Submit for approval
            </ActionButton>
          </>
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
