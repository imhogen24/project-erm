"use client"

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

// What the client filled in on the website form. It slides in from the right,
// scrolls when it is long, and has nothing to edit.
export function ClientRequestPanel({
  request,
}: Readonly<{ request: ClientRequest }>) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          View client request
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b pr-14">
          <SheetTitle>Client request</SheetTitle>
          <SheetDescription>
            {`Read only. Request ${request.requestId}.`}
          </SheetDescription>
        </SheetHeader>
        <dl
          aria-label="Client request answers"
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 text-sm"
        >
          {request.answers.map((answer) => (
            <div key={answer.label} className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{answer.label}</dt>
              <dd className="break-words whitespace-pre-wrap">
                {answer.value}
              </dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  )
}
