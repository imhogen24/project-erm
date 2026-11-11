"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { authClient } from "@/lib/auth-client"

type Status = "idle" | "sending" | "sent" | "failed"

export function ResendVerification({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>("idle")

  async function resend() {
    setStatus("sending")

    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/",
    })

    setStatus(error ? "failed" : "sent")
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        disabled={status === "sending"}
        onClick={resend}
      >
        {status === "sending" ? "Sending…" : "Send the link again"}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {status === "sent" ? "Sent. Check your inbox." : ""}
      </p>
      {status === "failed" && (
        <FieldError role="alert">
          The link was not sent. Wait a minute, then try again.
        </FieldError>
      )}
    </div>
  )
}
