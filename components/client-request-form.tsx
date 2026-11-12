"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { ClientFiles, type AttachedFile } from "@/components/client-files"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  questionsFor,
  type ClientAnswers,
  type Question,
  type Tier,
} from "@/lib/client-request-form"
import { MAX_FILES } from "@/lib/file-reference"

type Result =
  | { status: "done"; path: string }
  | { status: "invalid"; errors: { field: string; message: string }[] }
  | { status: "error"; message: string }

type Props = {
  track: Tier
  // What the client sent before, when they change it after a change request.
  saved?: ClientAnswers
  savedFiles?: AttachedFile[]
  submitLabel: string
  // The files go as `file:<id>` for a new upload, or as D1.1 holds them.
  submit: (answers: ClientAnswers, files: string[]) => Promise<Result>
}

const fieldClass = "bg-background text-base md:text-base"

function listOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : []
}

function textOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? "" : (value ?? "")
}

// The client's web form, Tier 1 or Tier 3, with the website's questions and
// rules. The server checks everything again; this only shows what it says.
export function ClientRequestForm({
  track,
  saved,
  savedFiles,
  submitLabel,
  submit,
}: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<ClientAnswers>(saved ?? {})
  const [files, setFiles] = useState<AttachedFile[]>(savedFiles ?? [])
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  function set(column: string, value: string | string[]) {
    setAnswers((before) => ({ ...before, [column]: value }))
  }

  function send() {
    setMessage(undefined)
    startTransition(async () => {
      const result = await submit(
        answers,
        files.map((file) => file.reference)
      )

      if (result.status === "done") {
        router.push(result.path)
        router.refresh()

        return
      }

      if (result.status === "invalid") {
        setErrors(
          Object.fromEntries(
            result.errors.map((error) => [error.field, error.message])
          )
        )
        setMessage("Check the answers marked in red above.")

        return
      }

      setMessage(result.message)
    })
  }

  function control(question: Question) {
    const id = `request-${question.column}`
    const value = answers[question.column]
    const invalid = errors[question.column] !== undefined

    if (question.kind === "pick") {
      return (
        <RadioGroup
          value={textOf(value)}
          onValueChange={(next) => set(question.column, next)}
          aria-label={question.label}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(question.options ?? []).map((option) => (
            <label key={option} className="tile-choice items-center p-3">
              <RadioGroupItem value={option} aria-label={option} />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </RadioGroup>
      )
    }

    if (question.kind === "choose") {
      const picked = listOf(value)

      return (
        <div
          role="group"
          aria-label={question.label}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(question.options ?? []).map((option) => (
            <label key={option} className="tile-choice items-center p-3">
              <Checkbox
                aria-label={option}
                checked={picked.includes(option)}
                onCheckedChange={(checked) =>
                  set(
                    question.column,
                    checked
                      ? [...picked, option]
                      : picked.filter((each) => each !== option)
                  )
                }
              />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </div>
      )
    }

    if (question.kind === "longText") {
      return (
        <Textarea
          id={id}
          value={textOf(value)}
          aria-invalid={invalid}
          className={`min-h-24 ${fieldClass}`}
          onChange={(event) => set(question.column, event.target.value)}
        />
      )
    }

    return (
      <Input
        id={id}
        type={question.kind === "email" ? "email" : "text"}
        value={textOf(value)}
        aria-invalid={invalid}
        className={`h-12 ${fieldClass}`}
        onChange={(event) => set(question.column, event.target.value)}
      />
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      {questionsFor[track].map((section) => (
        <fieldset
          key={section.title}
          className="grid gap-5 pb-10 xl:grid-cols-[minmax(12rem,1fr)_3fr] xl:gap-10"
        >
          <legend className="sr-only">{section.title}</legend>
          <p aria-hidden className="text-base font-semibold">
            {section.title}
          </p>
          <div className="flex min-w-0 flex-col gap-5">
            {section.questions.map((question) => (
              <div key={question.column} className="flex flex-col gap-2">
                <FieldLabel
                  htmlFor={`request-${question.column}`}
                  className="text-sm"
                >
                  {question.label}
                  {question.optional && (
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  )}
                </FieldLabel>
                {control(question)}
                {errors[question.column] && (
                  <FieldError>{errors[question.column]}</FieldError>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="grid gap-5 pb-10 xl:grid-cols-[minmax(12rem,1fr)_3fr] xl:gap-10">
        <legend className="sr-only">File attachments</legend>
        <p aria-hidden className="text-base font-semibold">
          File attachments
        </p>
        <div className="min-w-0">
          <ClientFiles
            files={files}
            max={MAX_FILES}
            error={errors.files}
            disabled={pending}
            onChange={setFiles}
            onUploading={setUploading}
          />
        </div>
      </fieldset>
      <div className="tile flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm">
          {message}
        </p>
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full shrink-0 px-8 text-base sm:w-fit"
          disabled={pending || uploading}
        >
          {pending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
