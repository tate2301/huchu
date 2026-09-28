"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Button, Spinner } from "@corelithzw/react";

/**
 * The first page a new admin sees on their workspace's own host.
 *
 * It spends the one-use ticket the signup host handed over, which makes a
 * session here, then opens the workspace. The ticket is taken out of the
 * address bar at once so it is not left in history or copied anywhere.
 */
export function SignupWelcome({ token, next }: { token: string; next: string }) {
  const started = useRef(false);
  const [failed, setFailed] = useState(!token);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);

    void signIn("handoff", { token, redirect: false }).then((result) => {
      if (result?.ok && !result.error) {
        window.location.replace(next);
      } else {
        setFailed(true);
      }
    });
  }, [token, next]);

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[var(--text-body)] [font:var(--type-body-sm)]">
          This link has been used or has expired. Your workspace is ready; sign in with a code sent to your email.
        </p>
        <Button asChild variant="primary" block>
          <a href="/login">Sign in</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[var(--text-muted)] [font:var(--type-body-sm)]" role="status">
      <Spinner label="Opening your workspace" />
      Opening your workspace
    </div>
  );
}
