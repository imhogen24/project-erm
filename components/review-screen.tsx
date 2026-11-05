"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { reviewChoices, type ReviewFile, type ReviewResult } from "@/lib/review"

type Change = { recordId: string; target: "request" | number; status: string }

type Props = {
  recordId: string
  requestStatus: string
  files: ReviewFile[]
  setStatus: (change: Change) => Promise<ReviewResult>
  submit: (values: { recordId: string }) => Promise<ReviewResult>
}

function problem(result: ReviewResult) {
  switch (result.status) {
    case "done":
      return undefined
    case "invalid":
      return result.errors.map((error) => error.message).join(", ")
    case "stale":
      return "Someone else changed this record. Reload to see their changes."
    case "error":
      return result.message
  }
}

function StatusSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (status: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-12 w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {reviewChoices.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {choice}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// The OM's review of D1.1: the request and each file switch between Pending
// and Reviewed, and the record can be sent for approval once all are Reviewed.
// The server decides every change; this sends it and shows what came back.
export function ReviewScreen({
  recordId,
  requestStatus,
  files,
  setStatus,
  submit,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [request, setRequest] = useState(requestStatus)
  const [rows, setRows] = useState(files.map((file) => file.status))
  const [message, setMessage] = useState<string>()

  function change(target: "request" | number, status: string) {
    const before = { request, rows }

    setMessage(undefined)

    if (target === "request") {
      setRequest(status)
    } else {
      setRows(rows.map((row, index) => (index === target ? status : row)))
    }

    startTransition(async () => {
      const failure = problem(await setStatus({ recordId, target, status }))

      if (failure) {
        setRequest(before.request)
        setRows(before.rows)
        setMessage(failure)

        return
      }

      router.refresh()
    })
  }

  function send() {
    setMessage(undefined)
    startTransition(async () => {
      const failure = problem(await submit({ recordId }))

      if (failure) {
        setMessage(failure)

        return
      }

      router.refresh()
    })
  }

  const ready =
    request === "Reviewed" && rows.every((row) => row === "Reviewed")

  return (
    <div className="@container flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Request status</span>
        <StatusSelect
          label="Request status"
          value={request}
          disabled={pending}
          onChange={(status) => change("request", status)}
        />
      </div>
      <section aria-label="Attached files" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Attached files</h2>
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
                    {file.dateUploaded}
                  </span>
                </div>
                <div className="flex flex-col gap-3 @md:flex-row @md:items-center">
                  {file.fileLink && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="self-start"
                    >
                      <a
                        href={`/api/files/${recordId}?ref=${encodeURIComponent(file.fileLink)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open file
                        <span className="sr-only">, {file.label}</span>
                      </a>
                    </Button>
                  )}
                  <StatusSelect
                    label={`Status of ${file.label}`}
                    value={rows[index] ?? file.status}
                    disabled={pending}
                    onChange={(status) => change(index, status)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full px-8 text-base sm:w-fit"
          disabled={!ready || pending}
          onClick={send}
        >
          Submit for approval
        </Button>
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Mark the request and every file Reviewed to submit.
          </p>
        )}
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
