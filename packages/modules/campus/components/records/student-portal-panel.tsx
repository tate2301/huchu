"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordActions } from "../common/record-actions";
import { SaveError } from "../common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { formatSchoolDate } from "../../format";
import {
  fetchPortalInvites,
  issuePortalInvite,
  revokePortalInvite,
} from "../../students-v2";

/**
 * Getting a child onto the portal, from their own record.
 *
 * The invitation existed as an endpoint and had no control anywhere in the
 * module, so the portal was a feature a school owned and could not switch on
 * for anybody. This is the whole of it: one address, one invitation, and a way
 * to take it back before it is claimed.
 *
 * An account that has been claimed cannot be re-invited — the child already
 * has a way in, and issuing a second token would only give somebody a link to
 * an account they are already signed into.
 *
 * NOTE: `POST /api/v2/schools/portal-invites` gates on `schools.students`
 * *create*, not *invite*, so that is what this button asks about. Gating the
 * control on `invite` would show a bursar an enabled button the server then
 * refuses — the exact "learn the permissions from a red alert" behaviour this
 * vocabulary exists to end.
 */
export function StudentPortalPanel({
  studentId,
  hasAccount,
  /** Somewhere to default the address to — usually the primary guardian's. */
  suggestedEmail,
}: {
  studentId: string;
  hasAccount: boolean;
  suggestedEmail?: string | null;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(suggestedEmail ?? "");
  const [error, setError] = useState<unknown>(null);

  const invitesQuery = useQuery({
    queryKey: ["schools", "portal-invites", "STUDENT"],
    queryFn: () => fetchPortalInvites({ subject: "STUDENT" }),
  });

  const invite = useMemo(
    () =>
      (invitesQuery.data?.data ?? []).find(
        (row) => row.student?.id === studentId && !row.revokedAt,
      ) ?? null,
    [invitesQuery.data, studentId],
  );

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["schools", "portal-invites"] });

  const issueMutation = useMutation({
    mutationFn: () =>
      issuePortalInvite({ subject: "STUDENT", subjectId: studentId, sentTo: email.trim() }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (cause) => setError(cause),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokePortalInvite(id),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (cause) => setError(cause),
  });

  const claimed = hasAccount || Boolean(invite?.claimedAt);
  const outstanding = invite && !invite.claimedAt;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {claimed ? (
          <Badge tone="success">Signed in</Badge>
        ) : outstanding ? (
          <Badge tone="warn">Invited</Badge>
        ) : (
          <Badge tone="neutral">No account</Badge>
        )}
        {outstanding ? (
          <span className="text-sm text-[var(--text-muted)]">
            {invite.sentTo} · expires {formatSchoolDate(invite.expiresAt)}
          </span>
        ) : null}
      </div>

      {error ? <SaveError what="That invitation" error={error} /> : null}

      {claimed ? (
        <p className="text-sm text-[var(--text-muted)]">
          This child can sign in. Removing that access is a matter for the
          administrator who manages the accounts.
        </p>
      ) : (
        <>
          {!outstanding ? (
            <div className="space-y-2">
              <Label htmlFor="portal-invite-email">Send the invitation to</Label>
              <Input
                id="portal-invite-email"
                type="email"
                value={email}
                placeholder="parent@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : null}

          <RecordActions
            resource="schools.students"
            verbs={
              outstanding
                ? [
                    {
                      label: "Take the invitation back",
                      action: "create",
                      tone: "danger" as const,
                      loading: revokeMutation.isPending,
                      confirm: {
                        title: "Take the invitation back",
                        description:
                          "The link stops working. Nobody who has not already used it can sign in with it, and a fresh one can be sent afterwards.",
                        confirmLabel: "Take it back",
                      },
                      onSelect: () => revokeMutation.mutate(invite.id),
                    },
                  ]
                : [
                    {
                      label: "Invite to the portal",
                      action: "create",
                      loading: issueMutation.isPending,
                      unavailable:
                        email.trim().length === 0
                          ? "An email address is needed to send it to."
                          : undefined,
                      onSelect: () => issueMutation.mutate(),
                    },
                  ]
            }
          />
        </>
      )}
    </div>
  );
}
