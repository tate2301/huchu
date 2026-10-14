"use client";

import { useState, useTransition } from "react";
import type { OperatorRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Input,
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListMeta,
  MobileListSubtitle,
  MobileListTitle,
  type BadgeTone,
} from "@corelithzw/react";

import { AdminPageHeader } from "@/components/admin/page-header";
import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { formatWhen } from "@/lib/admin/format";
import type { ActionResult } from "@/lib/admin/workspace-context";
import type { OperatorRow, OperatorState } from "@/lib/operators/manage";
import { Badge as RoleIcon, CopyLink, DotsThree, Flag, Key, Mail, ShieldCheck, SignIn, User, UserPlus, UserX } from "@/lib/icons";

const STATE_TONE: Record<OperatorState, BadgeTone> = {
  Active: "neutral",
  Invited: "info",
  "Needs a second factor": "warn",
  Locked: "warn",
  Removed: "neutral",
};

const ROLES: Array<{ value: OperatorRole; label: string; help: string }> = [
  { value: "SUPPORT", label: "Support", help: "Members, sign in as, and a workspace's settings short of closing it." },
  { value: "BILLING", label: "Billing", help: "Plans, add-ons, trials and payments. Signs in as a member to look only." },
  { value: "OWNER", label: "Owner", help: "Everything, including operators and closing a workspace." },
];

type InviteResult = { ok: true; message: string; link: string } | { ok: false; error: string };

export type OperatorActions = {
  invite: (input: { name: string; email: string; role: OperatorRole }) => Promise<InviteResult>;
  newInvite: (operatorId: string) => Promise<InviteResult>;
  resetAuthenticator: (operatorId: string) => Promise<ActionResult>;
  changeRole: (operatorId: string, role: OperatorRole) => Promise<ActionResult>;
  remove: (operatorId: string) => Promise<ActionResult>;
};

/**
 * The portal's own people. Only owners see this page. A new operator is
 * invited by email; the link is also shown once, to send another way.
 */
