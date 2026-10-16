"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, SettingRow } from "@corelithzw/react";

import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { formatTime } from "@/lib/admin/format";
import type { ActionResult } from "@/lib/admin/workspace-context";
import { Download, LogOut, Prohibit, Save, Trash, X } from "@/lib/icons";
import type { Ask } from "@/lib/workspace/ask";

import { ResetDataDialog, type ResetActions } from "./reset-data-dialog";

export type SettingsActions = {
  rename: (name: string) => Promise<ActionResult>;
  changeAddress: (address: string) => Promise<ActionResult>;
  signOutEveryone: (reason: string) => Promise<ActionResult>;
  endSession: (sessionId: string) => Promise<ActionResult>;
  suspend: (reason: string) => Promise<ActionResult>;
  reinstate: (reason: string) => Promise<ActionResult>;
  close: (reason: string) => Promise<ActionResult>;
  reopen: (reason: string) => Promise<ActionResult>;
  deleteForGood: (typedAddress: string, reason: string) => Promise<ActionResult>;
  previewReset: ResetActions["preview"];
  resetData: ResetActions["reset"];
};

type OpenSession = { id: string; code: string; operator: string; member: string; mode: "LOOK" | "CHANGE"; until: Date };

type Asking = "address" | "sign-out" | "suspend" | "reinstate" | "close" | "reopen" | "delete" | "reset";

const why = (placeholder: string): NonNullable<Ask["field"]> => ({
  key: "reason",
  label: "Why",
  placeholder,
  min: 3,
  max: 300,
  needed: "Say why, so the owner can see it in their audit log.",
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className="t-section pb-1 text-[var(--ink)]">{title}</h2>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{children}</div>
    </section>
  );
}

/**
 * A workspace's settings, from outside it: what it is called and where it is,
 * who is in it now, its records, whether it is open, and its data. Everything
 * inside the product — its templates, the customer's own preferences — is
 * done by signing in as one of its members.
 */
