"use client"

import { useEffect, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { Sheet } from "@/lib/use-autosave"

type Guarded = Pick<Sheet, "unsaved" | "flush" | "discard">

const LEAVE = "Your latest changes are not saved yet. Leave anyway?"

const STALE = "Someone else saved this record. Reload to see their changes."

// Where a click on an in-app link goes, or nothing when the click opens
// something else: a new tab, a download, another site, or this same page.
function inAppHref(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  ) {
    return undefined
  }

  const link = event.target.closest("a[href]")

  if (
    !(link instanceof HTMLAnchorElement) ||
    (link.target !== "" && link.target !== "_self") ||
    link.hasAttribute("download")
  ) {
    return undefined
  }

  const url = new URL(link.href)
  const here = window.location

  if (
    url.origin !== here.origin ||
    (url.pathname === here.pathname && url.search === here.search)
  ) {
    return undefined
  }

  return `${url.pathname}${url.search}${url.hash}`
}

// Goes by a full page load, not the router. The router may still be applying
// a step or refresh from just before, and a router navigation started then
// can lose to it, leaving the page where it was. A full load has nothing to
// race. It only happens when leaving straight after typing.
function go(href: string) {
  window.location.assign(href)
}

// Keeps what was typed from being lost on the way out. A link clicked while
// a save waits or is on its way saves first, then goes. Only when that save
// fails does the page ask before leaving; closing or reloading the tab asks
// whenever something is not saved.
export function LeaveGuard({ sheet }: { sheet: Guarded }) {
  const [leavingTo, setLeavingTo] = useState<string>()
  const held = useRef(sheet)

  useEffect(() => {
    held.current = sheet
  })

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (held.current.unsaved()) {
        event.preventDefault()
      }
    }

    function click(event: MouseEvent) {
      const href = inAppHref(event)

      if (!href || !held.current.unsaved()) {
        return
      }

      event.preventDefault()
      void held.current.flush().then((saved) => {
        if (saved) {
          go(href)
        } else {
          setLeavingTo(href)
        }
      })
    }

    window.addEventListener("beforeunload", beforeUnload)
    // Before the link's own handler, which then sees the click is taken.
    window.addEventListener("click", click, true)

    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("click", click, true)
    }
  }, [])

  return (
    <AlertDialog
      open={leavingTo !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setLeavingTo(undefined)
        }
      }}
    >
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>{LEAVE}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (leavingTo) {
                held.current.discard()
                go(leavingTo)
              }
            }}
          >
            Leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Someone else saved the record since this page loaded. What was typed stays
// on screen; Reload drops it for their version.
export function StaleNotice({ sheet }: { sheet: Pick<Sheet, "discard"> }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-destructive">{STALE}</p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          sheet.discard()
          window.location.reload()
        }}
      >
        Reload
      </Button>
    </div>
  )
}
