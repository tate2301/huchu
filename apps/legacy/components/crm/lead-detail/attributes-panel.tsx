"use client";

import { Badge } from "@corelithzw/ui/components/badge";
import { ClientDate } from "@corelithzw/ui/components/client-date";

import { CRM_CHANNEL_LABELS } from "@/components/crm/leads/stage-config";
import type { LeadDetail } from "./lead-types";

/**
 * The facts about a lead that are not properties.
 *
 * Value, likelihood, company, contact, phone, email, owner and source all moved
 * to the property list at the top of the page, where a reader meets them on the
 * way in. This panel used to carry its own editable copy of every one of them —
 * its own Row/EditableText, its own PATCH mutation, its own right-aligned
 * layout — so a lead had two places to change the same field and they agreed
 * only by luck. Whichever one somebody happened to use, the other went stale on
 * screen until the page refetched.
 *
 * What is left is the residue: things nobody edits from here. The currency and
 * the channel are set when the lead is created, the services come off the
 * quote, the campaign comes off the link that brought them in, the lost reason
 * is written by the stage change that closed it, and the two dates are the
 * record's own. Read-only is the honest shape for all of them.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <dt className="w-28 shrink-0 pt-0.5 text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-start justify-end gap-1 text-right text-sm">
        <span className="min-w-0 break-words">{children}</span>
      </dd>
    </div>
  );
}

export function AttributesPanel({ lead }: { lead: LeadDetail }) {
  return (
    <dl className="divide-y divide-[var(--border)]">
      {/* Beside the Value row above, which prints the amount with this symbol
          already applied. Kept because a lead priced in a second currency is
          the one somebody needs to be told about explicitly. */}
      <Row label="Currency">
        <span className="font-mono">{lead.currency}</span>
      </Row>

      <Row label="Services">
        {lead.services.length > 0 ? (
          <span className="flex flex-wrap justify-end gap-1">
            {lead.services.map((service) => (
              <Badge key={service} variant="secondary">
                {service}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </Row>

      <Row label="Channel">
        <span className="text-[var(--text-muted)]">
          {CRM_CHANNEL_LABELS[lead.sourceChannel ?? ""] ?? lead.sourceChannel ?? "—"}
        </span>
      </Row>

      {lead.utmSource || lead.utmCampaign ? (
        <Row label="Campaign">
          <span className="text-[var(--text-muted)]">
            {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}
          </span>
        </Row>
      ) : null}

      {lead.lostReason ? (
        <Row label="Lost because">
          <span className="text-[var(--status-error-text)]">{lead.lostReason}</span>
        </Row>
      ) : null}

      <Row label="Created">
        <span className="text-[var(--text-muted)]">
          <ClientDate value={lead.createdAt} mode="date" />
        </span>
      </Row>
      <Row label="Updated">
        <span className="text-[var(--text-muted)]">
          <ClientDate value={lead.updatedAt} />
        </span>
      </Row>
    </dl>
  );
}
