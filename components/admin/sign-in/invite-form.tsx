"use client";

import { useActionState } from "react";
import { Button, Callout, Input } from "@corelithzw/react";

import { acceptOperatorInvite, type SignInState } from "@/app/admin/login/actions";
import { ArrowRight } from "@/lib/icons";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(acceptOperatorInvite, null);
  return (
    <form action={action} className="space-y-4" aria-label="Choose a password">
      <input type="hidden" name="token" value={token} />
      <Input label="Password" name="password" type="password" autoComplete="new-password" size="lg" required minLength={12} hint="At least 12 characters. A sentence you will remember is good." autoFocus />
      <Input label="The same password again" name="confirm" type="password" autoComplete="new-password" size="lg" required minLength={12} />
      {state?.error ? (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      ) : null}
      <Button type="submit" variant="primary" size="lg" block loading={pending} endIcon={<ArrowRight />}>
        Continue
      </Button>
    </form>
  );
}
