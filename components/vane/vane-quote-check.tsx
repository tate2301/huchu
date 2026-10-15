"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, ButtonLink, Kit, TextArea, VaneMark } from "@/components/core";
import { formatMoney } from "@/components/crm/documents/document-types";
import { RailSection } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { QuoteCheck, QuoteLineFinding } from "@/lib/crm/quote-check";
import type { DocumentEmailDraft } from "@/lib/crm/document-email";

import { useVaneStatus } from "./use-vane";

/**
 * The message to go with the quote, under the check (PageVaneDocument): the
 * words Vane wrote (its card about the quote, or "Write it with Vane" here),
 * else the CRM's own, for the person to change. Send the quote is the CRM's
 * email, pressed by the person; Vane sends nothing.
 */
export type QuoteMessage = {
  /** Who it goes to, as the send would address it; null when the record has no address. */
  to: string | null;
  text: string;
  /** Vane wrote the words now in the box. */
  byVane: boolean;
  pdfHref: string;
  sending: boolean;
  writing: boolean;
  /** Why Vane wrote nothing, when it could not. */
  failed: string | null;
  onText: (text: string) => void;
  onSend: () => void;
  /** Offered while Vane works and has not written these words. */
  onWrite?: () => void;
};

const day = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** "$46.50 a roll here; the price list says $49.80 since 1 October." */
function findingWords(finding: QuoteLineFinding, currency: string) {
  const per = finding.unit ? ` a ${finding.unit}` : "";
  const since = finding.since ? ` since ${day(finding.since)}` : "";
  return `${formatMoney(finding.quoted, currency)}${per} here; the price list says ${formatMoney(finding.listed, currency)}${since}.`;
}

/**
 * The quote checked against the price list (the PageVaneDocument board), in
 * the quote's rail: each line priced differently from the list, with Leave
 * it and Change the line, and how many lines match. Pure: the container feeds it.
 */
export function VaneQuoteCheckView({
  check,
  changing = null,
  onChange,
  message = null,
}: {
  check: QuoteCheck;
  /** The line being changed now. */
  changing?: number | null;
  onChange: (finding: QuoteLineFinding) => void;
  message?: QuoteMessage | null;
}) {
  const [left, setLeft] = React.useState<number[]>([]);
  const open = check.findings.filter((finding) => !left.includes(finding.position));
  const matching = check.checked - check.findings.length;

  return (
    <RailSection title="Checked by Vane">
      <Kit className="vr">
        {check.checked === 0 ? (
          <p className="vr-none">No line on this quote is from the price list, so there is nothing to check it against.</p>
        ) : null}
        {open.map((finding) => (
          <article key={finding.position} className="vc is-issue" aria-labelledby={`vane-line-${finding.position}`}>
            <h3 id={`vane-line-${finding.position}`}>
              {finding.description} is {finding.quoted < finding.listed ? "under" : "over"} the price list
            </h3>
            <p>{findingWords(finding, check.currency)}</p>
            <div className="vc-a" style={{ marginTop: "var(--space-4)" }}>
              <Button
                size="sm"
                icon="pen"
                busy={changing === finding.position}
                disabled={Boolean(check.editLock) || (changing !== null && changing !== finding.position)}
                title={check.editLock ?? undefined}
                aria-describedby={`vane-line-${finding.position}`}
                onClick={() => onChange(finding)}
              >
                Change the line
              </Button>
              <Button
                size="sm"
                variant="quiet"
                aria-describedby={`vane-line-${finding.position}`}
                onClick={() => setLeft((rows) => [...rows, finding.position])}
              >
                Leave it
              </Button>
            </div>
            {check.editLock ? <p className="vr-none">{check.editLock}</p> : null}
          </article>
        ))}
        {check.checked > 0 ? (
          <p className="vr-none" style={{ display: "flex", gap: "var(--space-8)", alignItems: "center" }}>
            <VaneMark size={16} />
            <span>
              {open.length === 0 && check.findings.length === 0
                ? `All ${check.checked} ${check.checked === 1 ? "line matches" : "lines match"} the price list.`
                : `${matching === 1 ? "The other line matches" : `The other ${matching} lines match`} the price list.`}
              {check.unpriced > 0 ? ` ${check.unpriced === 1 ? "1 line" : `${check.unpriced} lines`} typed by hand ${check.unpriced === 1 ? "was" : "were"} not checked.` : ""}
            </span>
          </p>
        ) : null}
        {message ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)", marginTop: "var(--space-12)" }}>
            <label htmlFor="vane-quote-message" className="sec-title">
              {message.to ? `The message, to ${message.to} by email` : "The message"}
            </label>
            <TextArea id="vane-quote-message" rows={6} value={message.text} disabled={message.sending} onChange={(event) => message.onText(event.target.value)} />
            {message.byVane ? <span className="vr-none">Vane wrote this. Change anything; it goes only when you press Send.</span> : null}
            {message.failed ? (
              <span role="alert" className="vr-none" style={{ color: "var(--color-danger)" }}>
                {message.failed}
              </span>
            ) : null}
            {message.to ? null : <span className="vr-none">Add the customer’s email address to send it.</span>}
            <div className="vc-a">
              {message.onWrite ? (
                <Button size="sm" variant="quiet" busy={message.writing} disabled={message.sending} onClick={message.onWrite}>
                  <VaneMark size={16} />
                  Write it with Vane
                </Button>
              ) : null}
              <ButtonLink icon="file" href={message.pdfHref} target="_blank" rel="noopener">
                Download PDF
              </ButtonLink>
              <Button
                variant="primary"
                icon="send"
                shortcut="S"
                busy={message.sending}
                disabled={message.sending || !message.to || !message.text.trim()}
                onClick={message.onSend}
              >
                Send the quote
              </Button>
            </div>
          </div>
        ) : null}
      </Kit>
    </RailSection>
  );
}