export function OperatorsTable({ rows, selfId, actions }: { rows: OperatorRow[]; selfId: string; actions: OperatorActions }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, startBusy] = useTransition();
  const [dialog, setDialog] = useState<null | { kind: "invite" } | { kind: "role" | "reset" | "remove"; row: OperatorRow }>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; role: OperatorRole }>({ name: "", email: "", role: "SUPPORT" });
  const [role, setRole] = useState<OperatorRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = (message: string) => {
    toast({ title: message, variant: "success" });
    router.refresh();
  };
  const settle = async (result: Promise<ActionResult>) => {
    const outcome = await result;
    if (!outcome.ok) throw new Error(outcome.error);
    done(outcome.message);
  };

  const menu = (row: OperatorRow) =>
    row.id === selfId || row.state === "Removed" ? null : (
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Actions for ${row.name}`}>
            <DotsThree weight="bold" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<RoleIcon />} onSelect={() => setDialog({ kind: "role", row })}>
            Change role…
          </MenuItem>
          <MenuItem
            icon={<Mail />}
            onSelect={() =>
              startBusy(async () => {
                const outcome = await actions.newInvite(row.id);
                if (!outcome.ok) toast({ title: outcome.error, variant: "destructive" });
                else {
                  setLink({ name: row.name, url: outcome.link });
                  done(outcome.message);
                }
              })
            }
          >
            Send a new invite
          </MenuItem>
          <MenuItem icon={<Key />} onSelect={() => setDialog({ kind: "reset", row })}>
            Reset their authenticator…
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<UserX />} onSelect={() => setDialog({ kind: "remove", row })}>
            Remove…
          </MenuItem>
        </MenuContent>
      </Menu>
    );

  const columns: RecordTableColumn<OperatorRow>[] = [
    {
      id: "operator",
      label: "Operator",
      icon: User,
      cell: (row) => (
        <RecordTableName leading={<Avatar name={row.name} size="sm" />} title={row.id === selfId ? `${row.name} (you)` : row.name} subtitle={row.email} />
      ),
    },
    { id: "role", label: "Role", icon: RoleIcon, width: "9rem", cell: (row) => <RecordCell value={row.roleLabel} /> },
    { id: "state", label: "State", icon: Flag, width: "12rem", cell: (row) => <Badge tone={STATE_TONE[row.state]}>{row.state}</Badge> },
    {
      id: "factor",
      label: "Authenticator",
      icon: ShieldCheck,
      width: "9rem",
      cell: (row) => <RecordCell kind="date" value={row.totpConfirmedAt ? `Since ${formatWhen(row.totpConfirmedAt)}` : null} />,
    },
    { id: "last", label: "Last sign-in", icon: SignIn, width: "9rem", cell: (row) => <RecordCell kind="date" value={formatWhen(row.lastSignInAt)} /> },
    { id: "menu", label: "", width: "3rem", align: "end", cell: menu },
  ];

  const target = dialog && dialog.kind !== "invite" ? dialog.row : null;

  return (
    <>
      <AdminPageHeader
        title="Operators"
        actions={
          <Button variant="primary" startIcon={<UserPlus />} onClick={() => setDialog({ kind: "invite" })}>
            Invite an operator
          </Button>
        }
      />
      {link ? (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--sel-line)] bg-[var(--sel-bg)] px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">
            {link.name}&apos;s invite link, if the email does not reach them. It works once, for three days, and is not shown again.
          </span>
          <Button
            size="sm"
            startIcon={<CopyLink />}
            onClick={() => {
              void navigator.clipboard.writeText(link.url);
              toast({ title: "Link copied." });
            }}
          >
            Copy link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
            Done
          </Button>
        </div>
      ) : null}
      <RecordTable
        rows={rows}
        columns={columns}
        emptyTitle="No operators yet"
        mobile={
          <MobileList>
            {rows.map((row) => (
              <MobileListItem key={row.id}>
                <Avatar name={row.name} size="sm" />
                <MobileListContent>
                  <MobileListTitle>{row.name}</MobileListTitle>
                  <MobileListSubtitle>{[row.roleLabel, row.email].join(" · ")}</MobileListSubtitle>
                </MobileListContent>
                <MobileListMeta>
                  <span className="flex items-center gap-1">
                    <Badge tone={STATE_TONE[row.state]}>{row.state}</Badge>
                    {menu(row)}
                  </span>
                </MobileListMeta>
              </MobileListItem>
            ))}
          </MobileList>
        }
      />

      <Dialog open={dialog?.kind === "invite"} onOpenChange={(open) => !open && !busy && (setDialog(null), setError(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite an operator</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              They are emailed a link to choose a password, then set up an authenticator at their first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <Input label="Work email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <fieldset className="space-y-1.5">
              <legend className="t-label mb-1.5 text-[var(--ink)]">Role</legend>
              {ROLES.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
                >
                  <input type="radio" name="invite-role" className="mt-1" checked={form.role === option.value} onChange={() => setForm({ ...form, role: option.value })} />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-[13px] text-[var(--text-muted)]">{option.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error ? <p role="alert" className="text-sm text-[var(--bad)]">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                startBusy(async () => {
                  setError(null);
                  const outcome = await actions.invite(form);
                  if (!outcome.ok) return setError(outcome.error);
                  setLink({ name: form.name, url: outcome.link });
                  setForm({ name: "", email: "", role: "SUPPORT" });
                  setDialog(null);
                  done(outcome.message);
                })
              }
            >
              Send the invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "role"} onOpenChange={(open) => !open && !busy && (setDialog(null), setRole(null), setError(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {target?.name}&apos;s role</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">It applies from their next click.</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1.5" aria-label="Role">
            {ROLES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
              >
                <input type="radio" name="role" className="mt-1" checked={(role ?? target?.role) === option.value} onChange={() => setRole(option.value)} />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-[13px] text-[var(--text-muted)]">{option.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? <p role="alert" className="text-sm text-[var(--bad)]">{error}</p> : null}
          <DialogFooter>
            <Button disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!role || role === target?.role}
              onClick={() =>
                startBusy(async () => {
                  setError(null);
                  try {
                    await settle(actions.changeRole(target!.id, role!));
                    setDialog(null);
                    setRole(null);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "That did not work.");
                  }
                })
              }
            >
              Change role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog?.kind === "reset"}
        onOpenChange={(open) => !open && setDialog(null)}
        ask={{
          title: `Reset ${target?.name}'s authenticator?`,
          body: "For a lost or replaced phone. They are signed out everywhere, and set up a new authenticator at their next sign-in with their password.",
          keep: "Not now",
          go: "Reset authenticator",
          fill: "action",
        }}
        onConfirm={() => settle(actions.resetAuthenticator(target!.id))}
      />
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(open) => !open && setDialog(null)}
        ask={{
          title: `Remove ${target?.name} as an operator?`,
          body: "They are signed out everywhere, any sign-in-as they have open ends, and they cannot sign in again. What they did stays in the audit log under their name.",
          keep: "Keep them",
          go: "Remove",
          fill: "bad",
        }}
        onConfirm={() => settle(actions.remove(target!.id))}
      />
    </>
  );
}
