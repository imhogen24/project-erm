"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { EnvelopeSimpleIcon, LockSimpleIcon } from "@phosphor-icons/react"
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

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
})

type Values = z.infer<typeof schema>

export function SignInForm() {
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: Values) {
    setFailed(false)

    const { error } = await authClient.signIn.email(values)

    if (error) {
      setFailed(true)

      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup className="gap-6">
        {failed && (
          <FieldError role="alert">Wrong email or password.</FieldError>
        )}
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email" className="text-sm">
                Email
              </FieldLabel>
              <div className="relative">
                <EnvelopeSimpleIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="h-12 border-foreground/20 bg-background ps-10 text-base md:text-base"
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
                <LockSimpleIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  {...field}
                  id="password"
                  type={shown ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-12 border-foreground/20 bg-background ps-10 pe-16 text-base md:text-base"
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
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  )
}
