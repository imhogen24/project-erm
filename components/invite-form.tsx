"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
  projects: { id: string; name: string }[]
  roles: readonly string[]
  // The server action that makes the invite.
  create: (values: Invite) => Promise<Result>
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

  const everyProject =
    useWatch({ control: form.control, name: "access" }) === "all"

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

  return (
    <div className="flex flex-col gap-8">
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup className="gap-6">
          {result?.status === "error" && (
            <FieldError role="alert">{result.message}</FieldError>
          )}
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
                  className="h-12 border-foreground/20 bg-background text-base md:text-base"
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
                  className="h-12 border-foreground/20 bg-background text-base md:text-base"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="access"
            control={form.control}
            render={({ field }) => (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 text-sm font-medium">Access</legend>
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) =>
                    chooseAccess(value === "all" ? "all" : "one")
                  }
                  className="flex flex-col gap-3 sm:flex-row sm:gap-8"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="one" id="access-one" />
                    <FieldLabel
                      htmlFor="access-one"
                      className="text-sm font-normal"
                    >
                      One project
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="access-all" />
                    <FieldLabel
                      htmlFor="access-all"
                      className="text-sm font-normal"
                    >
                      All projects
                    </FieldLabel>
                  </div>
                </RadioGroup>
                {everyProject && (
                  <p className="text-sm text-muted-foreground">
                    These roles say what the person can be assigned. They give
                    no access until an IT/Admin assigns the person to a project.
                    IT/Admin is the exception: it applies to every project.
                  </p>
                )}
              </fieldset>
            )}
          />
          {!everyProject && (
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
                      className="h-12 w-full border-foreground/20 bg-background text-base data-[size=default]:h-12"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
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
          <Controller
            name="roles"
            control={form.control}
            render={({ field, fieldState }) => (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 text-sm font-medium">Roles</legend>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                  {roles.map((role) => (
                    <div key={role} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-${role}`}
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
                      <FieldLabel
                        htmlFor={`role-${role}`}
                        className="text-sm font-normal"
                      >
                        {role}
                      </FieldLabel>
                    </div>
                  ))}
                </div>
                {everyProject && (
                  <p className="text-sm text-muted-foreground">
                    Client is only given on one project.
                  </p>
                )}
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </fieldset>
            )}
          />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base sm:w-fit sm:px-8"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating invite…" : "Create invite"}
          </Button>
        </FieldGroup>
      </form>
      {result?.status === "invited" && (
        <div role="status" className="flex flex-col gap-3 border-t pt-6">
          <FieldLabel htmlFor="invite-link" className="text-sm">
            Invite link
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="invite-link"
              readOnly
              value={result.link}
              className="h-12 border-foreground/20 bg-background text-base md:text-base"
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
        <p role="status" className="border-t pt-6 text-sm">
          {result.email} already has an account. The roles were added to it.
        </p>
      )}
    </div>
  )
}
