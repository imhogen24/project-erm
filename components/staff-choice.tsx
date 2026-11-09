"use client"

import { useState, useTransition } from "react"
import { CheckCircleIcon, CircleDashedIcon, XIcon } from "@phosphor-icons/react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { OptionRow } from "@/components/option-row"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { initialsOf } from "@/lib/initials"

export type StaffOption = {
  personId: string
  name: string
  role: string
  // How many projects the person is on in this role's group, and the most
  // they may be on. `full` people are shown but cannot be chosen.
  count: number
  limit: number | null
  full: boolean
}

export type StaffMember = { personId: string; name: string; role: string }

type Change = { projectId: string; personId: string; role: string }

type Result = { status: "done" } | { status: "error"; message: string }

type Props = {
  projectId: string
  title: string
  // One line under the title: how many a project has and the workload limit.
  hint: string
  // Whether the project has only one person in this role.
  single: boolean
  buttonLabel: string
  members: StaffMember[]
  options: StaffOption[]
  someoneFree: boolean
  assign: (change: Change) => Promise<Result>
  unassign: (change: Change) => Promise<Result>
}

function loadText(option: StaffOption) {
  if (option.limit === null) {
    return ""
  }

  return `${option.count} of ${option.limit} projects${option.full ? " (full)" : ""}`
}

// How full the person's slots are: one mark per project they may be on,
// filled for each they are on, so the freest stand out.
function LoadMeter({ option }: { option: StaffOption }) {
  if (option.limit === null) {
    return null
  }

  return (
    <span aria-hidden className="flex gap-0.5">
      {Array.from({ length: option.limit }, (_, index) => (
        <span
          key={index}
          data-on={index < option.count}
          data-full={option.full}
          className="meter-mark"
        />
      ))}
    </span>
  )
}

// One role of a team: who holds it, a choice to add someone, and the server's
// words when it refuses. The server does the checking; a full person is only
// disabled here as a hint.
export function StaffChoice({
  projectId,
  title,
  hint,
  single,
  buttonLabel,
  members,
  options,
  someoneFree,
  assign,
  unassign,
}: Props) {
  const [chosen, setChosen] = useState("")
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  const showRole = new Set(options.map((option) => option.role)).size > 1
  const hasChoice = !(single && members.length > 0)

  function send(
    change: Change,
    run: (change: Change) => Promise<Result>,
    undo?: () => void
  ) {
    setMessage(undefined)
    startTransition(async () => {
      const result = await run(change)

      if (result.status === "error") {
        setMessage(result.message)
        undo?.()
      }
    })
  }

  function add() {
    const option = options.find(
      (each) => `${each.personId}:${each.role}` === chosen
    )

    if (option) {
      const previous = chosen

      // The choice is cleared at once, not when the server answers, so a new
      // choice made while the page refreshes is never wiped. A refusal puts it
      // back.
      setChosen("")
      send(
        { projectId, personId: option.personId, role: option.role },
        assign,
        () => setChosen(previous)
      )
    }
  }

  let status = `${members.length} assigned`

  if (members.length === 0) {
    status = "None yet"
  } else if (single) {
    status = "Filled"
  }

  return (
    <section aria-label={title} className="tile flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span data-open={members.length === 0} className="status-chip">
          {members.length === 0 ? (
            <CircleDashedIcon aria-hidden className="size-3.5" />
          ) : (
            <CheckCircleIcon aria-hidden weight="fill" className="size-3.5" />
          )}
          {status}
        </span>
      </div>
      {members.length > 0 && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={`${member.personId}:${member.role}`}
              className="inset-row flex items-center gap-3"
            >
              <Avatar className="size-9">
                <AvatarFallback className="avatar-soft text-xs">
                  {initialsOf(member.name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.name}
                </span>
                {(showRole ||
                  members.some((each) => each.role !== member.role)) && (
                  <span className="text-xs text-muted-foreground">
                    {member.role}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${member.name}`}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  send(
                    {
                      projectId,
                      personId: member.personId,
                      role: member.role,
                    },
                    unassign
                  )
                }
              >
                <XIcon aria-hidden className="size-4" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasChoice && (
        <div className="flex flex-col gap-3 2xl:flex-row">
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger
              aria-label={`Choose ${title.toLowerCase()}`}
              disabled={options.length === 0}
              className="2xl:flex-1"
            >
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={`${option.personId}:${option.role}`}
                  value={`${option.personId}:${option.role}`}
                  disabled={option.full}
                >
                  <OptionRow
                    mark={initialsOf(option.name)}
                    label={
                      showRole ? `${option.name} (${option.role})` : option.name
                    }
                    meta={
                      option.limit === null ? undefined : (
                        <>
                          <LoadMeter option={option} />
                          {loadText(option)}
                        </>
                      )
                    }
                  />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full shrink-0 px-6 text-base sm:w-fit sm:self-end 2xl:self-auto"
            disabled={chosen === "" || pending}
            onClick={add}
          >
            {buttonLabel}
          </Button>
        </div>
      )}
      {hasChoice && !someoneFree && (
        <p className="text-sm text-muted-foreground">
          Nobody is free for this role.
        </p>
      )}
      {message && <FieldError role="alert">{message}</FieldError>}
    </section>
  )
}
