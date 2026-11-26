"use client"

import { useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { CaretRightIcon, CheckIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"

import { EmptyState } from "@/components/empty-state"
import { TableBox } from "@/components/sheet-table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { initialsOf } from "@/lib/initials"
import { roleInfo } from "@/lib/role-titles"

type Result = { status: "done" } | { status: "error"; message: string }

export type ShownComment = {
  id: string
  authorName: string
  authorRole: string
  body: string
  // ISO time, so the server and the browser show the same.
  createdAt: string
}

export type ShownThread = ShownComment & {
  replies: ShownComment[]
  resolved: boolean
  resolvedByName: string | null
}

type Props = {
  recordId: string
  threads: ShownThread[]
  add: (values: {
    recordId: string
    body: string
    parentId?: string
  }) => Promise<Result>
  resolve: (values: { commentId: string }) => Promise<Result>
}

function subscribeToHash(changed: () => void) {
  window.addEventListener("hashchange", changed)

  return () => window.removeEventListener("hashchange", changed)
}

function readHash() {
  return window.location.hash
}

// Ghana keeps UTC all year, so one zone serves everyone.
function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

function roleTitle(role: string) {
  return roleInfo.get(role)?.title ?? role
}

// The comments the team writes about a tool at any stage, under its sheet.
// A comment can be answered, and resolved once it is dealt with; a resolved
// thread folds to one line and opens again to be read. The client never gets
// this section.
export function RecordComments({ recordId, threads, add, resolve }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  // A notification links to one comment. A resolved thread holding it starts
  // open, and the page scrolls to it once it is shown.
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => "")
  const target = hash.startsWith("#comment-") ? hash.slice(9) : ""

  const linked = threads.find(
    (each) =>
      each.id === target || each.replies.some((reply) => reply.id === target)
  )?.id

  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [dismissed, setDismissed] = useState<string>()

  useEffect(() => {
    if (target !== "") {
      requestAnimationFrame(() =>
        document.getElementById(`comment-${target}`)?.scrollIntoView()
      )
    }
  }, [target])

  function isOpen(threadId: string) {
    return opened.has(threadId) || (threadId === linked && dismissed !== target)
  }

  function setOpen(threadId: string, next: boolean) {
    const changed = new Set(opened)

    if (next) {
      changed.add(threadId)
    } else {
      changed.delete(threadId)

      // Closed by hand, the linked thread stays closed until another link.
      if (threadId === linked) {
        setDismissed(target)
      }
    }

    setOpened(changed)
  }

  function run(send: () => Promise<Result>, after?: () => void) {
    setError(undefined)
    startTransition(async () => {
      const result = await send()

      if (result.status === "error") {
        setError(result.message)

        return
      }

      after?.()
      router.refresh()
    })
  }

  const open = threads.filter((thread) => !thread.resolved)
  const resolved = threads.filter((thread) => thread.resolved)

  return (
    <TableBox title="Comments">
      <div className="flex flex-col gap-6 px-4 py-4">
        {threads.length === 0 && (
          <EmptyState
            size="inline"
            title="No comments yet"
            description="Write the first one below."
          />
        )}
        {open.length > 0 && (
          <ul className="flex flex-col gap-6">
            {open.map((thread) => (
              <li key={thread.id}>
                <ThreadView
                  thread={thread}
                  pending={pending}
                  onReply={(body, done) =>
                    run(
                      () => add({ recordId, body, parentId: thread.id }),
                      done
                    )
                  }
                  onResolve={() => run(() => resolve({ commentId: thread.id }))}
                />
              </li>
            ))}
          </ul>
        )}
        {resolved.length > 0 && (
          <ul className="flex flex-col gap-2">
            {resolved.map((thread) => (
              <li key={thread.id}>
                <Collapsible
                  open={isOpen(thread.id)}
                  onOpenChange={(next) => setOpen(thread.id, next)}
                >
                  <CollapsibleTrigger className="group inset-row flex w-full min-w-0 items-center gap-2 text-left text-sm text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    <CaretRightIcon
                      aria-hidden
                      className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                    />
                    <CheckIcon aria-hidden className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      Resolved
                      {thread.resolvedByName &&
                        ` by ${thread.resolvedByName}`}: {thread.body}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <ThreadView thread={thread} pending={pending} />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
        <NewComment
          pending={pending}
          onSend={(body, done) => run(() => add({ recordId, body }), done)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </TableBox>
  )
}

function CommentView({ comment }: { comment: ShownComment }) {
  return (
    <article
      id={`comment-${comment.id}`}
      aria-label={`Comment by ${comment.authorName}`}
      className="flex scroll-mt-48 gap-3"
    >
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="avatar-soft text-xs">
          {initialsOf(comment.authorName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{comment.authorName}</span>
          <span className="text-muted-foreground">
            {roleTitle(comment.authorRole)}
          </span>
          <time
            dateTime={comment.createdAt}
            className="text-xs text-muted-foreground"
          >
            {when(comment.createdAt)}
          </time>
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">
          {comment.body}
        </p>
      </div>
    </article>
  )
}

// A comment, its replies indented under it, and, while it is open, Reply and
// Resolve.
function ThreadView({
  thread,
  pending,
  onReply,
  onResolve,
}: {
  thread: ShownThread
  pending: boolean
  onReply?: (body: string, done: () => void) => void
  onResolve?: () => void
}) {
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState("")

  return (
    <div className="flex flex-col gap-3">
      <CommentView comment={thread} />
      {thread.replies.length > 0 && (
        <ul className="ml-12 flex flex-col gap-3">
          {thread.replies.map((each) => (
            <li key={each.id} className="inset-row">
              <CommentView comment={each} />
            </li>
          ))}
        </ul>
      )}
      {onReply && onResolve && (
        <div className="ml-12 flex flex-col gap-3">
          {replying ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                onReply(reply, () => {
                  setReply("")
                  setReplying(false)
                })
              }}
            >
              <Label htmlFor={`reply-${thread.id}`}>
                Reply to {thread.authorName}
              </Label>
              <Textarea
                id={`reply-${thread.id}`}
                value={reply}
                rows={2}
                autoFocus
                className="bg-background"
                readOnly={pending}
                onChange={(event) => setReply(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || reply.trim() === ""}>
                  Send reply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setReplying(false)
                    setReply("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label={`Reply to ${thread.authorName}`}
                onClick={() => setReplying(true)}
              >
                Reply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={onResolve}
              >
                Resolve
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NewComment({
  pending,
  onSend,
}: {
  pending: boolean
  onSend: (body: string, done: () => void) => void
}) {
  const [body, setBody] = useState("")

  return (
    <form
      className="flex flex-col gap-3 border-t border-foreground/20 pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSend(body, () => setBody(""))
      }}
    >
      <Label htmlFor="new-comment">Add a comment</Label>
      <Textarea
        id="new-comment"
        value={body}
        rows={3}
        className="bg-background"
        readOnly={pending}
        onChange={(event) => setBody(event.target.value)}
      />
      <Button
        type="submit"
        size="lg"
        disabled={pending || body.trim() === ""}
        className="h-12 w-full px-8 text-base sm:w-fit sm:self-end"
      >
        Comment
      </Button>
    </form>
  )
}
