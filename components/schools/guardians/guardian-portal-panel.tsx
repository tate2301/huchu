"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Card } from "@corelithzw/react";

import { RecordActions } from "@/components/schools/common/record-actions";
import { LoadError, SaveError } from "@/components/schools/common/states";
import { PortalInviteDialog } from "@/components/schools/portal/portal-invite-dialog";
import { fetchJson } from "@/lib/api-client";

/**
 * Whether this parent can log in, and what to do about it.
 *
 * The record page said "Claimed" or "Not claimed" in a read-only property and
 * stopped there, which is the answer to the question and none of the next step:
 * the office reading "Not claimed" had to go back to the list, filter it down
 * to this one parent and invite from there. Worse, a live invitation was
 * invisible — a school that had already sent one had no way to see it, so the
 * usual outcome was a second invitation, and two working tokens for one account
 * is two chances to leak it.
 *
 * So the three states are named plainly and each carries its own verb. Reissuing
 * withdraws the previous token as part of issuing the new one; that happens in
 * `issuePortalInvite`, and the copy here says so rather than implying the school
 * can look the old one up.
 */

type PortalInvite = {
  id: string;
  sentTo: string;
  expiresAt: string;
  claimedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GuardianPortalPanel({
  guardianId,
  guardianNo,
  name,
  email,
  hasAccount,
}: {
  guardianId: string;
  guardianNo: string;
  name: string;
  email: string | null;
  hasAccount: boolean;
}) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const invitesQuery = useQuery({
    queryKey: ["schools", "portal-invites", "GUARDIAN", guardianId],
    queryFn: () =>
      fetchJson<{ data: PortalInvite[] }>(
        `/api/v2/schools/portal-invites?subject=GUARDIAN&subjectId=${guardianId}&limit=20`,
      ),
    // A claimed account has nothing left to invite; the history is not what
    // this panel is for.
    enabled: !hasAccount,
  });

  const outstanding = (invitesQuery.data?.data ?? []).find(
    (invite) => !invite.claimedAt && !invite.revokedAt,
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["schools", "portal-invites", "GUARDIAN", guardianId],
    });
    void queryClient.invalidateQueries({ queryKey: ["schools", "guardian", guardianId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
  };

  const revoke = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson(`/api/v2/schools/portal-invites/${inviteId}/revoke`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const state = hasAccount ? "claimed" : outstanding ? "outstanding" : "none";

  return (
    <>
      <Card
        title="Portal account"
        actions={
          state === "claimed" ? (
            <Badge tone="success">Claimed</Badge>
          ) : state === "outstanding" ? (
            <Badge tone="warn">Invitation outstanding</Badge>
          ) : (
            <Badge tone="neutral">Not invited</Badge>
          )
        }
      >
        <div className="space-y-3">
          {invitesQuery.isError ? (
            <LoadError
              what="this guardian's invitations"
              error={invitesQuery.error}
              onRetry={() => void invitesQuery.refetch()}
            />
          ) : null}
          {revoke.isError ? (
            <SaveError what="The withdrawal" error={revoke.error} />
          ) : null}

          <p className="text-sm text-[var(--text-muted)]">
            {state === "claimed"
              ? `${name} has set a password and can see the children they are linked to. Which of them, and what about each, is decided by the consent on the child's row.`
              : state === "outstanding"
                ? `An invitation is live, sent to ${outstanding?.sentTo}, and expires ${formatDay(outstanding!.expiresAt)}. The link itself was shown once when it was issued and cannot be recovered — reissuing mints a new one and withdraws this.`
                : email
                  ? `${name} has no portal account. An invitation sends them to a page where they set their own password; the link is shown once, here, and is not recoverable afterwards.`
                  : `${name} has no email address on their record, and an invitation has nowhere to go. Add one first.`}
          </p>

          <RecordActions
            resource="schools.students"
            verbs={[
              {
                label: state === "outstanding" ? "Reissue the invitation" : "Invite to the portal",
                action: "invite",
                unavailable:
                  state === "claimed"
                    ? "They already have an account."
                    : !email
                      ? "Add an email address to their record first."
                      : undefined,
                onSelect: () => setInviteOpen(true),
              },
              ...(state === "outstanding"
                ? [
                    {
                      label: "Withdraw the invitation",
                      action: "invite" as const,
                      tone: "danger" as const,
                      loading: revoke.isPending,
                      confirm: {
                        title: "Withdraw this invitation?",
                        description:
                          "The link stops working immediately. If it has already been passed on, whoever holds it can no longer use it.",
                        confirmLabel: "Withdraw it",
                      },
                      onSelect: () => revoke.mutate(outstanding!.id),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </Card>

      <PortalInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        subject="GUARDIAN"
        candidates={[
          {
            subjectId: guardianId,
            name,
            reference: guardianNo,
            email,
            hasAccount,
          },
        ]}
        onIssued={invalidate}
      />
    </>
  );
}
