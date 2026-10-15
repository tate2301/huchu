"use client";

import * as React from "react";

import { Icon, Kit, VaneMark } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { RailSection } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { VaneActionView } from "@/lib/vane/actions/engine";
import type { VaneCard, VaneSubject } from "@/lib/vane/panel";

import { NotNowMenu } from "./not-now-menu";
import { useDecideAction, useVaneActions, useVaneRecord } from "./use-vane";
import { VaneActionList } from "./vane-action-list";
import type { ActionDecision } from "./vane-panel-view";

/** What a person might ask Vane about the record in front of them. */
const ASK: Record<VaneSubject, string> = {
  CrmDeal: "What should I do next on this deal?",
  CrmLead: "What should I do next with this lead?",
  CrmClient: "What is open with this company?",
  CrmPerson: "When did we last hear from this person, and what is open?",
  SalesInvoice: "Why is this invoice still owed?",
  SalesQuotation: "Check this quote before it goes",
  CrmLeadDocument: "Check this quote before it goes",
  RetailPurchaseOrder: "Is this order late, and what is still owed?",
};

/**
 * Vane's cards about one record, with the actions it proposes on each, and
 * the way to ask it about this record. Pure: the container feeds it.
 */
export function VaneRecordSectionView({
  cards,
  noun,
  deciding = null,
  onAsk,
  onMute,
  onDecide,
}: {
  cards: VaneCard[];
  /** "deal", "lead": what the empty line and the ask button name. */
  noun: string;
  deciding?: string | null;
  onAsk: () => void;
  onMute: (card: VaneCard, reason: string) => void;
  onDecide: (action: VaneActionView, decision: ActionDecision) => void;
}) {
  return (
    <RailSection title="Vane" meta={cards.length > 0 ? cards.length : undefined}>
      <Kit className="vr">
        {cards.length === 0 ? <p className="vr-none">Nothing from Vane on this {noun}.</p> : null}
        {cards.map((card) => (
          <article key={card.id} className={card.kind === "issue" ? "vc is-issue" : "vc"} data-module={card.module} aria-labelledby={`vane-record-${card.id}`}>
            <div className="vc-k">
              <span className="vn-kind">
                <Icon name={card.kind === "issue" ? "issue" : "suggestion"} />
                {card.kind === "issue" ? "Issue" : "Suggestion"}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <NotNowMenu describedBy={`vane-record-${card.id}`} onMute={(reason) => onMute(card, reason)} />
              </span>
            </div>
            <h3 id={`vane-record-${card.id}`}>{card.headline}</h3>
            <p>{card.body}</p>
            <VaneActionList actions={card.actions} deciding={deciding} onDecide={onDecide} />
          </article>
        ))}
        <button type="button" className="vr-ask" onClick={onAsk}>
          <VaneMark size={16} />
          <span>Ask Vane about this {noun}</span>
        </button>
      </Kit>
    </RailSection>
  );
}

/**
 * The Vane section of a record page's rail (a deal's, a lead's, a company's):
 * the open cards Vane raised about this record, decided where they stand, and
 * "Ask Vane about this deal", which opens the panel with a question in its
 * box. Nothing for a person Vane is not open to.
 */
export function VaneRecordSection({ type, id, noun }: { type: VaneSubject; id: string | null; noun: string }) {
  const shell = useShell();
  const { toast } = useToast();
  const { data, isError } = useVaneRecord(type, id);
  const { notNow } = useVaneActions();
  const decide = useDecideAction();
  if (isError || !data) return null;
  // On a quote, the message Vane wrote to go with it is in the quote check, beside Send the quote, not again here.
  const quote = type === "CrmLeadDocument" || type === "SalesQuotation";
  return (
    <VaneRecordSectionView
      cards={quote ? data.filter((card) => card.action?.type !== "send") : data}
      noun={noun}
      deciding={decide.isPending ? (decide.variables?.id ?? null) : null}
      onAsk={() => shell.askVane(ASK[type])}
      onMute={(card, reason) => notNow.mutate({ id: card.id, reason })}
      onDecide={(action, decision) =>
        decide.mutate(
          { id: action.id, ...decision },
          {
            onError: (failure) =>
              toast({
                title: decision.approve ? "That did not happen" : "Not recorded",
                description: getApiErrorMessage(failure, "Check the connection and try again."),
                variant: "destructive",
              }),
          },
        )
      }
    />
  );
}
