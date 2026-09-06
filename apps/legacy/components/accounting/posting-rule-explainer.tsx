"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ReportPanel } from "@corelithzw/ui/components/breakdown-panel";
import {
  ReportTable,
  amt,
  node,
  total,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { formatAmount, formatHeadline } from "@/lib/accounting/format";
import { formatAccountingSourceType } from "@/lib/accounting/source-types";
import { CheckCircle2 } from "@corelithzw/ui/lib/icons";
import {
  previewPostingRule,
  type PostingRuleLineRecord,
  type PostingRuleRecord,
  type PostingSimulationLine,
} from "@/lib/api";
import { cn } from "@corelithzw/ui/lib/utils";

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
 * Every distinct payload path the rule's lines read their figure from.
 *
 * One path is the ordinary case and the one worth saying out loud, because it
 * is the field somebody checks against a real event when a rule posts a number
 * they did not expect. A rule whose lines read different paths has no single
 * answer, so the sentence says nothing rather than naming one of them and
 * letting the reader assume it governs the rest.
 */
function valuePaths(rule: PostingRuleRecord): string[] {
  const paths = new Set<string>();
  for (const line of rule.lines) {
    const path = line.valuePath?.trim();
    if (path) paths.add(path);
  }
  return Array.from(paths);
}

/**
 * The trigger, as an English sentence with the machine values left as chips.
 *
 * Values stay in their own chips rather than being folded into the prose,
 * because they are the parts a reader checks against a real transaction —
 * `CASH`, `HQ-01` — and prose that swallows them makes that check harder, not
 * easier.
 *
 * Two kinds of chip, and the difference matters: a plain chip is a value a
 * person would recognise on a receipt, a code chip is a path into the event's
 * payload. The source type reads as the former ("A Retail Sale arrives"), so
 * the mono brand chip is left to `payload` paths, which are the only thing on
 * this page a reader would ever have to type somewhere else.
 */
function triggerTokens(rule: PostingRuleRecord): Token[] {
  const tokens: Token[] = [
    { kind: "plain", text: "A" },
    { kind: "chip", text: formatAccountingSourceType(rule.sourceType) },
    { kind: "plain", text: "arrives" },
  ];

  const conditions = rule.conditions ?? [];
  if (conditions.length === 0) {
    tokens.push({
      kind: "plain",
      text: rule.isFallback
        ? "— and nothing more specific matched it"
        : "— whatever the details",
    });
  } else {
    conditions.forEach((condition) => {
      tokens.push({ kind: "plain", text: ", and" });

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
  }

  const paths = valuePaths(rule);
  if (paths.length === 1) {
    tokens.push({ kind: "plain", text: "— and the figure comes from" });
    tokens.push({ kind: "code", text: paths[0] });
  }

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

/**
 * The amounts the panel offers to try the rule on.
 *
 * Four of them, spanning three orders of magnitude, because what a reader is
 * checking is not one figure but whether the split behaves: a percentage
 * allocation that looks obviously right on $100 is the same arithmetic that
 * has to land on sensible cents at $12,800.
 */
const TRY_AMOUNTS = [100, 500, 2400, 12800];

type PreviewContext = Parameters<typeof previewPostingRule>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The sample event to run the rule against, assembled from the rule's own
 * conditions rather than from a blank one.
 *
 * The preview endpoint runs the whole matcher, not just this rule, and it is
 * the conditions that decide which rule wins. Send an event that names no
 * tender to a CASH-only rule and a different rule answers — so the sentence in
 * Step 1 is exactly the specification for the event built here.
 *
 * Only `EQ` and `IN` can be turned into an event this way: they say what the
 * value *is*. "is not CASH" and "is one of none of these" name a whole space of
 * values, and picking a representative out of it would be this panel inventing
 * the transaction rather than deriving it.
 */
function previewContext(rule: PostingRuleRecord, amount: number): PreviewContext {
  const context: PreviewContext = {
    sourceType: rule.sourceType,
    sourceId: "preview",
    description: `Preview — ${rule.name}`,
    amount,
  };
  const payload: Record<string, unknown> = {};

  for (const condition of rule.conditions ?? []) {
    if (condition.operator !== "EQ" && condition.operator !== "IN") continue;
    const value = parseValues(condition.valueString, condition.valueListJson)[0];
    if (!value) continue;

    switch (condition.field) {
      // The API validates this one as a uuid, so a scope pinned to a site by
      // some other kind of key is left off rather than failing the whole call.
      case "SITE_ID":
        if (UUID.test(value)) context.siteId = value;
        break;
      case "REGISTER_CODE":
        context.registerCode = value;
        break;
      case "CURRENCY":
        context.currency = value;
        break;
      case "TENDER_TYPE":
        context.payments = [{ tenderType: value, amount }];
        break;
      case "SALE_TYPE":
        payload.saleType = value;
        break;
      case "MOVEMENT_TYPE":
        payload.movementType = value;
        break;
      case "CUSTOMER_TAX_CATEGORY_ID":
        payload.customerTaxCategoryId = value;
        break;
      case "VENDOR_TAX_CATEGORY_ID":
        payload.vendorTaxCategoryId = value;
        break;
    }
  }

  if (Object.keys(payload).length > 0) context.payload = payload;
  return context;
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
  const [tryAmount, setTryAmount] = useState(TRY_AMOUNTS[0]);

  /*
    The figures in Step 2 come from the posting engine, not from arithmetic
    repeated here.

    A rule's lines say "the tax" and "86.96% of it"; turning that into dollars
    means resolving a basis, applying an allocation, expanding a tender-mapped
    line into one line per tender and dropping the zero ones — all of which
    `previewPostingFromSource` already does, and all of which would drift the
    moment either copy changed. A second implementation that agrees today is a
    panel that lies quietly next year, so this asks the engine what it would
    post and prints the answer. Nothing is written: the endpoint simulates.
  */
  const preview = useQuery({
    queryKey: ["accounting", "posting-rules", rule.id, "preview", tryAmount],
    queryFn: () => previewPostingRule(previewContext(rule, tryAmount)),
    enabled: rule.lines.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  /*
    Only the engine's answer for *this* rule is shown as this rule's journal.
    The preview runs the whole matcher, so a rule sitting behind a
    higher-priority sibling comes back with the sibling's lines — printing
    those under this rule's heading would be a quiet lie about which rule
    fired, and it is the one fact somebody debugging a wrong posting needs.
  */
  const chosen = preview.data?.error ? undefined : preview.data?.selectedRule;
  const simulated = chosen?.id === rule.id ? preview.data : null;
  const shadowedBy = chosen && chosen.id !== rule.id ? chosen.name : null;

  const { debitRows, creditRows, debitCount, creditCount } = useMemo(() => {
    const debits: ReportRow[] = [];
    const credits: ReportRow[] = [];

    for (const line of rule.lines) {
      const account = line.accountId ? accountsById.get(line.accountId) : undefined;
      const tenderMapped = line.accountSource === "TENDER_MAPPING";
      const accountName = tenderMapped
        ? "Whichever account the tender maps to"
        : (account?.name ?? "No account set");
      // The code and the memo template are both machine strings a person reads
      // second, so they share one mono line under the account's name rather
      // than each taking a column off a panel that is already split in two.
      const sub = [account?.code, line.memoTemplate].filter(Boolean).join(" · ");

      const row: ReportRow = {
        id: line.id,
        cells: [
          node(
            <span className="block min-w-0">
              <span
                className={cn(
                  "block truncate text-sm font-semibold",
                  tenderMapped || account
                    ? "text-[var(--text-strong)]"
                    : "text-[var(--badge-bad-fg)]",
                )}
              >
                {accountName}
              </span>
              {sub ? <span className="acct-rail-sub block truncate">{sub}</span> : null}
            </span>,
          ),
          txt(lineBasis(line), { tone: "subtle", align: "right" }),
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

  const simulatedRows = useMemo(() => {
    if (!simulated) return null;
    const row = (line: PostingSimulationLine, value: number, index: number): ReportRow => ({
      id: `${line.accountId}-${index}`,
      cells: [
        node(
          <span className="block min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
              {line.accountName}
            </span>
            <span className="acct-rail-sub block truncate">
              {[line.accountCode, line.memo].filter(Boolean).join(" · ")}
            </span>
          </span>,
        ),
        amt(formatAmount(value)),
      ],
    });
    return {
      debits: simulated.lines
        .filter((line) => line.debit > 0)
        .map((line, index) => row(line, line.debit, index)),
      credits: simulated.lines
        .filter((line) => line.credit > 0)
        .map((line, index) => row(line, line.credit, index)),
    };
  }, [simulated]);

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
        note={
          // Nothing to try a rule on that posts nothing, and the body below
          // already says so in more useful words than a "0 lines" count.
          rule.lines.length === 0 ? null : (
            <span className="flex items-center gap-2">
              try it on
              <span className="inline-flex h-[26px] items-center gap-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-0.5">
                {TRY_AMOUNTS.map((value) => {
                  const active = value === tryAmount;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTryAmount(value)}
                      className={cn(
                        "h-[22px] rounded-[var(--radius-xs)] px-[9px] font-mono text-sm",
                        active
                          ? "bg-[var(--surface-base)] font-bold text-[var(--text-strong)] shadow-[0_1px_2px_rgba(22,24,29,0.10)]"
                          : "font-medium text-[var(--text-muted)] hover:text-[var(--text-body)]",
                      )}
                    >
                      {formatHeadline(value)}
                    </button>
                  );
                })}
              </span>
            </span>
          )
        }
      >
        {rule.lines.length === 0 ? (
          <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">
            This rule posts nothing. Add at least one debit and one credit line before it can be
            used.
          </p>
        ) : (
          <>
            {/*
              Debit beside credit, not one list and then the other.

              A journal is a claim that two columns agree, and off a stacked
              pair of tables that claim can only be checked by holding the
              first list in your head while you read the second. Side by side,
              a rule that debits four accounts and credits none is wrong on
              sight, before a single account name has been read.

              The side is the column head — "Debit", then what it posts — so
              the panel spends no row on a heading that repeats the word
              already at the top of the column.

              Until the engine answers, the Amount column holds each line's
              basis in words — "the tax", "86.96% of amount". That is the rule
              as written and is never wrong; the dollars that replace it are
              one hypothetical event's worth.
            */}
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
              <ReportTable
                label="Debit lines"
                tracks="minmax(0,1fr) 130px"
                columns={[{ label: "Debit" }, { label: "Amount", align: "right" }]}
                rows={
                  simulated && simulatedRows
                    ? [...simulatedRows.debits, totalRow("Total debits", simulated.totalDebit)]
                    : debitRows
                }
                emptyLabel="No debit lines — this rule cannot balance."
              />
              <div aria-hidden="true" className="bg-[var(--border)]" />
              <ReportTable
                label="Credit lines"
                tracks="minmax(0,1fr) 130px"
                columns={[{ label: "Credit" }, { label: "Amount", align: "right" }]}
                rows={
                  simulated && simulatedRows
                    ? [...simulatedRows.credits, totalRow("Total credits", simulated.totalCredit)]
                    : creditRows
                }
                emptyLabel="No credit lines — this rule cannot balance."
              />
            </div>
            {/* A rule missing a whole side is unbalanced at every amount, and
                the note below names the cause. Saying it twice, once in
                figures, adds nothing but a second thing to read. */}
            {simulated && (simulated.balanced || !lopsided) ? (
              <BalanceLine
                balanced={simulated.balanced}
                debit={simulated.totalDebit}
                credit={simulated.totalCredit}
                memo={simulated.lines.find((line) => line.memo)?.memo ?? null}
              />
            ) : null}
            {shadowedBy ? (
              <p className="border-t border-[var(--border-subtle)] px-[13px] py-2 text-sm text-[var(--badge-warn-fg)]">
                On an event this rule describes, the engine picks {shadowedBy} instead — it matches
                the same event and is tried first. These lines are what this rule would post, not
                what would happen.
              </p>
            ) : null}
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

/**
 * The foot of one side of the journal.
 *
 * `emphasis` gives it the rule above and the tinted ground that separates a
 * sum from the lines it was summed from, and `total` the brand ink that says
 * the figure is arithmetic rather than one more posted line.
 */
function totalRow(label: string, value: number): ReportRow {
  return {
    id: label,
    emphasis: true,
    cells: [txt(label, { tone: "subtle", bold: true }), total(formatAmount(value))],
  };
}

/**
 * The verdict, across the foot of the journal.
 *
 * A journal is a claim that two columns agree, and until something says so the
 * reader is left adding two totals in their head. Stated in green it is the
 * one line that can be read without reading anything above it; stated in red
 * it is the difference between finding a broken rule now and finding it in the
 * failed-event log after a month of transactions.
 */
function BalanceLine({
  balanced,
  debit,
  credit,
  memo,
}: {
  balanced: boolean;
  debit: number;
  credit: number;
  memo: string | null;
}) {
  if (!balanced) {
    return (
      <p className="border-t border-[var(--border)] bg-[var(--badge-bad-bg)] px-[14px] py-2 text-sm text-[var(--badge-bad-fg)]">
        This does not balance — <span className="font-mono font-bold">{formatAmount(debit)}</span> of
        debits against <span className="font-mono font-bold">{formatAmount(credit)}</span> of
        credits. The ledger would reject the entry.
      </p>
    );
  }

  return (
    <div className="flex min-h-[38px] items-center gap-2.5 border-t border-[var(--border)] bg-[var(--tone-success-bg)] px-[14px] py-1.5">
      <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--tone-success)]" />
      <p className="min-w-0 text-sm text-[var(--badge-ok-fg)]">
        This balances — <span className="font-mono font-bold">{formatAmount(debit)}</span> on each
        side.
      </p>
      {memo ? (
        <span className="ml-auto min-w-0 shrink truncate text-sm text-[var(--badge-ok-fg)]">
          memo: <span className="font-mono">{memo}</span>
        </span>
      ) : null}
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
