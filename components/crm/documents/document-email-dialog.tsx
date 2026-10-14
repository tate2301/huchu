"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Alert } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { VaneMark } from "@/components/core/vane-mark";
import { useVaneStatus } from "@/components/vane/use-vane";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { DocumentEmailDraft } from "@/lib/crm/document-email";

import type { LeadDocument } from "./document-types";

export type DocumentEmail = { subject: string; message: string };

const LABEL: Record<string, string> = { QUOTATION: "quote", INVOICE: "invoice", RECEIPT: "receipt" };

/**
 * "Email to the client": the email as it would go, to read and change before
 * it is sent. The subject and the note are the rep's to write; the PDF and
 * the link to review the document always go with it, so the dialog says so
 * rather than showing them as text that could be edited away.
 */
export function DocumentEmailDialog({
  basePath,
  doc,
  sending,
  onOpenChange,
  onSend,
}: {
  basePath: string;
  /** The document being sent; the dialog is open while it is set. */
  doc: LeadDocument | null;
  sending: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (doc: LeadDocument, email: DocumentEmail) => void;
}) {
  const draft = useQuery({
    queryKey: ["crm", "documents", "email-draft", doc?.id],
    queryFn: () => fetchJson<DocumentEmailDraft>(`${basePath}/documents/${doc!.id}/email`),
    enabled: Boolean(doc),
    staleTime: 0,
  });
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  // Vane writes the note when asked, for people Vane is open to; what it wrote stays theirs to change.
  const vane = useVaneStatus();
  const [vaneWrote, setVaneWrote] = useState(false);
  const write = useMutation({
    mutationFn: () => fetchJson<DocumentEmail>("/api/vane/write/document-email", { method: "POST", body: JSON.stringify({ documentId: doc!.id }) }),
    onSuccess: (email) => {
      setSubject(email.subject);
      setMessage(email.message);
      setVaneWrote(true);
      setErrors([]);
    },
    onError: (failure) => setErrors([getApiErrorMessage(failure, "Vane could not write it. Write it yourself, or try again.")]),
  });

  // A fresh draft for each document opened; what the rep typed is theirs until then.
  const loaded = draft.data;
  const [shown, setShown] = useState<DocumentEmailDraft | undefined>(undefined);
  if (loaded && loaded !== shown) {
    setShown(loaded);
    setSubject(loaded.subject);
    setMessage(loaded.message);
    setErrors([]);
    setVaneWrote(false);
  }

  const noun = doc ? (LABEL[doc.type] ?? "document") : "document";
  const noAddress = loaded && !loaded.to;

  return (
    <RecordDialog
      open={Boolean(doc)}
      onOpenChange={onOpenChange}
      title={`Email the ${noun} to the client`}
      description={`Read and change the email before it goes. The ${noun} is attached as a PDF, with the link to review it.`}
      size="lg"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!doc || !loaded || noAddress) return;
        const found = [!subject.trim() ? "Write a subject." : null, !message.trim() ? "Write the message." : null].filter(
          (error): error is string => Boolean(error),
        );
        setErrors(found);
        if (found.length === 0) onSend(doc, { subject: subject.trim(), message: message.trim() });
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={sending || !loaded || Boolean(noAddress)}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      {draft.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton height={36} />
          <Skeleton height={160} />
        </div>
      ) : draft.error ? (
        <Alert tone="danger" title="The email could not be drafted">
          {getApiErrorMessage(draft.error)}
        </Alert>
      ) : loaded ? (
        <div className="space-y-4">
          {noAddress ? (
            <Alert tone="warn" title="There is no email address to send it to">
              Add one to the customer or the contact, then send again.
            </Alert>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              To <span className="font-medium text-[var(--text-strong)]">{loaded.to}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="document-email-subject">Subject</Label>
            <Input
              id="document-email-subject"
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="document-email-message" className="flex-1">
                Message
              </Label>
              {vane.data && !vane.data.paused ? (
                <Button type="button" size="sm" variant="outline" disabled={write.isPending || sending} onClick={() => write.mutate()}>
                  <VaneMark size={16} />
                  {write.isPending ? "Vane is writing…" : vaneWrote ? "Write it again" : "Write it with Vane"}
                </Button>
              ) : null}
            </div>
            <Textarea
              id="document-email-message"
              rows={8}
              value={message}
              maxLength={5000}
              disabled={write.isPending}
              onChange={(event) => setMessage(event.target.value)}
            />
            {vaneWrote ? (
              <p className="text-sm text-[var(--text-muted)]">Vane wrote this. Change anything; it goes only when you press Send.</p>
            ) : null}
            <p className="text-sm text-[var(--text-muted)]">
              Under your message: the link to review and answer the {noun}, then any resources you added. The PDF is attached.
            </p>
          </div>
        </div>
      ) : null}
    </RecordDialog>
  );
}
