"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ReviewFile } from "@/lib/review"
import type { FieldError, FormValues, TableRow } from "@/lib/tool-definition"
import { PROCEED, REJECT, checkStatuses, type TriageValues } from "@/lib/triage"

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

  return (
    <div className="@container flex flex-col gap-8">
      <section aria-label="Files" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Files</h2>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No files were attached to this request.
          </p>
        ) : (
          <ul className="flex flex-col">
            {files.map((file, index) => (
              <li
                key={index}
                className="flex flex-col gap-3 border border-foreground/20 p-4 not-first:border-t-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium break-words">
                    {file.label}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {file.dateUploaded} · {file.status}
                  </span>
                </div>
                <div className="flex flex-col gap-3 @md:flex-row @md:items-center">
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
                  <Input
                    aria-label={`Description of ${file.label}`}
                    placeholder="Describe this file"
                    value={descriptions[index] ?? ""}
                    disabled={locked}
                    className="h-12 @md:flex-1"
                    onChange={(event) =>
                      setDescriptions(
                        descriptions.map((each, at) =>
                          at === index ? event.target.value : each
                        )
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Preliminary triage" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Preliminary triage</h2>
        <div className="flex flex-col">
          {checks.map((check, index) => (
            <fieldset
              key={check}
              className="flex flex-col gap-3 border border-foreground/20 p-4 not-first:border-t-0"
            >
              <legend className="px-1 text-sm font-medium">{check}</legend>
              <div className="flex flex-col gap-3 @md:flex-row @md:items-start">
                <div className="flex flex-col gap-1">
                  <Select
                    value={answers[index]?.status ?? ""}
                    disabled={locked}
                    onValueChange={(status) => setAnswer(index, { status })}
                  >
                    <SelectTrigger
                      aria-label={`Status: ${check}`}
                      aria-invalid={errorAt(index, "status") !== undefined}
                      className="h-12 w-full @md:w-40"
                    >
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {checkStatuses.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errorAt(index, "status") && (
                    <p className="text-sm text-destructive">
                      {errorAt(index, "status")}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1 @md:flex-1">
                  <Textarea
                    aria-label={`Reviewer notes: ${check}`}
                    aria-invalid={errorAt(index, "reviewerNotes") !== undefined}
                    placeholder="Reviewer notes"
                    value={answers[index]?.notes ?? ""}
                    disabled={locked}
                    onChange={(event) =>
                      setAnswer(index, { notes: event.target.value })
                    }
                  />
                  {errorAt(index, "reviewerNotes") && (
                    <p className="text-sm text-destructive">
                      {errorAt(index, "reviewerNotes")}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>
          ))}
        </div>
      </section>
      <section aria-label="Triage decision" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Triage decision</h2>
        <div className="flex flex-col gap-3 @md:flex-row">
          {[
            { option: PROCEED, label: proceedLabel, off: failed },
            { option: REJECT, label: REJECT, off: false },
          ].map(({ option, label, off }) => (
            <Button
              key={option}
              type="button"
              size="lg"
              variant={decision === option ? "default" : "outline"}
              aria-pressed={decision === option}
              disabled={locked || off}
              className="h-12 w-full px-8 text-base @md:w-fit"
              onClick={() => setDecision(option)}
            >
              {label}
            </Button>
          ))}
        </div>
        {failed && canWrite && (
          <p className="text-sm text-muted-foreground">
            Resolve the failed checks to proceed
          </p>
        )}
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
      {canWrite && (
        <div className="flex flex-col gap-3 @md:flex-row">
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="h-12 w-full px-8 text-base @md:w-fit"
            disabled={pending}
            onClick={() => run(() => save(typed()), "Draft saved.")}
          >
            Save draft
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full px-8 text-base @md:w-fit"
            disabled={pending}
            onClick={() => run(() => submit(typed()), "Submitted.")}
          >
            Submit for approval
          </Button>
        </div>
      )}
      {canApprove && recordId && (
        <Button
          type="button"
          size="lg"
          className="h-12 w-full px-8 text-base @md:w-fit"
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
