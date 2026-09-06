"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { MobileList, MobileListEmpty } from "@corelithzw/react";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  issuePortalInvites,
  type IssuedPortalInvite,
  type PortalInviteFailure,
  type PortalInviteSubject,
} from "@/lib/schools/admin-v2";

export type PortalInviteCandidate = {
  subjectId: string;
  name: string;
  reference: string;
  email: string | null;
  hasAccount: boolean;
};

/**
 * Inviting students or guardians to the portal.
 *
 * The link is shown once, here, because the server keeps only a hash of it.
 * There is no re-send that recovers a token — reissuing mints a new one and
 * withdraws the old, which is why the copy says so rather than implying the
 * school can look it up later.
 *
 * Candidates without an email address are listed as skipped rather than hidden,
 * so a bursar working through 800 guardians can see exactly who needs a contact
 * detail before the portal opens.
 */
export function PortalInviteDialog({
  open,
  onOpenChange,
  subject,
  candidates,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: PortalInviteSubject;
  candidates: PortalInviteCandidate[];
  onIssued?: () => void;
}) {
  const [result, setResult] = useState<{
    issued: IssuedPortalInvite[];
    failed: PortalInviteFailure[];
  } | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setResult(null);
  }

  const invitable = candidates.filter(
    (candidate) => !candidate.hasAccount && candidate.email,
  );
  const missingEmail = candidates.filter(
    (candidate) => !candidate.hasAccount && !candidate.email,
  );
  const alreadyOn = candidates.filter((candidate) => candidate.hasAccount);

  const issue = useMutation({
    mutationFn: () =>
      issuePortalInvites(
        invitable.map((candidate) => ({
          subject,
          subjectId: candidate.subjectId,
          sentTo: candidate.email!,
        })),
      ),
    onSuccess: (data) => {
      setResult(data);
      onIssued?.();
    },
  });

  const noun = subject === "STUDENT" ? "student" : "guardian";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={result ? "Invitation links" : `Invite ${invitable.length} to the portal`}
      description={`Each ${noun} sets their own password and is bound to their record.`}
      size="lg"
      errors={issue.error ? [getApiErrorMessage(issue.error)] : undefined}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          {result ? null : (
            <Button
              type="button"
              disabled={invitable.length === 0 || issue.isPending}
              onClick={() => issue.mutate()}
            >
              {issue.isPending
                ? "Issuing…"
                : `Issue ${invitable.length} invitation${invitable.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      }
    >
      {result ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Copy these links now</AlertTitle>
            <AlertDescription>
              They are shown once. Send each one to its {noun}; the school cannot
              retrieve a link afterwards, only issue a replacement.
            </AlertDescription>
          </Alert>

          <MobileList>
            {result.issued.length === 0 ? (
              <MobileListEmpty>No invitations were issued.</MobileListEmpty>
            ) : (
              result.issued.map((invite) => (
                <MobileList.Row
                  key={invite.subjectId}
                  static
                  title={invite.sentTo}
                  subtitle={`${window.location.origin}/c/${invite.token}`}
                />
              ))
            )}
          </MobileList>

          {result.failed.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-section-title">Not issued</h3>
              <MobileList>
                {result.failed.map((failure) => (
                  <MobileList.Row
                    key={failure.subjectId}
                    static
                    title={failure.sentTo}
                    subtitle={failure.reason}
                  />
                ))}
              </MobileList>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {invitable.length === 0 ? (
            <Alert>
              <AlertTitle>Nobody to invite</AlertTitle>
              <AlertDescription>
                Everyone selected either has an account already or has no email
                address on their record.
              </AlertDescription>
            </Alert>
          ) : null}

          {missingEmail.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-section-title">
                Skipped — no email address ({missingEmail.length})
              </h3>
              <MobileList>
                {missingEmail.map((candidate) => (
                  <MobileList.Row
                    key={candidate.subjectId}
                    static
                    title={candidate.name}
                    subtitle={candidate.reference}
                  />
                ))}
              </MobileList>
            </div>
          ) : null}

          {alreadyOn.length > 0 ? (
            <p className="text-muted-foreground">
              {alreadyOn.length} already {alreadyOn.length === 1 ? "has" : "have"} a
              portal account and will be left alone.
            </p>
          ) : null}
        </div>
      )}
    </RecordDialog>
  );
}
