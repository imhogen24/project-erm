import Link from "next/link"

import { AuthFrame } from "@/components/auth-frame"
import { ResendVerification } from "@/components/resend-verification"

// After sign-up, or a sign-in before the email is confirmed. The link in the
// email confirms it and signs the person in.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <AuthFrame
      title="Check your email"
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Back to sign in
        </Link>
      }
    >
      <p className="text-base text-[var(--text-body)]">
        Open the link we sent
        {email ? (
          <>
            {" "}
            to <span className="font-medium break-all">{email}</span>
          </>
        ) : null}{" "}
        to confirm your email and sign in.
      </p>
      {email && <ResendVerification email={email} />}
    </AuthFrame>
  )
}
