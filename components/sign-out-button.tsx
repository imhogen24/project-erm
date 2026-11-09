"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

// With an `icon` the button shows only the icon, and the name stays for
// screen readers and the hover title.
export function SignOutButton({ icon }: Readonly<{ icon?: ReactNode }>) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setPending(true)
    setFailed(false)

    // A refused request comes back as a value, a broken connection as a throw.
    // Either way the person stays signed in, so say so and let them retry.
    const result = await authClient.signOut().catch(() => ({ error: true }))

    if (result.error) {
      setPending(false)
      setFailed(true)

      return
    }

    router.push("/sign-in")
    router.refresh()
  }

  return (
    <>
      <Button
        variant="secondary"
        size={icon ? "icon" : "sm"}
        className={
          icon
            ? "size-10 bg-foreground/10 hover:bg-foreground/20"
            : "bg-foreground/10 hover:bg-foreground/20"
        }
        disabled={pending}
        onClick={signOut}
        aria-label={failed ? "Retry sign out" : "Sign out"}
        title={failed ? "Retry sign out" : "Sign out"}
      >
        {icon ?? (failed ? "Retry sign out" : "Sign out")}
      </Button>
      {failed && (
        <span role="alert" className="sr-only">
          Sign out failed. You are still signed in.
        </span>
      )}
    </>
  )
}
