"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const schema = z.object({
  email: z.string().trim().min(1, "Enter an email."),
  name: z.string().trim().min(1, "Enter a name."),
  projectId: z.string().min(1, "Choose a project."),
  roles: z.array(z.string()).min(1, "Choose at least one role."),
})

type Values = z.infer<typeof schema>

type Result =
  | { status: "invited"; link: string }
  | { status: "added"; email: string }
  | { status: "error"; message: string }

type Props = {
  projects: { id: string; name: string }[]
  roles: readonly string[]
  // The server action that makes the invite.
  create: (values: Values) => Promise<Result>
}

export function InviteForm({ projects, roles, create }: Props) {
  const [result, setResult] = useState<Result>()
  const [copied, setCopied] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", name: "", projectId: "", roles: [] },
  })

  async function onSubmit(values: Values) {
    setCopied(false)
    setResult(await create(values))
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
