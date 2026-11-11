import Link from "next/link"

import { AuthFrame } from "@/components/auth-frame"
import { SignUpForm } from "@/components/sign-up-form"

// Clients make their own account here. Staff come by invite.
export default function Page() {
  return (
    <AuthFrame
      title="Create your account"
      footer={
        <>
          Have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthFrame>
  )
}
