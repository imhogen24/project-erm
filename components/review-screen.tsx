"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { SegmentedChoice } from "@/components/segmented-choice"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { Button } from "@/components/ui/button"
import { reviewChoices, type ReviewFile, type ReviewResult } from "@/lib/review"

type Change = { recordId: string; target: "request" | number; status: string }

type Props = {
  recordId: string
  requestStatus: string
  files: ReviewFile[]
  // The OM changes the statuses while D1.1 is a draft. Anyone else reads them.
  canReview: boolean
  canApprove: boolean
  setStatus: (change: Change) => Promise<ReviewResult>
  submit: (values: { recordId: string }) => Promise<ReviewResult>
  approve: (values: { recordId: string }) => Promise<ReviewResult>
}

// How wide each column is when there is room. Narrow, the rows stack instead.
const requestWidths = "minmax(0,1fr) 16rem"

const filesWidths = "minmax(0,1.6fr) 8rem 7rem 16rem"

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

// A status the OM can switch, or the system's own once it is Approved.
function Status({
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
  if (value === "Approved") {
    return <span className="text-sm font-medium">Approved</span>
  }

  return (
    <SegmentedChoice
      label={label}
      value={value}
      choices={reviewChoices.map((choice) => ({ value: choice }))}
      disabled={disabled}
      onChange={onChange}
    />
  )
}

// The review of D1.1: the request and each file switch between Pending and
// Reviewed, and the record can be sent for approval once all are Reviewed. The
// server decides every change; this sends it and shows what came back.
export function ReviewScreen({
  recordId,
  requestStatus,
  files,
  canReview,
  canApprove,
  setStatus,
  submit,
  approve,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [request, setRequest] = useState(requestStatus)
  const [rows, setRows] = useState(files.map((file) => file.status))
  const [message, setMessage] = useState<string>()
  const [failure, setFailure] = useState<string>()

  function run(send: () => Promise<ReviewResult>, saidDone: string) {
    setMessage(undefined)
    setFailure(undefined)
    startTransition(async () => {
      const result = await send()
      const refused = problem(result)

      if (refused) {
        setFailure(refused)

        return
      }

      setMessage(saidDone)
      router.refresh()
    })
  }

  function change(target: "request" | number, status: string) {
    const before = { request, rows }

    setMessage(undefined)
    setFailure(undefined)

    if (target === "request") {
      setRequest(status)
    } else {
      setRows(rows.map((row, index) => (index === target ? status : row)))
    }

    startTransition(async () => {
      const refused = problem(await setStatus({ recordId, target, status }))

      if (refused) {
        setRequest(before.request)
        setRows(before.rows)
        setFailure(refused)

        return
      }

      router.refresh()
    })
  }

  const ready =
    request === "Reviewed" && rows.every((row) => row === "Reviewed")

  const locked = !canReview || pending

  return (
    <div className="flex flex-col gap-8">
      <TableBox title="Request status">
        <DataTable
          label="Request status"
          columns={["Item", "Status"]}
          widths={requestWidths}
        >
          <DataRow widths={requestWidths}>
            <DataCell label="Item">
              <span className="text-sm font-medium">The whole request</span>
            </DataCell>
            <DataCell label="Status">
              <Status
                label="Request status"
                value={request}
                disabled={locked}
                onChange={(status) => change("request", status)}
              />
            </DataCell>
          </DataRow>
        </DataTable>
      </TableBox>
      <TableBox title="Attached files">
        {files.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No files were attached to this request.
          </p>
        ) : (
          <DataTable
            label="Attached files"
            columns={["File", "Uploaded", "", "Status"]}
            widths={filesWidths}
          >
            {files.map((file, index) => (
              <DataRow key={index} widths={filesWidths}>
                <DataCell label="File">
                  <span className="text-sm font-medium break-words">
                    {file.label}
                  </span>
                </DataCell>
                <DataCell label="Uploaded">
                  <span className="text-sm">{file.dateUploaded}</span>
                </DataCell>
                <DataCell label="">
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
                </DataCell>
                <DataCell label="Status">
                  <Status
                    label={`Status of ${file.label}`}
                    value={rows[index] ?? file.status}
                    disabled={locked}
                    onChange={(status) => change(index, status)}
                  />
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        )}
      </TableBox>
      {canReview && !ready && (
        <p className="text-sm text-muted-foreground">
          Mark the request and every file Reviewed to submit.
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      {(canReview || canApprove) && (
        <SheetActions message={message}>
          {canReview && (
            <ActionButton
              disabled={!ready || pending}
              onClick={() => run(() => submit({ recordId }), "Submitted.")}
            >
              Submit for approval
            </ActionButton>
          )}
          {canApprove && (
            <ActionButton
              disabled={pending}
              onClick={() => run(() => approve({ recordId }), "Approved.")}
            >
              Approve
            </ActionButton>
          )}
        </SheetActions>
      )}
    </div>
  )
}
