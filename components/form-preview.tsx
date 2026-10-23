"use client"

import { useState } from "react"

import { ToolForm } from "@/components/tool-form"
import type {
  FieldError,
  FormValues,
  ToolDefinition,
} from "@/lib/tool-definition"

type Sent = { action: "save" | "submit"; values: FormValues }

// A stand-in for a screen: it shows what the form handed over, so the form can
// be tried and tested without saving anything.
export function FormPreview({
  tool,
  values,
  errors,
}: {
  tool: ToolDefinition
  values: FormValues
  errors: FieldError[]
}) {
  const [sent, setSent] = useState<Sent>()

  return (
    <div className="flex flex-col gap-8">
      <ToolForm
        tool={tool}
        values={values}
        errors={errors}
        onSave={(held) => setSent({ action: "save", values: held })}
        onSubmit={(held) => setSent({ action: "submit", values: held })}
      />
      <div className="flex flex-col gap-2 border-t pt-6">
        <p className="text-sm font-medium">Last sent</p>
        <pre
          aria-label="Last sent"
          className="overflow-x-auto bg-muted/50 p-4 text-xs"
        >
          {sent ? JSON.stringify(sent, null, 2) : "Nothing sent yet."}
        </pre>
      </div>
    </div>
  )
}
