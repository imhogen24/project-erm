"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  // Whether the project has only one person in this role.
  single: boolean
  buttonLabel: string
  members: StaffMember[]
  options: StaffOption[]
  someoneFree: boolean
  assign: (change: Change) => Promise<Result>
  unassign: (change: Change) => Promise<Result>
}

function optionText(option: StaffOption, showRole: boolean) {
  const who = showRole ? `${option.name} (${option.role})` : option.name

  if (option.limit === null) {
    return who
  }

  return `${who}, ${option.count} of ${option.limit} projects${option.full ? " (full)" : ""}`
}

// One role of a team: who holds it, a choice to add someone, and the server's
// words when it refuses. The server does the checking; a full person is only
// disabled here as a hint.
export function StaffChoice({
  projectId,
  title,
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

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 border-t border-foreground/20 py-6 first:border-t-0 first:pt-0"
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {members.length > 0 && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={`${member.personId}:${member.role}`}
              className="flex items-center justify-between gap-3 border border-foreground/20 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm">
                {member.name}
                {showRole || members.some((each) => each.role !== member.role)
                  ? ` (${member.role})`
                  : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${member.name}`}
                disabled={pending}
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
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasChoice && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger
              aria-label={`Choose ${title.toLowerCase()}`}
              disabled={options.length === 0}
              className="h-12 w-full border-foreground/20 bg-background text-base data-[size=default]:h-12 sm:max-w-md"
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
                  {optionText(option, showRole)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full px-8 text-base sm:w-fit"
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
