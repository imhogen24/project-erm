"use server"

import {
  InviteExpiredError,
  InviteNotFoundError,
  InviteUsedError,
  WeakPasswordError,
  acceptInvite,
  getInvite,
} from "@/server/invites/invites"
import { INVITE_EXPIRED, INVITE_USED } from "@/lib/invite-messages"
import { getDatabase } from "@/server/database"

export type AcceptResult =
  { status: "ok"; email: string } | { status: "error"; message: string }

type AcceptValues = { token: string; password: string }

// Makes the account. The form signs the person in afterwards, so the logic that
// makes accounts stays as it is.
export async function acceptInviteAction({
  token,
  password,
}: AcceptValues): Promise<AcceptResult> {
  const database = getDatabase()

  try {
    const { email } = await getInvite(database, token)

    await acceptInvite(database, token, password)

    return { status: "ok", email }
  } catch (error) {
    if (error instanceof InviteExpiredError) {
      return { status: "error", message: INVITE_EXPIRED }
    }

    if (error instanceof InviteUsedError) {
      return { status: "error", message: INVITE_USED }
    }

    if (error instanceof InviteNotFoundError) {
      return { status: "error", message: "This invite does not exist." }
    }

    if (error instanceof WeakPasswordError) {
      return { status: "error", message: error.message }
    }

    throw error
  }
}
