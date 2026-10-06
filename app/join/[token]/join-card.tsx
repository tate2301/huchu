"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/workspace/button";
import { TextInput } from "@/components/workspace/fields/text-input";

/**
 * The join card (80-admin 5.6, **Defined here**): 420px on `--ground`, the
 * shop's tile and name on top. With an email they choose a password and are
 * signed in; without one they only say "Got it" and use their PIN at the till.
 */

type JoinView = {
  shop: string;
  name: string;
  roleLabel: string;
  where: string;
  invitedBy: string;
  email: string | null;
  needsPassword: boolean;
};

type State =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "ready"; view: JoinView }
  | { kind: "done"; view: JoinView };

const GONE = "This link is not valid any more";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** "Tendai Mhlanga added you as a bookkeeper, for all sites." / "… as a cashier at Harare Main Branch." */
function addedLine(view: JoinView): string {
  const word = view.roleLabel.toLowerCase();
  const role = /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
  return `${view.invitedBy} added you as ${role}${view.where.startsWith("for ") ? ", " : " "}${view.where}.`;
}

export function JoinCard({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ kind: "loading" });
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const url = `/api/public/retail/join/${encodeURIComponent(token)}`;

  React.useEffect(() => {
    let live = true;
    void fetch(url)
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          setState({ kind: "gone" });
          return;
        }
        const body = (await response.json()) as { data: JoinView };
        setState({ kind: "ready", view: body.data });
      })
      .catch(() => live && setState({ kind: "gone" }));
    return () => {
      live = false;
    };
  }, [url]);

  const join = async (view: JoinView) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(view.needsPassword ? { password } : {}),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { email: string | null; home: string };
        error?: string;
        fieldErrors?: { password?: string };
      } | null;
      if (!response.ok) {
        if (response.status === 404) setState({ kind: "gone" });
        else setError(body?.fieldErrors?.password ?? body?.error ?? "That did not work. Try again.");
        return;
      }
      if (view.needsPassword && body?.data?.email) {
        const signedIn = await signIn("credentials", { email: body.data.email, password, redirect: false });
        if (signedIn?.ok) {
          router.replace(body.data.home);
          return;
        }
        router.replace("/login");
        return;
      }
      setState({ kind: "done", view });
    } catch {
      setError("That did not reach the shop. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const shop = state.kind === "ready" || state.kind === "done" ? state.view.shop : "";
  return (
    <main className="join-page">
      <section className="join-card" aria-busy={state.kind === "loading"}>
        {shop ? (
          <div className="join-card__shop">
            <span className="join-card__tile" aria-hidden="true">
              {initials(shop)}
            </span>
            <span className="join-card__shop-name">{shop}</span>
          </div>
        ) : null}
        {state.kind === "gone" ? (
          <>
            <h1 className="join-card__title">{GONE}</h1>
            <p className="join-card__line">Ask whoever invited you to send it again.</p>
          </>
        ) : null}
        {state.kind === "ready" && state.view.needsPassword ? (
          <form
            className="join-card__form"
            onSubmit={(event) => {
              event.preventDefault();
              void join(state.view);
            }}
          >
            <h1 className="join-card__title">Join {state.view.shop}</h1>
            <p className="join-card__line">{addedLine(state.view)}</p>
            <div className="cx-field">
              <label className="cx-label" htmlFor="join-password">
                Choose a password
              </label>
              <TextInput
                id="join-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <span className="cx-error">{error}</span>
              ) : (
                <span className="cx-hint">
                  You sign in to the admin with {state.view.email} and this password.
                </span>
              )}
            </div>
            <Button type="submit" variant="primary" busy={busy}>
              Join
            </Button>
          </form>
        ) : null}
        {state.kind === "ready" && !state.view.needsPassword ? (
          <>
            <h1 className="join-card__title">You are in {state.view.shop}</h1>
            <p className="join-card__line">
              {addedLine(state.view)} Use the PIN in your WhatsApp message on the till. You choose your own PIN the first
              time.
            </p>
            {error ? <p className="cx-error">{error}</p> : null}
            <Button variant="primary" busy={busy} onClick={() => void join(state.view)}>
              Got it
            </Button>
          </>
        ) : null}
        {state.kind === "done" ? (
          <>
            <h1 className="join-card__title">You are in {state.view.shop}</h1>
            <p className="join-card__line">All set. You can close this page.</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
