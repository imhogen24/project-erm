"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { OptionRow } from "@/components/option-row"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const schema = z
  .object({
    email: z.string().trim().min(1, "Enter an email."),
    name: z.string().trim().min(1, "Enter a name."),
    access: z.enum(["one", "all"]),
    projectId: z.string(),
    roles: z.array(z.string()).min(1, "Choose at least one role."),
  })
  .refine((values) => values.access === "all" || values.projectId !== "", {
    message: "Choose a project.",
    path: ["projectId"],
  })

type Values = z.infer<typeof schema>

// What the server action receives: no project means the roles are
// qualifications.
type Invite = {
  email: string
  name: string
  projectId: string | null
  roles: string[]
}

type Result =
  | { status: "invited"; link: string }
  | { status: "added"; email: string }
  | { status: "error"; message: string }

type Props = {
  projects: { id: string; name: string; requestId: string; tier: string }[]
  roles: readonly string[]
  // The server action that makes the invite.
  create: (values: Invite) => Promise<Result>
}

// Each role's title and department, from the role list in
// docs/dev_docs/CRITICAL_DATA_STRUCTURE/AGENT_ROLES.md.
const roleInfo = new Map([
  ["Client", { title: "External stakeholder", group: "Client" }],
  ["PM", { title: "Project Manager", group: "Operations" }],
  ["OM", { title: "Onboarding Manager", group: "Operations" }],
  ["CA", { title: "Contract Administrator", group: "Operations" }],
  ["PO", { title: "Procurement Officer", group: "Operations" }],
  ["IO", { title: "Inventory Officer", group: "Operations" }],
  ["WS", { title: "Workshop Supervisor", group: "Operations" }],
  ["T", { title: "Technician", group: "Operations" }],
  ["QA", { title: "QA Officer", group: "Operations" }],
  ["LFE", { title: "Field Engineer", group: "Operations" }],
  ["LO", { title: "Logistics Officer", group: "Operations" }],
  ["CR", { title: "Client Relations", group: "Operations" }],
  ["HE", { title: "Head of Engineering", group: "Engineering" }],
  ["LE", { title: "Lead Engineer", group: "Engineering" }],
  ["AE", { title: "Assigned Engineer", group: "Engineering" }],
  ["LD", { title: "Lead Draftsman", group: "Engineering" }],
  ["FO", { title: "Finance Officer", group: "Finance, IT and marketing" }],
  [
    "IT/Admin",
    { title: "Systems support", group: "Finance, IT and marketing" },
  ],
  ["MKT", { title: "Marketing Hub", group: "Finance, IT and marketing" }],
])

const groupOrder = [
  "Client",
  "Operations",
  "Engineering",
  "Finance, IT and marketing",
  "Other",
]

const inputClass = "h-12 bg-background text-base md:text-base"

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="grid gap-5 pb-10 xl:grid-cols-[minmax(12rem,1fr)_3fr] xl:gap-10">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden className="flex flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </fieldset>
  )
}

