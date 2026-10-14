"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SettingRow } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { formatTime } from "@/lib/admin/format";
import type { ActionResult } from "@/lib/admin/workspace-context";
import { Download, LogOut, Prohibit, Save, X } from "@/lib/icons";

export type SettingsActions = {
  rename: (name: string) => Promise<ActionResult>;
  signOutEveryone: (reason: string) => Promise<ActionResult>;
  endSession: (sessionId: string) => Promise<ActionResult>;
  suspend: (reason: string) => Promise<ActionResult>;
  reinstate: (reason: string) => Promise<ActionResult>;
  close: (typedAddress: string, reason: string) => Promise<ActionResult>;
};

type OpenSession = { id: string; code: string; operator: string; member: string; mode: "LOOK" | "CHANGE"; until: Date };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className="t-section pb-1 text-[var(--ink)]">{title}</h2>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{children}</div>
    </section>
  );
}

/**
 * A workspace's settings, from outside it: what it is called, who is in it
 * now, its records, and whether it is open. Everything inside the product —
 * its sites, templates, the customer's own preferences — is done by signing
 * in as one of its members.
 */
export function SettingsPanel({
  workspace,
  address,
  status,
  sessions,
  can,
  accessRecordHref,
  actions,
}: {
  workspace: { name: string; slug: string };
  address: string;
  status: string;
  sessions: OpenSession[];
  can: { edit: boolean; signOut: boolean; endSessions: boolean; export: boolean; suspend: boolean; close: boolean };
  accessRecordHref: string;
  actions: SettingsActions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(workspace.name);
  const [asking, setAsking] = useState<"sign-out" | "suspend" | "reinstate" | "close" | null>(null);
  const [busy, startBusy] = useTransition();
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);

  const settle = async (result: Promise<ActionResult>) => {
    const outcome = await result;
    if (!outcome.ok) throw new Error(outcome.error);
    toast({ title: outcome.message, variant: "success" });
    router.refresh();
  };
  const now = (work: () => Promise<ActionResult>) =>
    startBusy(async () => {
      try {
        await settle(work());
      } catch (error) {
        toast({ title: error instanceof Error ? error.message : "That did not work.", variant: "destructive" });
      }
    });

  return (
    <div className="space-y-8 pb-10">
      <Section title="Name and address">
        <SettingRow label="Name" description="What members see at the top of their workspace, and on documents.">
          {can.edit ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                now(() => actions.rename(name));
              }}
            >
              <Input aria-label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} className="w-64" />
              <Button type="submit" startIcon={<Save />} loading={busy} disabled={name.trim() === workspace.name}>
                Save
              </Button>
            </form>
          ) : (
            <span className="text-sm">{workspace.name}</span>
          )}
        </SettingRow>
        <SettingRow label="Address" description="Where members sign in. It cannot change once members use it.">
          <span className="font-mono text-sm text-[var(--ink)]">{address}</span>
        </SettingRow>
      </Section>

      <Section title="Who is in">
        {can.signOut ? (
          <SettingRow
            label="Sign everyone out"
            description="Every member's sessions end on their next click, and any sign-in-as with them. They sign in again as usual."
          >
            <Button startIcon={<LogOut />} onClick={() => setAsking("sign-out")}>
              Sign everyone out
            </Button>
          </SettingRow>
        ) : null}
        <SettingRow
          label="Corelith staff signed in now"
          description={sessions.length ? "Each ends on its own after 30 minutes." : "Nobody from Corelith is signed in as a member."}
        >
          {sessions.length ? (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-[var(--ink-3)]">{session.code}</span>
                  <span>
                    {session.operator} as {session.member}, {session.mode === "LOOK" ? "look only" : "making changes"}, until{" "}
                    <span className="font-mono">{formatTime(session.until)}</span>
                  </span>
                  {can.endSessions ? (
                    <Button size="sm" startIcon={<X />} onClick={() => now(() => actions.endSession(session.id))}>
                      End
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </SettingRow>
      </Section>

      {can.export ? (
        <Section title="Records">
          <SettingRow
            label="The access record"
            description="Every sign-in, and every time Corelith staff signed in as a member, with the reason. What the owner or POTRAZ asks for."
          >
            <Button asChild startIcon={<Download />}>
              <a href={accessRecordHref} download className="no-underline">
                Download as CSV
              </a>
            </Button>
          </SettingRow>
        </Section>
      ) : null}

      {(can.suspend && (status === "ACTIVE" || status === "SUSPENDED")) || (can.close && status !== "DISABLED") ? (
        <Section title="Standing">
          {can.suspend && status === "SUSPENDED" ? (
            <SettingRow label="Reinstate" description="Members can sign in again. Their data is as it was.">
              <Button onClick={() => setAsking("reinstate")}>Reinstate</Button>
            </SettingRow>
          ) : null}
          {can.suspend && status === "ACTIVE" ? (
            <SettingRow label="Suspend" description="Nobody can sign in or use it until it is reinstated. The data stays as it is.">
              <Button startIcon={<Prohibit />} onClick={() => setAsking("suspend")}>
                Suspend
              </Button>
            </SettingRow>
          ) : null}
          {can.close && status !== "DISABLED" ? (
            <SettingRow label="Close" description="For good. Members lose access at once and the portal cannot reopen it.">
              <Button variant="danger" onClick={() => setAsking("close")}>
                Close {workspace.name}…
              </Button>
            </SettingRow>
          ) : null}
        </Section>
      ) : null}

      <ConfirmDialog
        open={asking === "sign-out"}
        onOpenChange={(open) => !open && setAsking(null)}
        ask={{
          title: `Sign everyone in ${workspace.name} out?`,
          body: "Every member's sessions end on their next click, on every browser and till.",
          keep: "Not now",
          go: "Sign everyone out",
          fill: "action",
          field: { key: "reason", label: "Why", placeholder: "The owner reads this in their audit log", min: 3, max: 300, needed: "Say why." },
        }}
        onConfirm={(reason) => settle(actions.signOutEveryone(reason ?? ""))}
      />
      <ConfirmDialog
        open={asking === "suspend"}
        onOpenChange={(open) => !open && setAsking(null)}
        ask={{
          title: `Suspend ${workspace.name}?`,
          body: "Everyone is signed out and nobody can sign in until it is reinstated. Nothing is deleted.",
          keep: "Keep it open",
          go: "Suspend",
          fill: "bad",
          field: { key: "reason", label: "Why", placeholder: "The owner's phone was stolen, 11 Oct", min: 3, max: 300, needed: "Say why." },
        }}
        onConfirm={(reason) => settle(actions.suspend(reason ?? ""))}
      />
      <ConfirmDialog
        open={asking === "reinstate"}
        onOpenChange={(open) => !open && setAsking(null)}
        ask={{
          title: `Reinstate ${workspace.name}?`,
          body: "Members can sign in again.",
          keep: "Not now",
          go: "Reinstate",
          fill: "action",
          field: { key: "reason", label: "Why", placeholder: "The owner confirmed by phone", min: 3, max: 300, needed: "Say why." },
        }}
        onConfirm={(reason) => settle(actions.reinstate(reason ?? ""))}
      />

      <Dialog
        open={asking === "close"}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setAsking(null);
            setTyped("");
            setWhy("");
            setCloseError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close {workspace.name} for good?</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              Every member loses access at once, and nobody can reopen it from here. The data is kept. This is the one thing
              in the portal that cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              label={`Type ${workspace.slug} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="font-mono"
              autoComplete="off"
            />
            <label className="block space-y-1.5">
              <span className="t-label text-[var(--ink)]">Why</span>
              <textarea
                value={why}
                onChange={(event) => setWhy(event.target.value)}
                rows={3}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--action)] focus:outline-none"
              />
            </label>
            {closeError ? <p role="alert" className="text-sm text-[var(--bad)]">{closeError}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={typed.trim().toLowerCase() !== workspace.slug}
              onClick={() =>
                startBusy(async () => {
                  setCloseError(null);
                  try {
                    await settle(actions.close(typed, why));
                    setAsking(null);
                  } catch (error) {
                    setCloseError(error instanceof Error ? error.message : "That did not work.");
                  }
                })
              }
            >
              Close {workspace.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
