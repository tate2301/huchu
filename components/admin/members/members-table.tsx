"use client";

import { useState, useTransition } from "react";
import type { UserRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListMeta,
  MobileListSubtitle,
  MobileListTitle,
  type BadgeTone,
} from "@corelithzw/react";

import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import type { ActionResult } from "@/lib/admin/workspace-context";
import type { MemberRow, MemberState } from "@/lib/admin/members";
import { formatWhen } from "@/lib/admin/format";
import { Badge as RoleIcon, DotsThree, Flag, LogOut, Phone, SignIn, User, UserCheck, UserSwitch, UserX } from "@/lib/icons";

import { SignInAsDialog, type SignInAsStart } from "./sign-in-as-dialog";

const STATE_TONE: Record<MemberState, BadgeTone> = {
  Active: "neutral",
  Invited: "info",
  "Never signed in": "neutral",
  "Till PIN locked": "warn",
  "Access removed": "neutral",
};

export type MemberActions = {
  changeRole: (memberId: string, role: UserRole) => Promise<ActionResult>;
  signOutEverywhere: (memberId: string) => Promise<ActionResult>;
  removeAccess: (memberId: string, reason: string) => Promise<ActionResult>;
  giveAccessBack: (memberId: string) => Promise<ActionResult>;
  signInAs: SignInAsStart;
};

type Pending =
  | { kind: "sign-in-as"; member: MemberRow }
  | { kind: "role"; member: MemberRow }
  | { kind: "sign-out"; member: MemberRow }
  | { kind: "remove"; member: MemberRow }
  | { kind: "restore"; member: MemberRow }
  | null;

/**
 * A workspace's members, with one ⋯ menu per row for what an operator may do
 * to a member from outside the product. Every confirmation names the member
 * and the workspace; anything inside the product is done by signing in as.
 */
