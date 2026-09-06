"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button } from "@corelithzw/react";

import { Label } from "@corelithzw/ui/components/label";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

/**
 * Writing to a set of families the screen has already named.
 *
 * Three oversight boards end at the same wall: the arrears list names 188
 * families and cannot reach one of them, the meetings board releases a slot and
 * tells you to ring the parent yourself, and the homework board shows four of
 * thirty-one handed in with nothing to do about it. The school already reaches
 * every parent's portal in one send; what was missing was a way to address that
 * send to a shortlist rather than a year group.
 *
 * So the audience is fixed by the caller and stated in the dialog rather than
 * chosen in it. A screen that has worked out exactly who to write to should not
 * then ask the office to work it out again from a dropdown — that is how a
 * reminder meant for six families goes to a whole form.
 */

export type NoticeAudienceSpec = {
  /** The pupils whose guardians receive it. Empty means the whole class or school. */
  studentIds?: string[];
  /** Narrow to one year group, when there is no pupil shortlist. */
  classId?: string | null;
  /** Said in the dialog, verbatim: "the families of the 188 in arrears". */
  describe: string;
};

type SendResult = { id: string; recipients: number; withoutAccount: number };

export function SendNoticeDialog({
  open,
  onOpenChange,
  title,
  audience,
  defaultSubject,
  defaultBody,
  severity = "INFO",
  sendLabel = "Send the notice",
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's own heading — "Remind the 188", "Tell the family". */
  title: string;
  audience: NoticeAudienceSpec;
  defaultSubject: string;
  defaultBody: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  sendLabel?: string;
  /** Called once the notice has actually landed, with how far it got. */
  onSent?: (result: SendResult) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  // Reset during render, not in an effect: reopening the dialog for a different
  // set of families with the last one's wording still in the box is how the
  // wrong letter gets sent.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSubject(defaultSubject);
      setBody(defaultBody);
    }
  }

  const send = useMutation({
    mutationFn: () =>
      fetchJson<SendResult>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: subject.trim(),
          body: body.trim(),
          audience: "PARENTS",
          classId: audience.classId ?? null,
          ...(audience.studentIds?.length
            ? { studentIds: audience.studentIds }
            : {}),
          severity,
        }),
      }),
    onSuccess: (result) => {
      onSent?.(result);
      onOpenChange(false);
    },
  });

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) send.reset();
        onOpenChange(next);
      }}
      title={title}
      description={`This goes to ${audience.describe}. It lands in the parent portal and cannot be recalled.`}
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend && !send.isPending) send.mutate();
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSend} loading={send.isPending}>
            {sendLabel}
          </Button>
        </div>
      }
    >
      {send.error ? (
        <Alert tone="danger" title="The notice was not sent">
          {getApiErrorMessage(send.error)}
        </Alert>
      ) : null}

      <Alert tone="info" title="Who this reaches">
        {audience.describe}. Families the school has never invited to the portal
        have nowhere to receive it; the count after sending says how many.
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="notice-subject">Subject</Label>
        <Input
          id="notice-subject"
          value={subject}
          maxLength={160}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notice-body">The notice</Label>
        <Textarea
          id="notice-body"
          rows={7}
          value={body}
          maxLength={4000}
          onChange={(event) => setBody(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Written once and read by every family on the list, so it says what is
          owed or what has changed — never a name.
        </p>
      </div>
    </RecordDialog>
  );
}
