import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AcceptInviteForm } from "@/components/accept-invite-form"
import { SignInArt } from "@/components/sign-in-art"
import { INVITE_EXPIRED, INVITE_USED } from "@/lib/invite-messages"
import { getDatabase } from "@/server/database"
import {
  InviteExpiredError,
  InviteNotFoundError,
  InviteUsedError,
  getInvite,
} from "@/server/invites/invites"

import { acceptInviteAction } from "./actions"

async function readInvite(token: string) {
  try {
    return { invite: await getInvite(getDatabase(), token) }
  } catch (error) {
    if (error instanceof InviteExpiredError) {
      return { message: INVITE_EXPIRED }
    }

    if (error instanceof InviteUsedError) {
      return { message: INVITE_USED }
    }

    if (error instanceof InviteNotFoundError) {
      notFound()
    }

    throw error
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { invite, message } = await readInvite(token)

  return (
    <div className="grid min-h-svh w-full grid-cols-1 md:h-svh md:grid-cols-[minmax(0,1fr)_28rem] lg:grid-cols-[minmax(0,1fr)_34rem]">
      <SignInArt />
      <main className="flex min-h-svh flex-col bg-background px-6 py-8 sm:px-10 md:min-h-0 lg:px-14 lg:py-12">
        <Image
          src="/logo.png"
          alt="IMHOGEN ERM"
          width={160}
          height={39}
          priority
          className="h-auto w-36 lg:w-40"
        />
        <div className="my-auto flex w-full max-w-sm flex-col gap-8 py-10">
          <h1 className="text-4xl font-semibold tracking-tight">
            {invite ? "Create your account" : "Invite link"}
          </h1>
          {invite ? (
            <AcceptInviteForm
              token={token}
              name={invite.name}
              email={invite.email}
              accept={acceptInviteAction}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p role="alert" className="text-base">
                {message}
              </p>
              <Link
                href="/sign-in"
                className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Go to sign in
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
