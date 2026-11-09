"use client"

import { FileTextIcon } from "@phosphor-icons/react"

import { ClientRequestTables } from "@/components/client-request-tables"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { ClientRequest } from "@/lib/client-request"

// What the client filled in on the website form, as tables grouped by what the
// answers are about. It slides in from the right and covers half the screen on
// a wide one, scrolls when it is long, and has nothing to edit.
export function ClientRequestPanel({
  request,
}: Readonly<{ request: ClientRequest }>) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 px-4">
          <FileTextIcon aria-hidden className="size-4" />
          View client request
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-3/4 data-[side=right]:xl:w-1/2"
      >
        <SheetHeader className="border-b pr-14">
          <SheetTitle className="text-lg">Client request</SheetTitle>
          <SheetDescription className="text-sm">
            {`Read only. Request ${request.requestId}.`}
          </SheetDescription>
        </SheetHeader>
        <div
          aria-label="Client request answers"
          className="flex-1 overflow-y-auto p-6"
        >
          <ClientRequestTables request={request} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
