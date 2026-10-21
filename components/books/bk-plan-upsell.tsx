"use client";

import { ButtonLink, Icon, type IconName } from "@/components/core";

import { BkFinding, BkPage } from "./ui";

/** Management → Apps → Billing, where the owner adds Books or moves plan. */
export const ADD_BOOKS_HREF = "/preferences/organization/billing";
/** Management → Company → Accountant export: free, so the figures are never held back. */
export const ACCOUNTANT_EXPORT_HREF = "/management/accountant-export";

export type PlanUpsellFacts = {
  finding: { fact: string; rest: string };
  /** The owner adds Books or moves plan; everyone else asks the owner. */
  canAdd: boolean;
};

type Row = { icon: IconName; what: string; detail: string };

/**
 * What the $10 screens add (bk-x-noscreens), on the owner's line of 20 Oct
 * (design/books/NOTES.md §1): selling, buying, paying and staff money are
 * free, so the rows name what is accounting.
 */
const SCREENS: Row[] = [
  { icon: "done", what: "Money, the overview", detail: "What came in, what went out and what needs you, on one page" },
  { icon: "done", what: "All spending, and who owes what by age", detail: "Every payment out from every module, and debtors and creditors by age" },
  { icon: "done", what: "Bank matching", detail: "Upload a statement; Vane proposes matches; reconcile each account" },
  { icon: "done", what: "Saved views and bulk actions", detail: "Keep a list as you filtered it; void or pay many at once" },
  { icon: "done", what: "Numbering, tax codes and locks", detail: "Your number series, the tax rules and when a month locks" },
];

/** What the $99 plan adds (bk-x-advanced). */
const ADVANCED: Row[] = [
  { icon: "lock", what: "Tax", detail: "VAT 7 returns with the working schedule, withholding, provisional tax and the fiscal register" },
  { icon: "lock", what: "Close the month", detail: "The checklist, posting failures and month-end revaluation" },
  { icon: "lock", what: "Ledger", detail: "Journals, trial balance, statements, chart of accounts and the audit trail" },
];

/**
 * A paid Books address in a workspace without that plan: the books' own
 * figures from the core, what the plan adds, Add Books or Move to the $99 plan
 * for the owner (everyone else asks the owner), and the accountant export.
 */
export function BkPlanUpsell({ tier, facts }: { tier: "screens" | "advanced"; facts: PlanUpsellFacts }) {
  const rows = tier === "screens" ? SCREENS : ADVANCED;
  return (
    <BkPage screen={tier === "screens" ? "x-noscreens" : "x-advanced"} scroll={false}>
      <div className="k-ns">
        <BkFinding fact={facts.finding.fact} rest={facts.finding.rest} />
        <div className="k-tray" style={{ margin: 0 }}>
          {rows.map((row) => (
            <div className="k-nsr" key={row.what}>
              <Icon name={row.icon} />
              <span>
                <b>{row.what}</b>
                <span>{row.detail}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="k-nsa">
          {facts.canAdd ? (
            <ButtonLink href={ADD_BOOKS_HREF} variant="primary" icon={tier === "screens" ? "plus" : "arrow"} shortcut="Enter">
              {tier === "screens" ? "Add Books, $10 a month" : "Move to the $99 plan"}
            </ButtonLink>
          ) : null}
          <ButtonLink href={ACCOUNTANT_EXPORT_HREF} icon="export">
            Accountant export
          </ButtonLink>
        </div>
        <p className="k-nsp">
          {facts.canAdd
            ? tier === "screens"
              ? "Tax, Close the month and the Ledger come with the $99 plan. Nothing is lost by waiting. Add Books later and every document, posting and balance is there, back to the first day."
              : "The figures are never held back: the accountant export has the VAT working schedule on every plan."
            : tier === "screens"
              ? "Ask your owner to add Books."
              : "Ask your owner to move to the $99 plan."}
        </p>
      </div>
    </BkPage>
  );
}
