"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  EnvelopeSimpleIcon,
  LockSimpleIcon,
  UserIcon,
} from "@phosphor-icons/react"
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
import { authClient } from "@/lib/auth-client"

// The same as the server's and an invite's.
const MIN_PASSWORD_LENGTH = 8

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.email("Enter an email address, such as name@company.com."),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    ),
})

type Values = z.infer<typeof schema>

const inputClass = "h-12 bg-background ps-10 text-base md:text-base"

const iconClass =
  "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"

export function SignUpForm() {
  const router = useRouter()
  const [failed, setFailed] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  })

  async function onSubmit(values: Values) {
    setFailed(null)

    // An email that already has an account gets the same answer, so the form
    // never tells who has one.
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: "/",
    })

    if (error) {
      setFailed(error.message ?? "The account was not created. Try again.")

      return
    }

    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`)
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup className="gap-6">
        {failed && <FieldError role="alert">{failed}</FieldError>}
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="name" className="text-sm">
                Full name
              </FieldLabel>
              <div className="relative">
                <UserIcon className={iconClass} />
                <Input
                  {...field}
                  id="name"
                  autoComplete="name"
                  className={inputClass}
                  aria-invalid={fieldState.invalid}
                />
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email" className="text-sm">
                Email
              </FieldLabel>
              <div className="relative">
                <EnvelopeSimpleIcon className={iconClass} />
                <Input
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  className={inputClass}
                  aria-invalid={fieldState.invalid}
                />
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password" className="text-sm">
                Password
              </FieldLabel>
              <div className="relative">
                <LockSimpleIcon className={iconClass} />
                <Input
                  {...field}
                  id="password"
                  type={shown ? "text" : "password"}
                  autoComplete="new-password"
                  className={`${inputClass} pe-16`}
                  aria-invalid={fieldState.invalid}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => setShown((value) => !value)}
                >
                  {shown ? "Hide" : "Show"}
                </Button>
              </div>
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
