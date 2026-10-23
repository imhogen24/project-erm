"use client"

import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  Field as ToolField,
  FieldError as ToolFieldError,
  FormValues,
  ToolDefinition,
} from "@/lib/tool-definition"

type Props = {
  tool: ToolDefinition
  values: FormValues
  // What the server found wrong, one entry per field. The form only shows it.
  errors?: ToolFieldError[]
  onSave: (values: FormValues) => void
  onSubmit: (values: FormValues) => void
}

const controlClass =
  "h-12 border-foreground/20 bg-background text-base md:text-base"

// The inputs hold text, so a number is turned back into a number here. An empty
// number is null, not zero.
function toValues(tool: ToolDefinition, held: FormValues): FormValues {
  const values: FormValues = {}

  for (const field of tool.fields) {
    const value = held[field.key] ?? null

    if (field.type === "number") {
      values[field.key] = value === "" || value === null ? null : Number(value)
    } else {
      values[field.key] = value
    }
  }

  return values
}

function startingValue(
  field: ToolField,
  value: FormValues[string] | undefined
) {
  if (field.type === "boolean") {
    return value === true
  }

  return value === null || value === undefined ? "" : String(value)
}

export function ToolForm({
  tool,
  values,
  errors = [],
  onSave,
  onSubmit,
}: Props) {
  const form = useForm<Record<string, string | boolean>>({
    defaultValues: Object.fromEntries(
      tool.fields.map((field) => [
        field.key,
        startingValue(field, values[field.key]),
      ])
    ),
  })

  const messages = new Map(errors.map((error) => [error.field, error.message]))

  function held(): FormValues {
    return toValues(tool, form.getValues())
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(held())
      }}
    >
      <FieldGroup className="gap-6">
        {tool.fields.map((field) => {
          const message = messages.get(field.key)

          const errorId = `${field.key}-error`

          // A true/false field reads best as a box with its label beside it.
          const isBox = field.type === "boolean" && !field.inherited

          const label = (
            <FieldLabel htmlFor={field.key} className="text-sm">
              {field.label}
              {field.required && <span aria-hidden> *</span>}
            </FieldLabel>
          )

          const shared = {
            id: field.key,
            "aria-required": field.required ? (true as const) : undefined,
            "aria-invalid": message ? (true as const) : undefined,
            "aria-describedby": message ? errorId : undefined,
          }

          return (
            <Controller
              key={field.key}
              name={field.key}
              control={form.control}
              render={({ field: control }) => (
                <Field data-invalid={Boolean(message)}>
                  {!isBox && label}
                  {field.inherited ? (
                    <Input
                      {...shared}
                      readOnly
                      value={String(control.value)}
                      className={`${controlClass} bg-muted/50`}
                    />
                  ) : field.type === "longText" ? (
                    <Textarea
                      {...shared}
                      value={String(control.value)}
                      onChange={control.onChange}
                      className="min-h-28 border-foreground/20 bg-background text-base md:text-base"
                    />
                  ) : field.type === "boolean" ? (
                    <div className="flex items-center gap-3">
                      <Checkbox
                        {...shared}
                        checked={control.value === true}
                        onCheckedChange={(checked) =>
                          control.onChange(checked === true)
                        }
                      />
                      {label}
                    </div>
                  ) : field.type === "select" ? (
                    <Select
                      value={String(control.value)}
                      onValueChange={control.onChange}
                    >
                      <SelectTrigger
                        {...shared}
                        className={`${controlClass} w-full data-[size=default]:h-12`}
                      >
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      {...shared}
                      type={
                        field.type === "number"
                          ? "number"
                          : field.type === "date"
                            ? "date"
                            : "text"
                      }
                      value={String(control.value)}
                      onChange={control.onChange}
                      className={controlClass}
                    />
                  )}
                  {message && <FieldError id={errorId}>{message}</FieldError>}
                </Field>
              )}
            />
          )
        })}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12 bg-foreground/10 px-8 text-base hover:bg-foreground/20"
            onClick={() => onSave(held())}
          >
            Save draft
          </Button>
          <Button type="submit" size="lg" className="h-12 px-8 text-base">
            Submit
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
