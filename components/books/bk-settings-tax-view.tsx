"use client";

import * as React from "react";

import { Button, Check, FormSection, Input, Select, TableFoot, TableShell } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import type { ResolvedTaxSettings } from "@/lib/books/core/tax-settings";
import type { SettingsTaxPage, TaxCodeRow } from "@/lib/books/settings-tax";

import { Lead, St, TableEmpty, ToConfirm } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

export type SettingsTaxTab = "codes" | "categories" | "templates" | "rules" | "dates";

const KINDS = [
  { value: "all", label: "All" },
  { value: "VAT", label: "VAT" },
  { value: "WITHHOLDING", label: "Withholding" },
  { value: "OTHER", label: "Other" },
];

/** The settings form's values: what a person types, as text, before it is saved. */
type Draft = {
  category: string;
  periodMonths: string;
  vatReturnDay: string;
  vatPaymentDay: string;
  agent: boolean;
  contractRate: string;
  thresholdUsd: string;
  whtReturnDay: string;
  whtPaymentDay: string;
  payeReturnDay: string;
  payePaymentDay: string;
  qpd: [string, string, string, string];
  usdRate: string;
  zwgRate: string;
  flatOverUsd: string;
  flatAmountUsd: string;
};

const pct = (n: number) => String(Math.round(n * 10000) / 100);

export function draftOf(s: ResolvedTaxSettings): Draft {
  return {
    category: s.vat.category,
    periodMonths: String(s.vat.periodMonths),
    vatReturnDay: String(s.vat.returnDay),
    vatPaymentDay: String(s.vat.paymentDay),
    agent: s.vat.withholdingAgent,
    contractRate: pct(s.withholding.contractRate),
    thresholdUsd: String(s.withholding.thresholdUsd),
    whtReturnDay: String(s.withholding.returnDay),
    whtPaymentDay: String(s.withholding.paymentDay),
    payeReturnDay: String(s.paye.returnDay),
    payePaymentDay: String(s.paye.paymentDay),
    qpd: s.provisional.paymentDates.map((value) => value) as [string, string, string, string],
    usdRate: pct(s.imtt.usdRate),
    zwgRate: pct(s.imtt.zwgRate),
    flatOverUsd: String(s.imtt.flatOverUsd),
    flatAmountUsd: String(s.imtt.flatAmountUsd),
  };
}

/** What changed, as the settings patch the server saves. */
export function patchOf(before: Draft, after: Draft) {
  const patch: Record<string, Record<string, unknown>> = {};
  const set = (group: string, key: string, value: unknown) => {
    patch[group] = { ...(patch[group] ?? {}), [key]: value };
  };
  if (after.category !== before.category) set("vat", "category", after.category);
  if (after.periodMonths !== before.periodMonths) set("vat", "periodMonths", Number(after.periodMonths));
  if (after.vatReturnDay !== before.vatReturnDay) set("vat", "returnDay", Number(after.vatReturnDay));
  if (after.vatPaymentDay !== before.vatPaymentDay) set("vat", "paymentDay", Number(after.vatPaymentDay));
  if (after.agent !== before.agent) set("vat", "withholdingAgent", after.agent);
  if (after.contractRate !== before.contractRate) set("withholding", "contractRate", Number(after.contractRate) / 100);
  if (after.thresholdUsd !== before.thresholdUsd) set("withholding", "thresholdUsd", Number(after.thresholdUsd));
  if (after.whtReturnDay !== before.whtReturnDay) set("withholding", "returnDay", Number(after.whtReturnDay));
  if (after.whtPaymentDay !== before.whtPaymentDay) set("withholding", "paymentDay", Number(after.whtPaymentDay));
  if (after.payeReturnDay !== before.payeReturnDay) set("paye", "returnDay", Number(after.payeReturnDay));
  if (after.payePaymentDay !== before.payePaymentDay) set("paye", "paymentDay", Number(after.payePaymentDay));
  if (after.qpd.join() !== before.qpd.join()) set("provisional", "paymentDates", after.qpd);
  if (after.usdRate !== before.usdRate) set("imtt", "usdRate", Number(after.usdRate) / 100);
  if (after.zwgRate !== before.zwgRate) set("imtt", "zwgRate", Number(after.zwgRate) / 100);
  if (after.flatOverUsd !== before.flatOverUsd) set("imtt", "flatOverUsd", Number(after.flatOverUsd));
  if (after.flatAmountUsd !== before.flatAmountUsd) set("imtt", "flatAmountUsd", Number(after.flatAmountUsd));
  return patch;
}

