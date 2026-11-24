"use client"

import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  FileTextIcon,
} from "@phosphor-icons/react"
import { createContext, useContext, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { previewNotes, type PreviewStates } from "@/lib/pdf-preview"
import type { Field } from "@/lib/tool-definition"

const Previews = createContext<PreviewStates>({})

// Hands the form what each PDF preview field shows this person, so the fields
// deep inside it need no props threaded through.
export function PdfPreviews({
  states,
  children,
}: Readonly<{ states: PreviewStates; children: ReactNode }>) {
  return <Previews.Provider value={states}>{children}</Previews.Provider>
}

// A preview field, or a table cell's preview under its own key and label.
type Props = {
  field: Pick<Extract<Field, { type: "pdfPreview" }>, "key" | "label">
  id: string
}

// View opens the PDF in a panel from the right, like the client request: half
// the screen on a wide one, all of it on a phone. A phone's browser may show
// only the first page of a PDF in a page, so Open shows it whole in a new tab.
export function PdfPreviewField({ field, id }: Props) {
  const state = useContext(Previews)[field.key]

  if (state?.status !== "ready") {
    return (
      <div className="flex min-h-12 flex-wrap items-center gap-3">
        <Button
          id={id}
          variant="outline"
          className="h-12 gap-2 px-5"
          aria-label={`View ${field.label}`}
          aria-describedby={`${id}-note`}
          disabled
        >
          <FileTextIcon aria-hidden className="size-4" />
          View
        </Button>
        <span id={`${id}-note`} className="text-sm text-muted-foreground">
          {previewNotes[state?.status ?? "notStarted"]}
        </span>
      </div>
    )
  }

  const download = `${state.href}?download=1`

  return (
    <div className="flex min-h-12 items-center">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className="h-12 gap-2 px-5"
            aria-label={`View ${field.label}`}
          >
            <FileTextIcon aria-hidden className="size-4" />
            View
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-3/4 data-[side=right]:xl:w-1/2"
        >
          <SheetHeader className="border-b pr-14">
            <SheetTitle className="text-lg">{field.label}</SheetTitle>
            {/* The label usually names the document already. */}
            <SheetDescription
              className={
                field.label.includes(state.name) ? "sr-only" : "text-sm"
              }
            >
              {state.name}
            </SheetDescription>
          </SheetHeader>
          <iframe
            src={state.href}
            title={state.name}
            className="min-h-0 w-full flex-1 border-0 bg-muted"
          />
          <SheetFooter className="flex-row flex-wrap gap-3 border-t">
            <Button asChild className="h-12 gap-2 px-5">
              <a href={download} download>
                <DownloadSimpleIcon aria-hidden className="size-4" />
                Download
              </a>
            </Button>
            <Button asChild variant="outline" className="h-12 gap-2 px-5">
              <a href={state.href} target="_blank" rel="noopener noreferrer">
                <ArrowSquareOutIcon aria-hidden className="size-4" />
                Open
              </a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
