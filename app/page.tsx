"use client"

import { Button } from "@/components/ui/button"
import { KeyIcon } from "@phosphor-icons/react"

export default function Page() {
  return (
    <div className="flex min-h-svh bg-background p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="mb-5 text-3xl font-medium">Imhogen Project ERM</h1>
          <p>
            IMHOGEN ERM is a bespoke Engineering Resource Management application
            for IMHOGEN LTD, a Ghanaian engineering firm. It digitises and
            enforces the company&apos;s 13-phase Quality Management System
            (QMS), replacing a Google Sheets-based workflow.
          </p>

          <Button className="mt-2">
            <KeyIcon size={32} />
            Authenticate
          </Button>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}
