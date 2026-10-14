"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@corelithzw/react";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { UserSwitch } from "@/lib/icons";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });

/**
 * The strip across the top of every page while Corelith support is signed in
 * as this member. It says who is in, as whom, how far they may go and until
 * when, and it is the way out.
 */
export function SignInAsBanner() {
  const { data } = useSession();
  const user = (data as AuthenticatedSession | null)?.user;
  const signInAs = user?.signInAs;
  const [ending, setEnding] = useState(false);
  if (!signInAs) return null;

  const end = async () => {
    setEnding(true);
    await fetch("/api/sign-in-as/end", { method: "POST" }).catch(() => null);
    await signOut({ callbackUrl: "/sign-in-as/ended" });
  };

  return (
    <div
      role="region"
      aria-label="Signed in as a member for Corelith support"
      className="flex min-h-10 flex-none items-center gap-3 border-b border-[var(--warn-line)] bg-[var(--warn-soft)] px-4 text-[13px] text-[var(--ink)]"
    >
      <UserSwitch className="size-4 flex-none text-[var(--warn)]" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {signInAs.operatorName} from Corelith support is signed in as {user?.name}
        </span>
        <span className="text-[var(--ink-2)]">
          {" "}
          · {signInAs.mode === "LOOK" ? "Look only" : "Can make changes"}, until {TIME.format(new Date(signInAs.until))} ·{" "}
          <span className="font-mono">SA-{signInAs.number}</span>
        </span>
      </p>
      <Button size="sm" loading={ending} onClick={end}>
        End session
      </Button>
    </div>
  );
}