export function SettingsPanel({
  workspace,
  root,
  status,
  sessions,
  can,
  accessRecordHref,
  actions,
}: {
  workspace: { name: string; slug: string };
  /** The domain addresses sit under ("corelith.co.zw"), when there is one. */
  root: string | null;
  status: string;
  sessions: OpenSession[];
  can: { edit: boolean; signOut: boolean; endSessions: boolean; export: boolean; suspend: boolean; close: boolean };
  accessRecordHref: string;
  actions: SettingsActions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(workspace.name);
  const [address, setAddress] = useState(workspace.slug);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, startBusy] = useTransition();
  const closed = status === "DISABLED";
  const nextAddress = address.trim().toLowerCase();
  const where = (slug: string) => (root ? `${slug}.${root}` : slug);

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
  const ask = (key: Asking) => ({ open: asking === key, onOpenChange: (open: boolean) => !open && setAsking(null) });

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
        <SettingRow
          label="Address"
          description="Where members sign in. Changed, the old address stops working at once: tell the owner first."
        >
          {can.edit ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (nextAddress && nextAddress !== workspace.slug) setAsking("address");
              }}
            >
              <Input
                aria-label="Workspace address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="w-48 font-mono"
                autoComplete="off"
                spellCheck={false}
                suffix={root ? `.${root}` : undefined}
              />
              <Button type="submit" startIcon={<Save />} disabled={!nextAddress || nextAddress === workspace.slug}>
                Change
              </Button>
            </form>
          ) : (
            <span className="font-mono text-sm text-[var(--ink)]">{where(workspace.slug)}</span>
          )}
        </SettingRow>
      </Section>

      <Section title="Who is in">
        {can.signOut && !closed ? (
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

      {(can.suspend && (status === "ACTIVE" || status === "SUSPENDED")) || can.close ? (
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
          {can.close && !closed ? (
            <SettingRow label="Close" description="Members lose access at once. The data is kept, and an owner can reopen it here.">
              <Button variant="danger" onClick={() => setAsking("close")}>
                Close…
              </Button>
            </SettingRow>
          ) : null}
          {can.close && closed ? (
            <SettingRow label="Reopen" description="Members can sign in again, and its standing goes back to what the subscription says.">
              <Button onClick={() => setAsking("reopen")}>Reopen</Button>
            </SettingRow>
          ) : null}
          {can.close && closed ? (
            <SettingRow
              label="Delete for good"
              description="Every record it holds is deleted and the address is freed. The audit log keeps a line saying who did it and why."
            >
              <Button variant="danger" startIcon={<Trash />} onClick={() => setAsking("delete")}>
                Delete for good…
              </Button>
            </SettingRow>
          ) : null}
        </Section>
      ) : null}

      {can.close && !closed ? (
        <Section title="Data">
          <SettingRow
            label="Delete the workspace's data"
            description="To start again: the modules and records chosen are deleted. The workspace, its owners, its billing and its audit log stay."
          >
            <Button variant="danger" startIcon={<Trash />} onClick={() => setAsking("reset")}>
              Delete data…
            </Button>
          </SettingRow>
        </Section>
      ) : null}

      <ConfirmDialog
        {...ask("address")}
        ask={{
          title: `Change the address to ${where(nextAddress)}?`,
          body: `Members sign in at ${where(nextAddress)} from now on. ${where(workspace.slug)} stops working at once, so bookmarks, links in emails and tills set up on it need the new one.`,
          keep: "Keep the old one",
          go: "Change the address",
          fill: "action",
        }}
        onConfirm={async () => {
          const outcome = await actions.changeAddress(nextAddress);
          if (!outcome.ok) throw new Error(outcome.error);
          toast({ title: outcome.message, variant: "success" });
          router.replace(`/admin/w/${nextAddress}/settings`);
        }}
      />
      <ConfirmDialog
        {...ask("sign-out")}
        ask={{
          title: `Sign everyone in ${workspace.name} out?`,
          body: "Every member's sessions end on their next click, on every browser and till.",
          keep: "Not now",
          go: "Sign everyone out",
          fill: "action",
          field: why("The owner's phone was stolen, 11 Oct"),
        }}
        onConfirm={(reason) => settle(actions.signOutEveryone(reason ?? ""))}
      />
      <ConfirmDialog
        {...ask("suspend")}
        ask={{
          title: `Suspend ${workspace.name}?`,
          body: "Everyone is signed out and nobody can sign in until it is reinstated. Nothing is deleted.",
          keep: "Keep it open",
          go: "Suspend",
          fill: "bad",
          field: why("The owner's phone was stolen, 11 Oct"),
        }}
        onConfirm={(reason) => settle(actions.suspend(reason ?? ""))}
      />
      <ConfirmDialog
        {...ask("reinstate")}
        ask={{
          title: `Reinstate ${workspace.name}?`,
          body: "Members can sign in again.",
          keep: "Not now",
          go: "Reinstate",
          fill: "action",
          field: why("The owner confirmed by phone"),
        }}
        onConfirm={(reason) => settle(actions.reinstate(reason ?? ""))}
      />
      <ConfirmDialog
        {...ask("close")}
        ask={{
          title: `Close ${workspace.name}?`,
          body: "Nobody gets in again until an owner reopens it, and everyone is signed out now. The data is kept; deleting it for good is a separate step.",
          keep: "Keep it open",
          go: "Close",
          fill: "bad",
          field: why("The business closed down"),
        }}
        onConfirm={(reason) => settle(actions.close(reason ?? ""))}
      />
      <ConfirmDialog
        {...ask("reopen")}
        ask={{
          title: `Reopen ${workspace.name}?`,
          body: "Its members can sign in again, and its standing goes back to what the subscription says.",
          keep: "Keep it closed",
          go: "Reopen",
          fill: "action",
          field: why("Closed by mistake"),
        }}
        onConfirm={(reason) => settle(actions.reopen(reason ?? ""))}
      />
      <ConfirmDialog
        {...ask("delete")}
        ask={{
          title: `Delete ${workspace.name} for good?`,
          body: "Every record it holds — members, sales, stock, payroll, documents — is deleted now, and the address is freed. This cannot be undone. The audit log keeps a line saying who deleted it and why.",
          keep: "Keep it",
          go: "Delete for good",
          fill: "bad",
          field: why("The owner asked for their data to be deleted"),
          typed: { label: `Type ${workspace.slug} to go ahead`, text: workspace.slug },
        }}
        onConfirm={async (reason) => {
          const outcome = await actions.deleteForGood(workspace.slug, reason ?? "");
          if (!outcome.ok) throw new Error(outcome.error);
          toast({ title: outcome.message, variant: "success" });
          router.replace("/admin/workspaces?tab=closed");
        }}
      />
      <ResetDataDialog
        {...ask("reset")}
        workspaceName={workspace.name}
        actions={{ preview: actions.previewReset, reset: actions.resetData }}
        onDone={(message) => {
          toast({ title: message, variant: "success" });
          router.refresh();
        }}
      />
    </div>
  );
}