function Row({ label, flag, settings, children }: { label: string; flag?: string; settings: ResolvedTaxSettings; children: React.ReactNode }) {
  const pending = flag ? settings.toConfirm.find((row) => row.key === flag) : null;
  return (
    <div className="field">
      <span className="lbl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {label}
        {pending ? <ToConfirm why={pending.why} /> : null}
      </span>
      {children}
      {pending ? <span className="help">{pending.why}</span> : null}
    </div>
  );
}

const small = { width: 120 };

/**
 * Books → Settings → Tax codes & rules (design/core-modules/boards/view/BkSettingsTax.html):
 * the codes a document carries; categories, templates and rules; and ZIMRA's
 * dates and rates, each value still to confirm marked so until it is saved.
 */
export function BkSettingsTaxView({
  data,
  tab,
  q,
  kind,
  onQuery,
  codeMenu,
  exportHref,
  legacy,
  onSave,
  saving,
}: {
  data: SettingsTaxPage;
  tab: SettingsTaxTab;
  q: string;
  kind: string;
  onQuery: (next: { tab?: SettingsTaxTab; q?: string; kind?: string }) => void;
  codeMenu: (row: TaxCodeRow) => MenuEntry[];
  exportHref: string;
  /** The categories, templates and rules editors. */
  legacy: React.ReactNode;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const s = data.settings;
  const initial = React.useMemo(() => draftOf(s), [s]);
  const [draft, setDraft] = React.useState(initial);
  React.useEffect(() => setDraft(initial), [initial]);
  const patch = patchOf(initial, draft);
  const changed = Object.keys(patch).length > 0;
  const field = (key: keyof Draft, width = small) => <Input style={width} inputMode="decimal" value={String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.value.replace(/[^\d.]/g, "") })} />;
  return (
    <div className="bk">
      <BooksFinding finding={data.finding} />
      <BkTabs
        label="Tax setup"
        value={tab}
        onChange={(next) => onQuery({ tab: next })}
        items={[
          { value: "codes", label: "Tax codes", count: data.counts.codes },
          { value: "categories", label: "Categories", count: data.counts.categories },
          { value: "templates", label: "Templates", count: data.counts.templates },
          { value: "rules", label: "Rules", count: data.counts.rules },
          { value: "dates", label: "Dates and rates", count: data.counts.toConfirm || null },
        ]}
      />
      {tab === "codes" ? (
        <>
          <BkTools
            find="Search tax codes"
            query={q}
            onFind={(next) => onQuery({ q: next })}
            chips={<BkChip label="Kind" value={KINDS.find((row) => row.value === kind)?.label ?? "All"} set={kind !== "all"} items={KINDS.map((row) => ({ key: row.value, label: row.label, checked: row.value === kind, onSelect: () => onQuery({ kind: row.value }) }))} />}
            count={`${data.codes.length} ${data.codes.length === 1 ? "code" : "codes"}`}
            end={<BkQuietTools exportHref={exportHref} />}
          />
          <TableShell label="Tax codes" foot={<TableFoot range={`${data.counts.codes} tax codes`} sums={[{ label: "Active", value: String(data.active) }]} />}>
            {data.codes.length === 0 ? (
              <TableEmpty title={q ? "No code matches" : "No tax codes yet"}>{q ? "Clear the search to see the rest." : "Set up the books to load ZIMRA’s codes, or add one with New tax code."}</TableEmpty>
            ) : (
              <table className="table" aria-label="Tax codes">
                <colgroup>
                  <col style={{ width: 130 }} />
                  <col />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 56 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th className="fill">Name</th>
                    <th className="num">Rate</th>
                    <th>From</th>
                    <th>Used for</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.codes.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="mono" style={{ color: "var(--color-ink)" }}>
                          {row.code}
                        </span>
                      </td>
                      <td className="fill truncate">
                        <Lead>{row.name}</Lead>
                      </td>
                      <td className="num">
                        <span className="mono">{row.type === "VAT" && row.rate === 0 && /exempt/i.test(row.name) ? "—" : `${row.rate}%`}</span>
                      </td>
                      <td className="muted">{row.from ?? "—"}</td>
                      <td className="muted truncate">{row.usedFor}</td>
                      <td>
                        <St word={row.active ? "Active" : "Inactive"} />
                      </td>
                      <td className="acts">
                        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${row.code}`} aria-label={`More for ${row.code}`} items={codeMenu(row)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </>
      ) : tab === "dates" ? (
        <div className="bk-fl" style={{ padding: "32px 24px 56px", display: "flex", flexDirection: "column", gap: 40, overflow: "auto" }}>
          <FormSection title="VAT" description="The return by the 10th and payment by the 15th of the month after the period (SI 81 of 2025).">
            <Row label="Category" settings={s}>
              <Select style={{ width: 280 }} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                <option value="A">A, every two months, ending in odd months</option>
                <option value="B">B, every two months, ending in even months</option>
                <option value="C">C, every month</option>
                <option value="D">D, as the Commissioner sets</option>
              </Select>
            </Row>
            {draft.category === "D" ? <Row label="Months in a period" settings={s}>{field("periodMonths")}</Row> : null}
            <Row label="Return by the day" flag="vat.returnDay" settings={s}>
              {field("vatReturnDay")}
            </Row>
            <Row label="Payment by the day" flag="vat.paymentDay" settings={s}>
              {field("vatPaymentDay")}
            </Row>
            <Check checked={draft.agent} onCheckedChange={(agent) => setDraft({ ...draft, agent })} label="We are an appointed VAT withholding agent" />
          </FormSection>
          <FormSection title="Withholding" description="30% from a supplier without a valid ITF263, once the year’s payments to them reach the threshold.">
            <Row label="Rate, %" settings={s}>
              {field("contractRate")}
            </Row>
            <Row label="Threshold for the year, US$" flag="withholding.thresholdUsd" settings={s}>
              {field("thresholdUsd")}
            </Row>
            <div className="field-row">
              <Row label="Return by the day" settings={s}>
                {field("whtReturnDay")}
              </Row>
              <Row label="Payment by the day" settings={s}>
                {field("whtPaymentDay")}
              </Row>
            </div>
          </FormSection>
          <FormSection title="PAYE" description="For the month before.">
            <div className="field-row">
              <Row label="Return by the day" settings={s}>
                {field("payeReturnDay")}
              </Row>
              <Row label="Payment by the day" settings={s}>
                {field("payePaymentDay")}
              </Row>
            </div>
          </FormSection>
          <FormSection title="Provisional tax" description="The four instalments: 10%, 25%, 30% and 35% of the year’s estimate.">
            <Row label="Payment dates, month and day" flag="provisional.paymentDates" settings={s}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {draft.qpd.map((value, index) => (
                  <Input
                    key={index}
                    style={{ width: 96 }}
                    aria-label={`Instalment ${index + 1}, MM-DD`}
                    value={value}
                    onChange={(event) => {
                      const next = [...draft.qpd] as Draft["qpd"];
                      next[index] = event.target.value.replace(/[^\d-]/g, "").slice(0, 5);
                      setDraft({ ...draft, qpd: next });
                    }}
                  />
                ))}
              </div>
            </Row>
          </FormSection>
          <FormSection title="IMTT" description="What the bank takes on a transfer. Books records what the bank charged; these only propose the line.">
            <div className="field-row">
              <Row label="On USD, %" settings={s}>
                {field("usdRate")}
              </Row>
              <Row label="On ZiG, %" flag="imtt.zwgRate" settings={s}>
                {field("zwgRate")}
              </Row>
            </div>
            <div className="field-row">
              <Row label="A transfer over, US$" settings={s}>
                {field("flatOverUsd")}
              </Row>
              <Row label="pays a flat, US$" settings={s}>
                {field("flatAmountUsd")}
              </Row>
            </div>
          </FormSection>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" disabled={!changed || saving} busy={saving} onClick={() => onSave(patch)}>
              Save
            </Button>
            {s.toConfirm.length ? (
              <Button icon="check" disabled={saving} onClick={() => onSave({ ...patch, confirmed: s.toConfirm.map((row) => row.key) })}>
                {changed ? "Save, and confirm the rest" : "Confirm them as they are"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        legacy
      )}
    </div>
  );
}
