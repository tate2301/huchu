"use client";

import { useState, useTransition } from "react";
import { Button } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRightUp } from "@/lib/icons";

export type SignInAsStart = (
  memberId: string,
  mode: "LOOK" | "CHANGE",
  reason: string,
) => Promise<{ ok: true; url: string; code: string; ownerTold: string | null } | { ok: false; error: string }>;

const MIN_REASON = 10;

/**
 * Signing in as a member, in one step: a reason, look only or make changes,
 * and the button that says which. The second step is the link itself — a
 * real link the operator presses, so the browser opens it in a new tab, and
 * the admin portal stays where it was.
 */
export function SignInAsDialog({
  open,
  onOpenChange,
  member,
  workspaceName,
  ownerName,
  canChange,
  start,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string } | null;
  workspaceName: string;
  ownerName: string | null;
  canChange: boolean;
  start: SignInAsStart;
}) {
  const [mode, setMode] = useState<"LOOK" | "CHANGE">("LOOK");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ url: string; code: string; ownerTold: string | null } | null>(null);
  const [starting, startTransition] = useTransition();
  const first = member?.name.split(" ")[0] ?? "them";

  const close = (next: boolean) => {
    if (starting) return;
    if (!next) {
      setMode("LOOK");
      setReason("");
      setError(null);
      setReady(null);
    }
    onOpenChange(next);
  };

  const go = () =>
    startTransition(async () => {
      setError(null);
      if (reason.trim().length < MIN_REASON) {
        setError("Say why in a sentence. The owner is sent it, and it stays in their audit log.");
        return;
      }
      const result = await start(member!.id, mode, reason);
      if (result.ok) setReady(result);
      else setError(result.error);
    });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Sign in to {workspaceName} as {member?.name}
          </DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            For 30 minutes. {ownerName ? `${ownerName}, the owner, is emailed as you start, with a link to end it.` : "The workspace has no owner with an email to tell."}
          </DialogDescription>
        </DialogHeader>

        {ready ? (
          <div className="space-y-3">
            <p className="t-body text-[var(--text-body)]">
              <span className="font-mono">{ready.code}</span> is open.{" "}
              {ready.ownerTold ? `${ready.ownerTold} has been emailed.` : null} The link works once, in the next two minutes.
            </p>
            <DialogFooter>
              <Button onClick={() => close(false)}>Close</Button>
              <Button asChild variant="primary" endIcon={<ArrowRightUp />}>
                <a
                  href={ready.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => close(false)}
                  className="text-[var(--action-primary-fg)] no-underline hover:text-[var(--action-primary-fg)]"
                >
                  Open {workspaceName} as {first}
                </a>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="t-label text-[var(--ink)]">Why</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={300}
                placeholder={`What ${first} or the owner asked for, and where it came from`}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="t-label mb-1.5 text-[var(--ink)]">How far</legend>
              {(
                [
                  ["LOOK", "Look only", "See what they see. Nothing can be changed."],
                  ["CHANGE", "Make changes", "Do what they could do, except change their password, email or payment method."],
                ] as const
              ).map(([value, label, help]) =>
                value === "CHANGE" && !canChange ? null : (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
                  >
                    <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
                      <span className="block text-[13px] text-[var(--text-muted)]">{help}</span>
                    </span>
                  </label>
                ),
              )}
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-[var(--bad)]">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={starting} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={starting} onClick={go}>
                Sign in as {first}, {mode === "LOOK" ? "look only" : "making changes"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
