"use client";

import { useActionState } from "react";
import { Button, Callout, Input } from "@corelithzw/react";

import { signInWithPassword, type SignInState } from "@/app/admin/login/actions";
import { ArrowRight } from "@/lib/icons";

export function PasswordForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInWithPassword, null);

  return (
    <form action={action} className="space-y-4" aria-label="Sign in">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Input
        label="Work email"
        name="email"
        type="email"
        autoComplete="username"
        size="lg"
        required
        defaultValue={state?.email}
        autoFocus
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        size="lg"
        required
        hint="Five wrong tries locks sign-in for 15 minutes."
      />
      {state?.error ? (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      ) : null}
      <Button type="submit" variant="primary" size="lg" block loading={pending} endIcon={<ArrowRight />}>
        Continue
      </Button>
      <p className="t-body-sm text-[var(--text-muted)]">New here? Your invite email has the link to set a password.</p>
    </form>
  );
}
