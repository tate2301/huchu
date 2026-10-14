"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Spinner } from "@corelithzw/react";

/**
 * Spends the admin portal's one-use ticket on this workspace's host, which
 * signs the operator in as the member, then opens the workspace. The ticket
 * leaves the address bar at once so it is not kept in history.
 */
export function SignInAsEnter({ token, next }: { token: string; next: string }) {
  const started = useRef(false);
  const [failed, setFailed] = useState(!token);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void signIn("handoff", { token, redirect: false }).then((result) => {
      if (result?.ok && !result.error) window.location.replace(next);
      else setFailed(true);
    });
  }, [token, next]);

  if (failed) {
    return (
      <p className="t-body text-[var(--text-body)]">
        This link has been used or has run out; each one works once, within two minutes. Start again from the admin portal.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 t-body-sm text-[var(--text-muted)]" role="status">
      <Spinner label="Signing in" />
      Signing in
    </div>
  );
}
