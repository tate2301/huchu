"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Kit, VaneMark } from "@/components/core";
import { formatMoney } from "@/components/crm/documents/document-types";
import { RailSection } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { QuoteCheck, QuoteLineFinding } from "@/lib/crm/quote-check";

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
}: {
  check: QuoteCheck;
  /** The line being changed now. */
  changing?: number | null;
  onChange: (finding: QuoteLineFinding) => void;
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
      </Kit>
    </RailSection>
  );
}

/** The quote check in a CRM quote's rail, fed from `/api/v2/crm/documents/[id]/price-check`. */
export function VaneQuoteCheck({ documentId }: { documentId: string }) {
  const client = useQueryClient();
  const { toast } = useToast();
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
  if (!data) return null;
  return <VaneQuoteCheckView check={data} changing={change.isPending ? (change.variables?.position ?? null) : null} onChange={(finding) => change.mutate(finding)} />;
}