// "PM, LE and FO".
function listOf(items: string[]) {
  if (items.length <= 1) {
    return items.join("")
  }

  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

export function InviteForm({ projects, roles, create }: Props) {
  const [result, setResult] = useState<Result>()
  const [copied, setCopied] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      name: "",
      access: "one",
      projectId: "",
      roles: [],
    },
  })

  async function onSubmit(values: Values) {
    setCopied(false)
    setResult(
      await create({
        email: values.email,
        name: values.name,
        projectId: values.access === "all" ? null : values.projectId,
        roles: values.roles,
      })
    )
  }

  const [name, access, projectId, chosen] = useWatch({
    control: form.control,
    name: ["name", "access", "projectId", "roles"],
  })

  const everyProject = access === "all"

  // Client is only ever given on one project, so it cannot stay ticked.
  function chooseAccess(access: Values["access"]) {
    form.setValue("access", access)
    form.setValue("projectId", "")

    if (access === "all") {
      form.setValue(
        "roles",
        form.getValues("roles").filter((role) => role !== "Client")
      )
    }
  }

  async function copy(link: string) {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  const groups = groupOrder.flatMap((group) => {
    const inGroup = roles.filter(
      (role) => (roleInfo.get(role)?.group ?? "Other") === group
    )

    return inGroup.length > 0 ? [{ group, roles: inGroup }] : []
  })

  const projectName = projects.find((project) => project.id === projectId)?.name

  const who = name.trim() || "This person"

  let where = "on the project you choose"

  if (everyProject) {
    where = "as roles they can be assigned on any project"
  } else if (projectName) {
    where = `on ${projectName}`
  }

  const readBack =
    chosen.length === 0
      ? `${who} gets no roles yet.`
      : `${who} gets ${listOf(chosen)} ${where}.`

  return (
    <div className="flex flex-col gap-8">
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        {result?.status === "error" && (
          <FieldError
            role="alert"
            data-tone="error"
            className="note-panel mb-6"
          >
            {result.message}
          </FieldError>
        )}

        <Section
          title="Who"
          hint="The link goes to this email. The name is how others see them."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email" className="text-sm">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    autoComplete="off"
                    className={inputClass}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name" className="text-sm">
                    Name
                  </FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    autoComplete="off"
                    className={inputClass}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </Section>

        <Section
          title="Access"
          hint="One project gives access now. All projects only says what they can be given later."
        >
          <Controller
            name="access"
            control={form.control}
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) =>
                  chooseAccess(value === "all" ? "all" : "one")
                }
                className="grid gap-3 md:grid-cols-2"
              >
                <label htmlFor="access-one" className="tile-choice">
                  <RadioGroupItem
                    value="one"
                    id="access-one"
                    aria-label="One project"
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium">One project</span>
                    <span className="text-sm text-muted-foreground">
                      They work on the project you pick and see only that one.
                    </span>
                  </span>
                </label>
                <label htmlFor="access-all" className="tile-choice">
                  <RadioGroupItem
                    value="all"
                    id="access-all"
                    aria-label="All projects"
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium">All projects</span>
                    <span className="text-sm text-muted-foreground">
                      They can be assigned these roles on any project later.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            )}
          />
          {everyProject ? (
            <p className="text-sm text-muted-foreground">
              These roles say what the person can be assigned. They give no
              access until an IT/Admin assigns the person to a project. IT/Admin
              is the exception: it applies to every project.
            </p>
          ) : (
            <Controller
              name="projectId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project" className="text-sm">
                    Project
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="project"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <OptionRow
                            mark={project.tier}
                            label={project.name}
                            meta={project.requestId}
                          />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          )}
        </Section>

        <Section
          title="Roles"
          hint="Tick every role they hold. A person can hold several."
        >
          <Controller
            name="roles"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-6">
                {groups.map(({ group, roles: inGroup }) => (
                  <div key={group} className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">{group}</p>
                    <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
                      {inGroup.map((role) => (
                        <label
                          key={role}
                          htmlFor={`role-${role}`}
                          className="tile-choice items-start p-3 sm:items-center sm:p-4"
                        >
                          <Checkbox
                            id={`role-${role}`}
                            aria-label={role}
                            disabled={everyProject && role === "Client"}
                            checked={field.value.includes(role)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, role]
                                  : field.value.filter((held) => held !== role)
                              )
                            }
                          />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-semibold">
                              {role}
                            </span>
                            <span className="text-xs text-muted-foreground sm:text-sm">
                              {roleInfo.get(role)?.title}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {everyProject && (
                  <p className="text-sm text-muted-foreground">
                    Client is only given on one project.
                  </p>
                )}
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </div>
            )}
          />
        </Section>

        <div className="tile flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-pretty [overflow-wrap:anywhere]">
            {readBack}
          </p>
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full shrink-0 text-base sm:w-fit sm:px-8"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating invite…" : "Create invite"}
          </Button>
        </div>
      </form>

      {result?.status === "invited" && (
        <div role="status" className="note-panel flex flex-col gap-3">
          <FieldLabel htmlFor="invite-link" className="text-sm">
            Invite link
          </FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="invite-link"
              readOnly
              value={result.link}
              className={inputClass}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-12 px-6"
              onClick={() => copy(result.link)}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Send this link to the person. It works once and expires in 7 days.
          </p>
        </div>
      )}
      {result?.status === "added" && (
        <p role="status" className="note-panel text-sm">
          {result.email} already has an account. The roles were added to it.
        </p>
      )}
    </div>
  )
}