/** The quote check in a CRM quote's rail, fed from `/api/v2/crm/documents/[id]/price-check`, with the message to send it with. */
export function VaneQuoteCheck({ documentId }: { documentId: string }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const vane = useVaneStatus();
  const key = ["crm", "documents", "price-check", documentId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<QuoteCheck>(`/api/v2/crm/documents/${documentId}/price-check`),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (finding: QuoteLineFinding) =>
      fetchJson<QuoteLineFinding>(`/api/v2/crm/documents/${documentId}/price-check`, {
        method: "POST",
        body: JSON.stringify({ position: finding.position }),
      }),
    onSuccess: (finding) =>
      toast({ title: `${finding.description} is now ${formatMoney(finding.listed, data?.currency ?? "")}${finding.unit ? ` a ${finding.unit}` : ""}.` }),
    onError: (failure) =>
      toast({ title: "The line was not changed", description: getApiErrorMessage(failure, "Try again."), variant: "destructive" }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["crm", "documents", "record", documentId] });
    },
  });

  // The CRM's own email for the quote (main's draft and send): who it goes to and its subject. A person who may not
  // send documents gets a refusal, and the message is not offered to them.
  const emailHref = data ? `${data.basePath}/documents/${documentId}/email` : null;
  const draft = useQuery({
    queryKey: ["crm", "documents", "email", documentId],
    queryFn: () => fetchJson<DocumentEmailDraft>(emailHref!),
    enabled: Boolean(emailHref),
    retry: false,
  });
  const [words, setWords] = React.useState<{ subject?: string; text: string; byVane: boolean } | null>(null);
  const write = useMutation({
    mutationFn: () => fetchJson<{ subject: string; message: string }>("/api/vane/write/document-email", { method: "POST", body: JSON.stringify({ documentId }) }),
    // Each writing is a job counted against the month's allowance: a failure is said, not tried again unasked.
    retry: false,
    onSuccess: (email) => setWords({ subject: email.subject, text: email.message, byVane: true }),
  });
  const card = data?.message ?? null;
  const shown = words ?? (card ? { text: card.text, byVane: true } : draft.data ? { text: draft.data.message, byVane: false } : null);
  const send = useMutation({
    mutationFn: () =>
      fetchJson<{ to: string }>(emailHref!, {
        method: "POST",
        body: JSON.stringify({
          subject: words?.subject ?? draft.data?.subject,
          message: shown!.text.trim(),
          // Vane's card about the quote is done once the person sends its words, changed or not.
          ...(card ? { vaneItemId: card.itemId } : {}),
        }),
      }),
    retry: false,
    onSuccess: (sent) => {
      setWords(null);
      toast({ title: `The quote went to ${sent.to}` });
    },
    onError: (failure) => toast({ title: "The quote did not go", description: getApiErrorMessage(failure, "Try again."), variant: "destructive" }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["crm", "documents", "record", documentId] });
      void client.invalidateQueries({ queryKey: ["vane"] });
    },
  });
  if (!data) return null;
  const message: QuoteMessage | null =
    draft.data && shown
      ? {
          to: draft.data.to,
          text: shown.text,
          byVane: shown.byVane,
          pdfHref: `${data.basePath}/documents/${documentId}/pdf`,
          sending: send.isPending,
          writing: write.isPending,
          failed: write.error ? getApiErrorMessage(write.error, "Vane could not write it. Write it yourself, or try again.") : null,
          // Changed, the words are still the ones Vane wrote, now the person's.
          onText: (text) => setWords((current) => ({ subject: current?.subject, text, byVane: shown.byVane })),
          onSend: () => (send.isPending ? undefined : send.mutate()),
          onWrite: vane.data && !vane.data.paused && !shown.byVane ? () => write.mutate() : undefined,
        }
      : null;
  return (
    <VaneQuoteCheckView
      check={data}
      changing={change.isPending ? (change.variables?.position ?? null) : null}
      onChange={(finding) => change.mutate(finding)}
      message={message}
    />
  );
}
