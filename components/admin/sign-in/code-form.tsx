"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Callout, Input } from "@corelithzw/react";

import type { SignInState } from "@/app/admin/login/actions";
import { ArrowLeft, Check } from "@/lib/icons";

/**
 * The six digits, for signing in and for confirming a new authenticator — the
 * same field either way, so it takes the action it submits to.
 */
export function CodeForm({
  callbackUrl,
  action: submit,
  submitLabel,
}: {
  callbackUrl: string;
  action: (state: SignInState, form: FormData) => Promise<SignInState>;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(submit, null);

  return (
    <form action={action} className="space-y-4" aria-label="Authenticator code">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Input
        label="Six-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        size="lg"
        required
        autoFocus
        className="font-mono tabular-nums"
        hint="From the authenticator app on your phone. It changes every 30 seconds."
      />
      {state?.error ? (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      ) : null}
      <div className="flex gap-2">
        <Link href="/admin/login" className="btn btn-lg" prefetch={false}>
          <ArrowLeft aria-hidden="true" />
          Start again
        </Link>
        <Button type="submit" variant="primary" size="lg" block loading={pending} startIcon={<Check />}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
