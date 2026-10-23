"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PASSWORDS_DIFFER, PASSWORD_TOO_SHORT } from "@/lib/invite-messages"
import { authClient } from "@/lib/auth-client"

const schema = z
  .object({
    password: z.string().min(8, PASSWORD_TOO_SHORT),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: PASSWORDS_DIFFER,
    path: ["confirm"],
  })

type Values = z.infer<typeof schema>

type Result =
  { status: "ok"; email: string } | { status: "error"; message: string }

type Props = {
  token: string
  name: string
  email: string
  // The server action that makes the account.
  accept: (values: { token: string; password: string }) => Promise<Result>
}

const inputClass =
  "h-12 border-foreground/20 bg-background text-base md:text-base"

export function AcceptInviteForm({ token, name, email, accept }: Props) {
  const router = useRouter()
  const [failure, setFailure] = useState<string>()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  })

  async function onSubmit(values: Values) {
    setFailure(undefined)

    const result = await accept({ token, password: values.password })

    if (result.status === "error") {
      setFailure(result.message)

      return
    }

    const { error } = await authClient.signIn.email({
      email: result.email,
      password: values.password,
    })

    // The account exists even if signing in failed, so send them to sign in.
    router.push(error ? "/sign-in" : "/")
    router.refresh()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup className="gap-6">
        {failure && <FieldError role="alert">{failure}</FieldError>}
        <Field>
          <FieldLabel htmlFor="name" className="text-sm">
            Name
          </FieldLabel>
          <Input
            id="name"
            readOnly
            value={name}
            className={`${inputClass} bg-muted/50`}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email" className="text-sm">
            Email
          </FieldLabel>
          <Input
            id="email"
            readOnly
            value={email}
            className={`${inputClass} bg-muted/50`}
          />
        </Field>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password" className="text-sm">
                Password
              </FieldLabel>
              <Input
                {...field}
                id="password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="confirm"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirm" className="text-sm">
                Confirm password
              </FieldLabel>
              <Input
                {...field}
                id="confirm"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  )
}
