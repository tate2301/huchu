"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Check, Drawer, Field, Input, Select, Switch } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ChartRow, CostCentreRow } from "@/lib/books/ledger-setup";

const AGAIN = "Check the connection and try again.";
type Account = Extract<ChartRow, { kind: "account" }>;
const TYPE_OPTIONS = [
  ["ASSET", "Asset"],
  ["LIABILITY", "Liability"],
  ["EQUITY", "Equity"],
  ["INCOME", "Income"],
  ["EXPENSE", "Expense"],
] as const;

/**
 * New account (N on Chart of accounts) or one account: its code (fixed once
 * made), name, type, heading and category. An account is deactivated, never
 * deleted: one with lines keeps them.
 */
export function AccountDrawer({ open, account, groups, onOpenChange, onSaved }: { open: boolean; account: Account | null; groups: Array<{ id: string; label: string; type: string }>; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void }) {
  const [form, setForm] = React.useState({ code: "", name: "", type: "EXPENSE", parentAccountId: "", category: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(account ? { code: account.code, name: account.name, type: account.type, parentAccountId: account.parentId ?? "", category: account.category ?? "", description: account.description ?? "" } : { code: "", name: "", type: "EXPENSE", parentAccountId: "", category: "", description: "" });
  }, [open, account]);
  const save = useMutation({
    mutationFn: async (patch?: { isActive: boolean }) => {
      if (patch) return fetchJson(`/api/accounting/coa/${account!.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      const body = { name: form.name.trim(), type: form.type, parentAccountId: form.parentAccountId || null, category: form.category.trim() || undefined, description: form.description.trim() || undefined };
      if (account) return fetchJson(`/api/accounting/coa/${account.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return fetchJson("/api/accounting/coa", { method: "POST", body: JSON.stringify({ ...body, code: form.code.trim() || undefined, nodeType: "LEDGER" }) });
    },
    onSuccess: (_, patch) => {
      onSaved(patch ? (patch.isActive ? `${account!.code} is active again` : `${account!.code} is inactive: its lines stay`) : account ? `${form.code} is saved` : "The account is added");
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  const headings = groups.filter((group) => group.type === form.type);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={account ? `${account.code} ${account.name}` : "New account"}
      sub={account ? (account.hasLines ? "It has ledger lines, so it can be deactivated but never deleted." : "No lines yet.") : undefined}
      footer={
        <>
          {account ? (
            <Button variant="quiet" icon={account.active ? "pause" : "check"} disabled={save.isPending} onClick={() => save.mutate({ isActive: !account.active })}>
              {account.active ? "Deactivate" : "Make active again"}
            </Button>
          ) : null}
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
            {account ? "Save" : "Add the account"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 12 }}>
          <Field label="Code" htmlFor="acc-code" help={account ? "Fixed once made." : "Left empty, Books gives the next free one."}>
            <Input id="acc-code" value={form.code} disabled={Boolean(account)} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label="Name" htmlFor="acc-name">
            <Input id="acc-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
        </div>
        <Field label="Type" htmlFor="acc-type">
          <Select id="acc-type" value={form.type} disabled={Boolean(account?.hasLines)} onChange={(event) => setForm({ ...form, type: event.target.value, parentAccountId: "" })}>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {headings.length ? (
          <Field label="Under" htmlFor="acc-parent" optional>
            <Select id="acc-parent" value={form.parentAccountId} onChange={(event) => setForm({ ...form, parentAccountId: event.target.value })}>
              <option value="">No heading</option>
              {headings.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Category" htmlFor="acc-category" optional help="Cash, Receivables, Payables, Tax, COGS… Reports group by it.">
          <Input id="acc-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
        </Field>
        <Field label="Note" htmlFor="acc-note" optional>
          <Input id="acc-note" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/** New cost centre (N on Cost centres) or one: its code (fixed once made) and name, active or not. */
export function CostCentreDrawer({ open, centre, onOpenChange, onSaved }: { open: boolean; centre: CostCentreRow | null; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void }) {
  const [form, setForm] = React.useState({ code: "", name: "", active: true });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(centre ? { code: centre.code, name: centre.name, active: centre.active } : { code: "", name: "", active: true });
  }, [open, centre]);
  const save = useMutation({
    mutationFn: () =>
      centre
        ? fetchJson(`/api/accounting/cost-centers/${centre.id}`, { method: "PATCH", body: JSON.stringify({ name: form.name.trim(), isActive: form.active }) })
        : fetchJson("/api/accounting/cost-centers", { method: "POST", body: JSON.stringify({ code: form.code.trim() || undefined, name: form.name.trim() }) }),
    onSuccess: () => {
      onSaved(centre ? `${form.name.trim()} is saved` : "The cost centre is added");
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={centre ? centre.name : "New cost centre"}
      sub={centre?.usedBy ?? undefined}
      footer={
        <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
          {centre ? "Save" : "Add the cost centre"}
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <Field label="Code" htmlFor="cc-code" help={centre ? "Fixed once made." : "Left empty, Books gives the next one."}>
          <Input id="cc-code" value={form.code} disabled={Boolean(centre)} onChange={(event) => setForm({ ...form, code: event.target.value })} />
        </Field>
        <Field label="Name" htmlFor="cc-name">
          <Input id="cc-name" value={form.name} placeholder="Pomona Offices" onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        {centre ? <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} label="In use: journals and documents can choose it" /> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ── Posting rule ────────────────────────────────────────────────────── */

type RuleLine = {
  accountId: string | null;
  direction: "DEBIT" | "CREDIT";
  basis: string;
  taxCodeId: string | null;
  allocationType: "PERCENT" | "FIXED" | null;
  allocationValue: number | null;
  repeatMode: "NONE" | "TENDER";
  accountSource: "FIXED_ACCOUNT" | "TENDER_MAPPING";
  valuePath: string | null;
  memoTemplate: string | null;
  costCenterId: string | null;
  accountRole?: string | null;
  eventAccountKey?: string | null;
};
type RuleCondition = { field: string; operator: string; valueString: string | null; valueListJson: string | null };
type Rule = { id: string; name: string; description: string | null; sourceType: string; priority: number; scopeType: "COMPANY" | "SITE"; siteId: string | null; ruleMode: "GUIDED" | "ADVANCED"; isFallback: boolean; isActive: boolean; lines: RuleLine[]; conditions?: RuleCondition[] };
type Options = { accounts: Array<{ id: string; label: string }>; costCentres: Array<{ id: string; label: string }> };
type TaxCode = { id: string; code: string; name: string };

const BASES = ["AMOUNT", "NET", "TAX", "GROSS", "DEDUCTIONS", "ALLOWANCES"];
const BASIS_WORD: Record<string, string> = { AMOUNT: "The amount", NET: "Net", TAX: "Tax", GROSS: "Gross", DEDUCTIONS: "Deductions", ALLOWANCES: "Allowances" };
const FIELDS = ["SITE_ID", "REGISTER_CODE", "TENDER_TYPE", "CURRENCY", "CUSTOMER_TAX_CATEGORY_ID", "VENDOR_TAX_CATEGORY_ID", "SALE_TYPE", "MOVEMENT_TYPE"];
const OPERATORS: Array<[string, string]> = [
  ["EQ", "is"],
  ["NEQ", "is not"],
  ["IN", "is one of"],
  ["NOT_IN", "is none of"],
  ["EXISTS", "is given"],
  ["NOT_EXISTS", "is not given"],
];
const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
const blankLine = (direction: "DEBIT" | "CREDIT"): RuleLine => ({ accountId: null, direction, basis: "AMOUNT", taxCodeId: null, allocationType: "PERCENT", allocationValue: 100, repeatMode: "NONE", accountSource: "FIXED_ACCOUNT", valuePath: null, memoTemplate: null, costCenterId: null });

/**
 * A posting rule (the pencil on Posting rules, or New rule): its name, the
 * document it posts, when it applies, and each line's side, account, basis
 * and share. Try it previews the journal an amount would post.
 */
export function RuleDrawer({ open, ruleId, sources, onOpenChange, onSaved }: { open: boolean; ruleId: string | null; sources: Array<{ value: string; label: string }>; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void }) {
  const rules = useQuery({ queryKey: ["accounting", "posting-rules"], queryFn: () => fetchJson<Rule[]>("/api/accounting/posting-rules"), enabled: open });
  const options = useQuery({ queryKey: ["books", "journal-form"], queryFn: () => fetchJson<Options>("/api/books/journals/form"), enabled: open, staleTime: 60_000 });
  const taxes = useQuery({ queryKey: ["accounting", "tax-codes", "rules"], queryFn: () => fetchJson<TaxCode[] | { data: TaxCode[] }>("/api/accounting/tax"), enabled: open, staleTime: 60_000 });
  const taxList = Array.isArray(taxes.data) ? taxes.data : (taxes.data?.data ?? []);
  const [rule, setRule] = React.useState<Rule | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tryAmount, setTryAmount] = React.useState("");
  const [preview, setPreview] = React.useState<{ lines: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>; warnings: string[]; balanced: boolean } | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setPreview(null);
    setTryAmount("");
    if (!ruleId) setRule({ id: "", name: "", description: null, sourceType: sources[0]?.value ?? "MANUAL", priority: 100, scopeType: "COMPANY", siteId: null, ruleMode: "GUIDED", isFallback: false, isActive: true, lines: [blankLine("DEBIT"), blankLine("CREDIT")], conditions: [] });
    else setRule(rules.data?.find((one) => one.id === ruleId) ?? null);
  }, [open, ruleId, rules.data, sources]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: rule!.name.trim(),
        description: rule!.description,
        sourceType: rule!.sourceType,
        priority: rule!.priority,
        scopeType: rule!.scopeType,
        siteId: rule!.siteId,
        ruleMode: rule!.ruleMode,
        isFallback: rule!.isFallback,
        isActive: rule!.isActive,
        conditions: (rule!.conditions ?? []).map((condition) => ({ field: condition.field, operator: condition.operator, valueString: condition.valueString, valueListJson: condition.valueListJson })),
        lines: rule!.lines.map((line, index) => ({ ...line, sortOrder: index })),
      };
      return ruleId ? fetchJson(`/api/accounting/posting-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(body) }) : fetchJson("/api/accounting/posting-rules", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      onSaved(ruleId ? `${rule!.name} is saved` : "The rule is added");
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  const tryIt = useMutation({
    mutationFn: () => fetchJson<{ lines: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>; warnings: string[]; balanced: boolean }>("/api/accounting/posting-rules/preview", { method: "POST", body: JSON.stringify({ sourceType: rule!.sourceType, description: `Try ${rule!.name}`, amount: Number(tryAmount) || 0 }) }),
    onSuccess: setPreview,
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });

  const set = (patch: Partial<Rule>) => setRule((current) => (current ? { ...current, ...patch } : current));
  const setLine = (index: number, patch: Partial<RuleLine>) => set({ lines: rule!.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) });
  const setCondition = (index: number, patch: Partial<RuleCondition>) => set({ conditions: (rule!.conditions ?? []).map((condition, at) => (at === index ? { ...condition, ...patch } : condition)) });
  const accounts = options.data?.accounts ?? [];
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={720}
      title={ruleId ? rule?.name || "Posting rule" : "New rule"}
      footer={
        <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!rule || !rule.name.trim() || rule.lines.length < 2 || save.isPending} onClick={() => save.mutate()}>
          {ruleId ? "Save the rule" : "Add the rule"}
        </Button>
      }
    >
      {!rule ? (
        <div className="skeleton" style={{ height: 240, margin: 24 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 12, padding: "0 24px" }}>
            <Field label="Name" htmlFor="rule-name">
              <Input id="rule-name" value={rule.name} onChange={(event) => set({ name: event.target.value })} />
            </Field>
            <Field label="Posts" htmlFor="rule-source">
              <Select id="rule-source" value={rule.sourceType} disabled={Boolean(ruleId)} onChange={(event) => set({ sourceType: event.target.value })}>
                {sources.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center", padding: "0 24px", flexWrap: "wrap" }}>
            <Field label="Order" htmlFor="rule-priority" help="Lower goes first.">
              <Input id="rule-priority" inputMode="numeric" style={{ width: 96 }} value={String(rule.priority)} onChange={(event) => set({ priority: Number(event.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Switch checked={rule.isActive} onCheckedChange={(isActive) => set({ isActive })} label="In use" />
            <Check checked={rule.isFallback} onCheckedChange={(isFallback) => set({ isFallback })} label="Use when no other rule fits" />
          </div>
          <div className="group-head bk-gh" style={{ padding: "0 24px" }}>
            <h2>When it applies</h2>
            <Button variant="quiet" size="sm" icon="plus" onClick={() => set({ conditions: [...(rule.conditions ?? []), { field: "TENDER_TYPE", operator: "EQ", valueString: "", valueListJson: null }] })}>
              Add a condition
            </Button>
          </div>
          {(rule.conditions ?? []).length === 0 ? (
            <span className="muted" style={{ padding: "0 24px" }}>
              Every one of these documents.
            </span>
          ) : (
            (rule.conditions ?? []).map((condition, index) => (
              <div key={index} style={{ display: "grid", gridTemplateColumns: "200px 140px minmax(0,1fr) 40px", gap: 8, padding: "0 24px" }}>
                <Select aria-label="Field" value={condition.field} onChange={(event) => setCondition(index, { field: event.target.value })}>
                  {FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {words(field)}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Test" value={condition.operator} onChange={(event) => setCondition(index, { operator: event.target.value })}>
                  {OPERATORS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Value"
                  placeholder={condition.operator === "IN" || condition.operator === "NOT_IN" ? "CASH, ECOCASH" : "CASH"}
                  disabled={condition.operator === "EXISTS" || condition.operator === "NOT_EXISTS"}
                  value={condition.operator === "IN" || condition.operator === "NOT_IN" ? ((JSON.parse(condition.valueListJson || "[]") as string[]).join(", ")) : (condition.valueString ?? "")}
                  onChange={(event) =>
                    condition.operator === "IN" || condition.operator === "NOT_IN"
                      ? setCondition(index, { valueListJson: JSON.stringify(event.target.value.split(",").map((part) => part.trim()).filter(Boolean)), valueString: null })
                      : setCondition(index, { valueString: event.target.value, valueListJson: null })
                  }
                />
                <Button variant="quiet" iconOnly icon="x" label="Remove the condition" onClick={() => set({ conditions: (rule.conditions ?? []).filter((_, at) => at !== index) })} />
              </div>
            ))
          )}
          <div className="group-head bk-gh" style={{ padding: "0 24px" }}>
            <h2>Lines</h2>
            <Button variant="quiet" size="sm" icon="plus" onClick={() => set({ lines: [...rule.lines, blankLine("CREDIT")] })}>
              Add a line
            </Button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ tableLayout: "fixed", minWidth: 672 }} aria-label="Lines">
              <colgroup>
                <col style={{ width: 96 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 44 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Account</th>
                  <th>Of</th>
                  <th className="num">Share</th>
                  <th>Tax code</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rule.lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <Select aria-label="Side" value={line.direction} onChange={(event) => setLine(index, { direction: event.target.value as RuleLine["direction"] })}>
                        <option value="DEBIT">Debit</option>
                        <option value="CREDIT">Credit</option>
                      </Select>
                    </td>
                    <td>
                      <Select
                        aria-label="Account"
                        style={{ width: "100%" }}
                        value={line.accountSource === "TENDER_MAPPING" ? "@tender" : line.accountId ?? (line.eventAccountKey || line.accountRole ? "@event" : "")}
                        onChange={(event) =>
                          event.target.value === "@tender"
                            ? setLine(index, { accountSource: "TENDER_MAPPING", accountId: null, repeatMode: "TENDER" })
                            : event.target.value === "@event"
                              ? null
                              : setLine(index, { accountSource: "FIXED_ACCOUNT", accountId: event.target.value || null, repeatMode: "NONE", eventAccountKey: null, accountRole: null })
                        }
                      >
                        <option value="">No account yet</option>
                        <option value="@tender">The tender’s account</option>
                        {line.eventAccountKey || line.accountRole ? <option value="@event">The account the document names</option> : null}
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Select aria-label="Of" value={line.basis} onChange={(event) => setLine(index, { basis: event.target.value })}>
                        {BASES.map((basis) => (
                          <option key={basis} value={basis}>
                            {BASIS_WORD[basis]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="num">
                      <Input aria-label="Share" className="num" inputMode="decimal" value={line.allocationValue === null ? "" : String(line.allocationValue)} onChange={(event) => setLine(index, { allocationValue: Number(event.target.value.replace(/[^\d.]/g, "")) || 0, allocationType: line.allocationType ?? "PERCENT" })} />
                    </td>
                    <td>
                      <Select aria-label="Tax code" value={line.taxCodeId ?? ""} onChange={(event) => setLine(index, { taxCodeId: event.target.value || null })}>
                        <option value="">None</option>
                        {taxList.map((tax) => (
                          <option key={tax.id} value={tax.id}>
                            {tax.code}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>{rule.lines.length > 2 ? <Button variant="quiet" iconOnly icon="x" label="Remove the line" onClick={() => set({ lines: rule.lines.filter((_, at) => at !== index) })} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="group-head bk-gh" style={{ padding: "0 24px" }}>
            <h2>Try it</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "0 24px" }}>
            <Field label="An amount" htmlFor="rule-try">
              <Input id="rule-try" inputMode="decimal" style={{ width: 140 }} value={tryAmount} onChange={(event) => setTryAmount(event.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Button icon="run" disabled={!tryAmount || !ruleId || tryIt.isPending} busy={tryIt.isPending} onClick={() => tryIt.mutate()}>
              Show the journal
            </Button>
          </div>
          {preview ? (
            <table className="table" aria-label="What it would post">
              <tbody>
                {preview.lines.map((line, index) => (
                  <tr key={index}>
                    <td className="fill">
                      <span className="ref">{line.accountCode}</span> {line.accountName}
                    </td>
                    <td className="num">{line.debit ? line.debit.toFixed(2) : ""}</td>
                    <td className="num">{line.credit ? line.credit.toFixed(2) : ""}</td>
                  </tr>
                ))}
                {preview.warnings.map((warning) => (
                  <tr key={warning}>
                    <td className="fill muted" colSpan={3}>
                      {warning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {error ? (
            <p className="error" role="alert" style={{ padding: "0 24px" }}>
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
