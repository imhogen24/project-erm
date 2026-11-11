import Link from "next/link"

import { AuthFrame } from "@/components/auth-frame"
import { SignInForm } from "@/components/sign-in-form"

export default function Page() {
  return (
    <AuthFrame
      title="Sign in"
      footer={
        <>
          New client?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthFrame>
  )
}
