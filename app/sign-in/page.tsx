import Image from "next/image"

import { SignInArt } from "@/components/sign-in-art"
import { SignInForm } from "@/components/sign-in-form"

export default function Page() {
  return (
    <div className="grid min-h-svh w-full grid-cols-1 md:h-svh md:grid-cols-[minmax(0,1fr)_28rem] lg:grid-cols-[minmax(0,1fr)_34rem]">
      <SignInArt />
      <main className="flex min-h-svh flex-col bg-background px-6 py-8 sm:px-10 md:min-h-0 lg:px-14 lg:py-12">
        <Image
          src="/logo.png"
          alt="IMHO"
          width={160}
          height={39}
          priority
          className="h-auto w-36 lg:w-40"
        />
        <div className="my-auto flex w-full max-w-sm flex-col gap-10 py-10">
          <h1 className="text-4xl font-semibold tracking-tight">Sign in</h1>
          <SignInForm />
        </div>
        <p className="text-sm text-muted-foreground">IMHOGEN ERM</p>
      </main>
    </div>
  )
}
