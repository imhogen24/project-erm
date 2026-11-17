"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// The link a click is following, when it leaves this page for another page
// of the app in the same tab. A new tab, a download, a link to another site
// or to a place on this page is not leaving.
function leavingTo(event: MouseEvent): string | undefined {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return undefined
  }

  const link =
    event.target instanceof Element ? event.target.closest("a[href]") : null

  if (
    !(link instanceof HTMLAnchorElement) ||
    (link.target !== "" && link.target !== "_self") ||
    link.hasAttribute("download")
  ) {
    return undefined
  }

  const to = new URL(link.href, window.location.href)

  if (
    to.origin !== window.location.origin ||
    (to.pathname === window.location.pathname &&
      to.search === window.location.search)
  ) {
    return undefined
  }

  return `${to.pathname}${to.search}${to.hash}`
}

// While anything typed is not saved yet, leaving the page is held. A link in
// the app saves first and then goes; only when that save fails is the person
// asked, Leave or Stay. Closing or reloading the tab cannot wait for a save,
// so the browser asks its own question. Back and Forward save on the way out.
// At any other time nothing is asked.
export function LeaveGuard({
  active,
  flush,
}: {
  active: boolean
  flush: () => Promise<boolean>
}) {
  const router = useRouter()
  const [asking, setAsking] = useState<string>()
  const saveFirst = useRef(flush)

  useEffect(() => {
    saveFirst.current = flush
  })

  useEffect(() => {
    if (!active) {
      return
    }

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    // Caught before the app's own link handling, so the page stays put
    // until the person chooses.
    function click(event: MouseEvent) {
      const to = leavingTo(event)

      if (to) {
        event.preventDefault()
        event.stopPropagation()
        void saveFirst
          .current()
          .then((saved) => (saved ? router.push(to) : setAsking(to)))
      }
    }

    // The browser's Back and Forward move within the app and cannot be held,
    // so what was typed is sent at once on the way out.
    function historyMove() {
      void saveFirst.current()
    }

    window.addEventListener("beforeunload", beforeUnload)
    window.addEventListener("popstate", historyMove)
    document.addEventListener("click", click, true)

    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("popstate", historyMove)
      document.removeEventListener("click", click, true)
    }
  }, [active, router])

  return (
    <AlertDialog
      open={asking !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(undefined)
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Your latest changes are not saved yet. Leave anyway?
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (asking) {
                router.push(asking)
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
