"use client";

import { useActionState } from "react";
import { Button } from "@corelithzw/react";

import { endFromOwnerLink, type OwnerEndState } from "@/app/sign-in-as/end/actions";

/**
 * The owner's way to end support's session. A button, not the link itself:
 * mail scanners open every link in an email, and opening must not end it.
 */
export function OwnerEnd({ token }: { token: string }) {
  const [state, action, pending] = useActionState<OwnerEndState, FormData>(endFromOwnerLink, null);

  if (state?.kind === "ended") {
    return <p className="t-body text-[var(--text-body)]">Ended. Corelith support is out of {state.workspace}. {state.code} is in your audit log.</p>;
  }
  if (state?.kind === "already-over") {
    return <p className="t-body text-[var(--text-body)]">{state.code} had already ended. Nobody from Corelith support is in {state.workspace} on it.</p>;
  }
  if (state?.kind === "unknown") {
    return <p className="t-body text-[var(--text-body)]">This link does not match a session. Check you used the whole link from the email.</p>;
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="t-body text-[var(--text-body)]">
        Corelith support is signed in to your workspace as one of your members. Ending it signs them out at once.
      </p>
      <Button type="submit" variant="primary" loading={pending}>
        End the session
      </Button>
    </form>
  );
}
