"use client";

import { useMemo } from "react";

import { ReportPanel } from "@/components/ui/breakdown-panel";
import { ReportTable, dim, nm, txt, type ReportRow } from "@/components/accounting/report-table";
import { formatAccountingSourceType } from "@/lib/accounting/source-types";
import type { PostingRuleLineRecord, PostingRuleRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A posting rule, explained as two steps.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * The rule library was a flat eight-column table: priority, source, name,
 * scope, mode, line count, status, actions. Every column was a property of the
 * rule and not one of them answered the question somebody opens this page
 * with, which is always the same question — *when a sale happens, what hits
 * the ledger?* You could read that table all afternoon and still not know,
 * because the two halves of a rule (what triggers it, what it posts) were
 * behind an Edit button, in a form, in the order the database stores them.
 *
 * So the rule is stated as a sentence and a journal:
 *
 *   STEP 1 — When this happens: a RETAIL_SALE arrives, at any site, paid by
 *            CASH.
 *   STEP 2 — It posts this: two lines, debit and credit, with the totals
 *            proving they agree.
 *
 * Nothing here is new data. It is the same record read in the order a person
 * reasons about it rather than the order it was stored in.
 */

const FIELD_PHRASE: Record<string, string> = {
  SITE_ID: "the site is",
  REGISTER_CODE: "the register is",
  TENDER_TYPE: "it is paid by",
  CURRENCY: "the currency is",
  CUSTOMER_TAX_CATEGORY_ID: "the customer's tax category is",
  VENDOR_TAX_CATEGORY_ID: "the vendor's tax category is",
  SALE_TYPE: "the sale type is",
  MOVEMENT_TYPE: "the movement type is",
};

const OPERATOR_PHRASE: Record<string, string> = {
  EQ: "is",
  NEQ: "is not",
  IN: "is one of",
  NOT_IN: "is none of",
  EXISTS: "is set",
  NOT_EXISTS: "is not set",
};

type Token = { kind: "plain" | "chip" | "code"; text: string };

/**
 * The trigger, as an English sentence with the machine values left as chips.
 *
 * Values stay in their own chips rather than being folded into the prose,
 * because they are the parts a reader checks against a real transaction —
 * `CASH`, `HQ-01` — and prose that swallows them makes that check harder, not
 * easier.
 */
function triggerTokens(rule: PostingRuleRecord): Token[] {
  const tokens: Token[] = [
    { kind: "plain", text: "A" },
    { kind: "code", text: formatAccountingSourceType(rule.sourceType) },
    { kind: "plain", text: "arrives" },
  ];

  const conditions = rule.conditions ?? [];
  if (conditions.length === 0) {
    tokens.push({
      kind: "plain",
      text: rule.isFallback
        ? "— and nothing more specific matched it."
        : "— whatever the details.",
    });
    return tokens;
  }

  conditions.forEach((condition, index) => {
    tokens.push({ kind: "plain", text: index === 0 ? ", and" : ", and" });

    if (condition.operator === "EXISTS" || condition.operator === "NOT_EXISTS") {
      tokens.push({
        kind: "plain",
        text: `${FIELD_PHRASE[condition.field] ?? condition.field} ${
          OPERATOR_PHRASE[condition.operator]
        }`,
      });
      return;
    }

    const phrase = FIELD_PHRASE[condition.field] ?? condition.field;
    // `EQ` reads naturally inside the field phrase ("it is paid by CASH");
    // anything else has to say the operator out loud or the sentence lies.
    tokens.push({
      kind: "plain",
      text:
        condition.operator === "EQ" ? phrase : `${phrase} ${OPERATOR_PHRASE[condition.operator]}`,
    });

    const values = parseValues(condition.valueString, condition.valueListJson);
    if (values.length === 0) {
      tokens.push({ kind: "plain", text: "anything" });
      return;
    }
    values.forEach((value, valueIndex) => {
      if (valueIndex > 0) tokens.push({ kind: "plain", text: "or" });
      tokens.push({ kind: "chip", text: value });
    });
  });

  tokens.push({ kind: "plain", text: "." });
  return tokens;
}

function parseValues(valueString?: string | null, valueListJson?: string | null): string[] {
  if (valueListJson) {
    try {
      const parsed = JSON.parse(valueListJson);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // A malformed list is data we cannot read, not a crash. Fall through to
      // the single value so the rest of the sentence still renders.
    }
  }
  return valueString ? [valueString] : [];
}

/** What a line posts, in words rather than enum names. */
function lineBasis(line: PostingRuleLineRecord) {
  const basis = line.basis.toLowerCase();
  if (line.allocationType === "PERCENT" && line.allocationValue != null) {
    return `${line.allocationValue}% of ${basis}`;
  }
  if (line.allocationType === "FIXED" && line.allocationValue != null) {
    return `fixed ${line.allocationValue}`;
  }
  return `the ${basis}`;
}

export function PostingRuleExplainer({
  rule,
  accountsById,
  onEdit,
}: {
  rule: PostingRuleRecord;
  accountsById: Map<string, { code: string; name: string }>;
  onEdit: () => void;
}) {
  const tokens = useMemo(() => triggerTokens(rule), [rule]);

  const { debitRows, creditRows, debitCount, creditCount } = useMemo(() => {
    const debits: ReportRow[] = [];
    const credits: ReportRow[] = [];

    for (const line of rule.lines) {
      const account = line.accountId ? accountsById.get(line.accountId) : undefined;
      const accountLabel =
        line.accountSource === "TENDER_MAPPING"
          ? "Whichever account the tender maps to"
          : account
            ? `${account.code} · ${account.name}`
            : "No account set";

      const row: ReportRow = {
        id: line.id,
        cells: [
          nm(accountLabel, { tone: account || line.accountSource === "TENDER_MAPPING" ? "strong" : "bad" }),
          txt(lineBasis(line), { tone: "subtle" }),
          line.memoTemplate ? txt(line.memoTemplate, { mono: true, tone: "subtle" }) : dim({ align: "left" }),
        ],
      };
      if (line.direction === "DEBIT") debits.push(row);
      else credits.push(row);
    }

    return {
      debitRows: debits,
      creditRows: credits,
      debitCount: debits.length,
      creditCount: credits.length,
    };
  }, [rule, accountsById]);

  /*
    A rule with debits and no credits (or the reverse) cannot produce a
    balanced journal, and today that is only discovered when a real
    transaction fails to post. Saying it here, next to the lines, is the
    difference between a configuration error found now and one found in the
    integration event log next month.
  */
  const lopsided = rule.lines.length > 0 && (debitCount === 0 || creditCount === 0);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {/*
        The step numbers are load-bearing, not decoration.

        A rule is two things in a fixed order — what sets it off, then what it
        posts — and numbering them is what tells a first-time reader that the
        second panel is the consequence of the first rather than a second
        unrelated set of properties. Without them these read as two cards that
        happen to be stacked.
      */}
      <ReportPanel
        title="When this happens"
        lead={<StepChip n={1} />}
        note={
          <button
            type="button"
            onClick={onEdit}
            className="font-semibold text-[var(--brand-strong)] hover:underline"
          >
            Edit
          </button>
        }
      >
        <div className="px-[15px] py-[13px]">
          <p className="text-base leading-[2.1] text-[var(--text-body)]">
            {tokens.map((token, index) => {
              if (token.kind === "plain") {
                return (
                  <span key={index} className="text-[var(--text-muted)]">
                    {token.text}{" "}
                  </span>
                );
              }
              return (
                <span
                  key={index}
                  className={cn(
                    "mx-px inline-flex h-6 items-center rounded-[var(--radius-sm)] border px-2 align-middle text-sm font-semibold",
                    token.kind === "code"
                      ? "border-[var(--brand-100)] bg-[var(--brand-soft)] font-mono text-[var(--brand-strong)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-strong)]",
                  )}
                >
                  {token.text}
                </span>
              );
            })}
          </p>
        </div>
      </ReportPanel>

      <ReportPanel
        title="It posts this"
        lead={<StepChip n={2} />}
        note={`${rule.lines.length} line${rule.lines.length === 1 ? "" : "s"}`}
      >
        {rule.lines.length === 0 ? (
          <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">
            This rule posts nothing. Add at least one debit and one credit line before it can be
            used.
          </p>
        ) : (
          <>
            <SideHeading label="Debit" count={debitCount} />
            <ReportTable
              label="Debit lines"
              tracks="minmax(0,1fr) 160px 200px"
              columns={[{ label: "Account" }, { label: "Amount" }, { label: "Memo" }]}
              rows={debitRows}
              emptyLabel="No debit lines — this rule cannot balance."
            />
            <SideHeading label="Credit" count={creditCount} />
            <ReportTable
              label="Credit lines"
              tracks="minmax(0,1fr) 160px 200px"
              columns={[{ label: "Account" }, { label: "Amount" }, { label: "Memo" }]}
              rows={creditRows}
              emptyLabel="No credit lines — this rule cannot balance."
            />
            {lopsided ? (
              <p className="border-t border-[var(--border-subtle)] px-[13px] py-2 text-sm text-[var(--badge-bad-fg)]">
                Every journal needs both sides. As written, this rule would post an unbalanced
                entry and be rejected.
              </p>
            ) : null}
          </>
        )}
      </ReportPanel>

      {rule.isFallback ? (
        <section className="overflow-hidden rounded-[10px] border border-[var(--tone-warn-bd)] bg-[var(--badge-warn-bg)]">
          <header className="flex h-9 items-center gap-2 border-b border-[var(--tone-warn-bd)] px-[13px]">
            <h2 className="text-sm font-bold text-[var(--badge-warn-fg)]">If nothing matches</h2>
          </header>
          <p className="px-[13px] py-2.5 text-sm text-[var(--badge-warn-fg)]">
            This is the fallback for {formatAccountingSourceType(rule.sourceType)}. Anything that
            matches no other rule posts here, which is what keeps a transaction from being stranded
            — and also what makes a wrong account on this rule quiet rather than loud.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/** A side label between the two halves of the journal. */
function SideHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--canvas)] px-[13px] py-1">
      <span className="text-sm font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="font-mono text-sm text-[var(--text-subtle)]">{count}</span>
    </div>
  );
}

/** The step number, in the brand tint — 19px tall, so it sits inside a 36px
 *  panel head without growing it. */
function StepChip({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[19px] shrink-0 items-center rounded-[4px] bg-[var(--brand-soft)] px-[7px] text-[10px] font-bold tracking-[0.06em] text-[var(--brand-strong)]">
      STEP {n}
    </span>
  );
}