export function MembersTable({
  workspaceName,
  members,
  roles,
  ownerName,
  can,
  actions,
}: {
  workspaceName: string;
  members: MemberRow[];
  roles: Array<{ value: UserRole; label: string }>;
  ownerName: string | null;
  /** What this operator's role may do here. Controls for the rest are not drawn. */
  can: { manage: boolean; signInAs: boolean; signInAsChange: boolean };
  actions: MemberActions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending>(null);

  /** Throws a refusal so the dialog shows it and stays open; tells and refreshes on success. */
  const settle = async (result: Promise<ActionResult>) => {
    const outcome = await result;
    if (!outcome.ok) throw new Error(outcome.error);
    toast({ title: outcome.message, variant: "success" });
    router.refresh();
  };

  const active = (member: MemberRow) => member.state !== "Access removed";
  const menu = (member: MemberRow) =>
    can.manage || (can.signInAs && active(member)) ? (
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Actions for ${member.name}`}>
            <DotsThree weight="bold" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          {can.signInAs && active(member) ? (
            <MenuItem icon={<UserSwitch />} onSelect={() => setPending({ kind: "sign-in-as", member })}>
              Sign in as {member.name.split(" ")[0]}…
            </MenuItem>
          ) : null}
          {!can.manage ? null : active(member) ? (
            <>
              {can.signInAs ? <MenuSeparator /> : null}
              <MenuItem icon={<RoleIcon />} onSelect={() => setPending({ kind: "role", member })}>
                Change role…
              </MenuItem>
              <MenuItem icon={<LogOut />} onSelect={() => setPending({ kind: "sign-out", member })}>
                Sign out everywhere…
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<UserX />} onSelect={() => setPending({ kind: "remove", member })}>
                Remove access…
              </MenuItem>
            </>
          ) : (
            <MenuItem icon={<UserCheck />} onSelect={() => setPending({ kind: "restore", member })}>
              Give access back…
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
    ) : null;

  const columns: RecordTableColumn<MemberRow>[] = [
    {
      id: "member",
      label: "Member",
      icon: User,
      cell: (member) => (
        <RecordTableName leading={<Avatar name={member.name} size="sm" />} title={member.name} subtitle={member.email ?? member.phone} />
      ),
    },
    {
      id: "role",
      label: "Role",
      icon: RoleIcon,
      width: "12rem",
      cell: (member) => (
        <span className="flex items-center gap-2">
          <RecordCell value={member.roleLabel} />
          {member.isOwner ? <Badge tone="neutral">Owner</Badge> : null}
        </span>
      ),
    },
    {
      id: "state",
      label: "State",
      icon: Flag,
      width: "9.5rem",
      cell: (member) => <Badge tone={STATE_TONE[member.state]}>{member.state}</Badge>,
    },
    { id: "phone", label: "Phone", icon: Phone, width: "10rem", cell: (member) => <RecordCell kind="phone" value={member.phone} /> },
    {
      id: "last",
      label: "Last sign-in",
      icon: SignIn,
      width: "9rem",
      cell: (member) => <RecordCell kind="date" value={formatWhen(member.lastSignInAt)} />,
    },
    { id: "menu", label: "", width: "3rem", align: "end", cell: menu },
  ];

  const member = pending?.member;
  const [rolePick, setRolePick] = useState<UserRole | null>(null);
  const [saving, startSaving] = useTransition();
  const [roleError, setRoleError] = useState<string | null>(null);

  return (
    <>
      <RecordTable
        rows={members}
        columns={columns}
        emptyTitle={`${workspaceName} has no members yet`}
        mobile={
          <MobileList>
            {members.map((row) => (
              <MobileListItem key={row.id}>
                <Avatar name={row.name} size="sm" />
                <MobileListContent>
                  <MobileListTitle>{row.name}</MobileListTitle>
                  <MobileListSubtitle>
                    {[row.roleLabel, row.isOwner ? "owner" : null, formatWhen(row.lastSignInAt)].filter(Boolean).join(" · ")}
                  </MobileListSubtitle>
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

      <SignInAsDialog
        open={pending?.kind === "sign-in-as"}
        onOpenChange={(open) => !open && setPending(null)}
        member={pending?.kind === "sign-in-as" ? member! : null}
        workspaceName={workspaceName}
        ownerName={ownerName}
        canChange={can.signInAsChange}
        start={actions.signInAs}
      />

      <ConfirmDialog
        open={pending?.kind === "sign-out"}
        onOpenChange={(open) => !open && setPending(null)}
        ask={{
          title: `Sign ${member?.name} out everywhere?`,
          body: `Every browser and till ${member?.name} is signed in on, in ${workspaceName}, ends on its next click. They sign in again with their password or an emailed code.`,
          keep: "Keep them signed in",
          go: "Sign out everywhere",
          fill: "action",
        }}
        onConfirm={() => settle(actions.signOutEverywhere(member!.id))}
      />

      <ConfirmDialog
        open={pending?.kind === "remove"}
        onOpenChange={(open) => !open && setPending(null)}
        ask={{
          title: `Remove ${member?.name}'s access to ${workspaceName}?`,
          body: `They are signed out everywhere and cannot sign in, by password, emailed code or till PIN. Their records stay. You can give access back.`,
          keep: "Keep their access",
          go: "Remove access",
          fill: "bad",
          field: {
            key: "reason",
            label: "Why",
            placeholder: "The owner reads this in their audit log",
            min: 3,
            max: 300,
            needed: "Say why, so the owner can see it in their audit log.",
          },
        }}
        onConfirm={(reason) => settle(actions.removeAccess(member!.id, reason ?? ""))}
      />

      <ConfirmDialog
        open={pending?.kind === "restore"}
        onOpenChange={(open) => !open && setPending(null)}
        ask={{
          title: `Give ${member?.name} access to ${workspaceName} again?`,
          body: `They can sign in again, with the role they had: ${member?.roleLabel}.`,
          keep: "Not now",
          go: "Give access back",
          fill: "action",
        }}
        onConfirm={() => settle(actions.giveAccessBack(member!.id))}
      />

      <Dialog
        open={pending?.kind === "role"}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setPending(null);
            setRolePick(null);
            setRoleError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {member?.name}&apos;s role in {workspaceName}</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              The new role&apos;s pages and permissions apply from their next click. Any features turned on for them alone go back to
              the role&apos;s.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1" aria-label="Role">
            {roles.map((option) => (
              <label
                key={option.value}
                className="flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={(rolePick ?? member?.role) === option.value}
                  onChange={() => setRolePick(option.value)}
                />
                <span className="flex-1 text-sm">{option.label}</span>
                {member?.role === option.value ? <span className="text-xs text-[var(--text-muted)]">Now</span> : null}
              </label>
            ))}
          </fieldset>
          {roleError ? (
            <p role="alert" className="text-sm text-[var(--bad)]">
              {roleError}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={saving} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!rolePick || rolePick === member?.role}
              onClick={() =>
                startSaving(async () => {
                  setRoleError(null);
                  try {
                    await settle(actions.changeRole(member!.id, rolePick!));
                    setPending(null);
                    setRolePick(null);
                  } catch (error) {
                    setRoleError(error instanceof Error ? error.message : "That did not work. Nothing was changed.");
                  }
                })
              }
            >
              {rolePick && rolePick !== member?.role
                ? `Make them ${roles.find((option) => option.value === rolePick)?.label ?? "this role"}`
                : "Choose a role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
