"use client"

import { createContext, useContext, useRef, useState } from "react"
import { FileTextIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fileIdOf, fileReference } from "@/lib/file-reference"
import { useUploadThing } from "@/lib/uploadthing"

// The project and tool a record screen is for, so a file cell can upload
// straight onto it. Without it, a cell only takes a link.
export const RecordUploads = createContext<{
  projectId: string
  toolId: string
} | null>(null)

type Props = {
  id: string
  value: string
  recordId?: string
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}

// What a stored reference is called before its file's own name is known.
function nameOf(reference: string): string {
  if (fileIdOf(reference)) {
    return "Uploaded file"
  }

  return URL.canParse(reference) ? new URL(reference).hostname : reference
}

// A file in a table: a link pasted in, or a photo, video or PDF uploaded into
// the ERM. Once set, it opens through the record, and can be removed while the
// record is being written.
export function FileCell({
  id,
  value,
  recordId,
  invalid,
  describedBy,
  onChange,
}: Props) {
  const uploads = useContext(RecordUploads)
  const input = useRef<HTMLInputElement>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<number>()
  const [failed, setFailed] = useState<string>()

  const { startUpload } = useUploadThing("recordFiles", {
    onUploadProgress: setProgress,
  })

  async function upload(chosen: File | undefined) {
    if (!chosen || !uploads) {
      return
    }

    setFailed(undefined)
    setProgress(0)

    try {
      const done = await startUpload([chosen], uploads)
      const file = done?.[0]

      if (!file) {
        throw new Error("Upload refused")
      }

      const reference = fileReference(file.serverData.id)

      setNames((known) => ({ ...known, [reference]: file.serverData.name }))
      onChange(reference)
    } catch {
      setFailed(
        "The upload did not finish. Use a photo, PDF (16MB) or video (64MB), and try again."
      )
    } finally {
      setProgress(undefined)
    }
  }

  if (value) {
    return (
      <div className="flex min-h-12 items-center gap-2">
        <FileTextIcon aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm">
          {names[value] ?? nameOf(value)}
        </span>
        {recordId && (
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/files/${recordId}?ref=${encodeURIComponent(value)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open<span className="sr-only"> {names[value] ?? "file"}</span>
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove the file"
          onClick={() => onChange("")}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
    )
  }

  const uploading = progress !== undefined

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <Input
          id={id}
          type="url"
          placeholder="https://"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="h-12 min-w-0 flex-1"
          onBlur={(event) => {
            if (event.target.value.trim()) {
              onChange(event.target.value.trim())
            }
          }}
        />
        {uploads && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*,video/*,application/pdf"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const chosen = event.target.files?.[0]

                event.target.value = ""
                void upload(chosen)
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              <UploadSimpleIcon aria-hidden />
              {uploading ? `${progress}%` : "Upload"}
            </Button>
          </>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failed}
        </p>
      )}
    </div>
  )
}
