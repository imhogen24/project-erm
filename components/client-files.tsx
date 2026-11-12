"use client"

import { useRef, useState } from "react"
import { FileTextIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel } from "@/components/ui/field"
import { fileReference } from "@/lib/file-reference"
import { useUploadThing } from "@/lib/uploadthing"

export type AttachedFile = { reference: string; name: string }

type Props = {
  files: AttachedFile[]
  max: number
  error?: string
  // While the form is being sent, the list cannot change.
  disabled?: boolean
  onChange: (files: AttachedFile[]) => void
  onUploading: (uploading: boolean) => void
}

// The client's files on their web form: photos and PDFs, uploaded the moment
// they are chosen. Only the list is sent with the form.
export function ClientFiles({
  files,
  max,
  error,
  disabled = false,
  onChange,
  onUploading,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number>()
  const [failed, setFailed] = useState<string>()

  const { startUpload } = useUploadThing("clientFiles", {
    onUploadProgress: setProgress,
  })

  async function upload(chosen: File[]) {
    if (chosen.length === 0) {
      return
    }

    if (files.length + chosen.length > max) {
      setFailed(`Attach at most ${max} files.`)

      return
    }

    setFailed(undefined)
    setProgress(0)
    onUploading(true)

    try {
      const done = await startUpload(chosen)

      if (!done) {
        throw new Error("Upload refused")
      }

      onChange([
        ...files,
        ...done.map((file) => ({
          reference: fileReference(file.serverData.id),
          name: file.serverData.name,
        })),
      ])
    } catch {
      setFailed(
        "The upload did not finish. Use images or PDFs of 16MB or less, and try again."
      )
    } finally {
      setProgress(undefined)
      onUploading(false)
    }
  }

  const uploading = progress !== undefined
  const shownError = failed ?? error

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor="request-files" className="text-sm">
        Reference uploads
        <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      {files.length > 0 && (
        <ul aria-label="Attached files" className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.reference}
              className="tile flex items-center gap-3 p-3"
            >
              <FileTextIcon aria-hidden className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {file.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${file.name}`}
                disabled={uploading || disabled}
                onClick={() =>
                  onChange(
                    files.filter((each) => each.reference !== file.reference)
                  )
                }
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        id="request-files"
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        disabled={uploading || disabled || files.length >= max}
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])]

          event.target.value = ""
          void upload(chosen)
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full sm:w-fit"
        disabled={uploading || disabled || files.length >= max}
        aria-invalid={shownError !== undefined}
        onClick={() => input.current?.click()}
      >
        <PaperclipIcon aria-hidden />
        {uploading ? `Uploading ${progress}%` : "Add files"}
      </Button>
      {shownError && <FieldError>{shownError}</FieldError>}
    </div>
  )
}
