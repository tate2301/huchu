"use client";

import * as React from "react";

import { Button, Check, Drawer, Field, Icon, Input, Person, Select, Switch, TableFoot, TableShell } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import type { BusinessSettings } from "@/lib/books/core/business-settings";
import type { MoneyAccountRow } from "@/lib/books/core/money-accounts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CATEGORY_WORD: Record<string, string> = { A: "A: every two months, odd months", B: "B: every two months, even months", C: "C: every month", D: "D: as the Commissioner sets" };
const KIND_WORD: Record<MoneyAccountRow["kind"], string> = { BANK: "Bank", MOBILE: "Mobile money", CASH: "Cash" };
const n2 = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Finding({ fact, rest }: { fact: string; rest?: string | null }) {
  return (
    <div className="finding" style={{ padding: 0 }}>
      <p className="lede-figure">
        {fact}
        {rest ? <span className="q"> {rest}</span> : null}
      </p>
    </div>
  );
}

/* ── Money and tax ───────────────────────────────────────────────────── */

export type MoneyAndTaxData = { settings: BusinessSettings; equity: Array<{ id: string; label: string }>; baseLocked: string | null; currencies: string[]; can: { change: boolean } };

/**
 * Management › Company › Money and tax (books-final §3.2; no board of its
 * own: Management's settings pattern): the legal name and tax numbers, the
 * VAT category, the base currency (fixed once anything posts), whose rate a
 * document takes, and the financial year's end. Books' Business & tax details
 * opens here.
 */
export function MoneyAndTaxView({ data, saving, onSave, error }: { data: MoneyAndTaxData; saving: boolean; onSave: (patch: Partial<BusinessSettings>) => void; error: { message: string; field?: string } | null }) {
  const [form, setForm] = React.useState(data.settings);
  React.useEffect(() => setForm(data.settings), [data.settings]);
  const locked = !data.can.change || saving;
  const changed = (Object.keys(form) as Array<keyof BusinessSettings>).filter((key) => form[key] !== data.settings[key]);
  const patch = Object.fromEntries(changed.map((key) => [key, form[key]])) as Partial<BusinessSettings>;
  const set = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
  const fieldError = (field: string) => (error?.field === field ? error.message : null);
  const s = data.settings;
  return (
    <KitPage
      title="Money and tax"
      mark={<Icon name="vat" />}
      actions={
        data.can.change ? (
          <Button variant="primary" icon="check" shortcut="Ctrl S" busy={saving} disabled={locked || changed.length === 0} onClick={() => onSave(patch)}>
            Save changes
          </Button>
        ) : null
      }
    >
      <Finding
        fact={`${s.legalName || s.tradingName || "The business"} is in VAT category ${s.vatCategory}, keeping its books in ${s.baseCurrency}.`}
        rest={`Its financial year ends on the last day of ${MONTHS[s.yearEndMonth - 1]}.`}
      />
      {!data.can.change ? <p className="muted">Only the owner or the accountant changes these.</p> : null}
      <div className="form-sec">
        <header>
          <h2>The business</h2>
          <p>As ZIMRA knows it. Printed on invoices and returns.</p>
        </header>
        <div className="body">
          <Field label="Legal name" htmlFor="mt-legal">
            <Input id="mt-legal" value={form.legalName} disabled={locked} onChange={(event) => set("legalName", event.target.value)} />
          </Field>
          <Field label="Trading name" htmlFor="mt-trading">
            <Input id="mt-trading" value={form.tradingName} disabled={locked} onChange={(event) => set("tradingName", event.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="VAT number" htmlFor="mt-vat" error={fieldError("vatNumber")} help="8 digits, from the VAT registration certificate.">
              <Input id="mt-vat" inputMode="numeric" value={form.vatNumber} disabled={locked} onChange={(event) => set("vatNumber", event.target.value)} />
            </Field>
            <Field label="TIN" htmlFor="mt-tin" error={fieldError("taxNumber")} help="10 digits, the taxpayer number in TaRMS.">
              <Input id="mt-tin" inputMode="numeric" value={form.taxNumber} disabled={locked} onChange={(event) => set("taxNumber", event.target.value)} />
            </Field>
          </div>
          <Field label="Address" htmlFor="mt-address" optional>
            <Input id="mt-address" value={form.address} disabled={locked} onChange={(event) => set("address", event.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Phone" htmlFor="mt-phone" optional>
              <Input id="mt-phone" value={form.phone} disabled={locked} onChange={(event) => set("phone", event.target.value)} />
            </Field>
            <Field label="Email" htmlFor="mt-email" optional>
              <Input id="mt-email" type="email" value={form.email} disabled={locked} onChange={(event) => set("email", event.target.value)} />
            </Field>
          </div>
        </div>
      </div>
      <div className="form-sec">
        <header>
          <h2>VAT</h2>
          <p>The category sets when returns are due.</p>
        </header>
        <div className="body">
          <Field label="VAT category" htmlFor="mt-category">
            <Select id="mt-category" value={form.vatCategory} disabled={locked} onChange={(event) => set("vatCategory", event.target.value as BusinessSettings["vatCategory"])}>
              {Object.entries(CATEGORY_WORD).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {form.vatCategory === "D" ? (
            <Field label="Months in a VAT period" htmlFor="mt-months">
              <Input id="mt-months" inputMode="numeric" value={String(form.vatPeriodMonths)} disabled={locked} onChange={(event) => set("vatPeriodMonths", Math.max(1, Math.min(12, Number(event.target.value.replace(/\D/g, "")) || 1)))} />
            </Field>
          ) : null}
          <Check checked={form.vatWithholdingAgent} disabled={locked} onCheckedChange={(value) => set("vatWithholdingAgent", value)} label="Appointed a VAT withholding agent: it keeps back a third of suppliers’ VAT" />
        </div>
      </div>
      <div className="form-sec">
        <header>
          <h2>Money</h2>
          <p>The currency the books are kept in, and whose rate a document takes.</p>
        </header>
        <div className="body">
          <Field label="Base currency" htmlFor="mt-base" help={data.baseLocked ?? "Chosen once, before anything posts."} error={fieldError("baseCurrency")}>
            <Select id="mt-base" value={form.baseCurrency} disabled={locked || Boolean(data.baseLocked)} onChange={(event) => set("baseCurrency", event.target.value)}>
              {data.currencies.map((code) => (
                <option key={code} value={code}>
                  {code === "USD" ? "US dollars, USD" : code === "ZWG" ? "Zimbabwe Gold, ZiG" : code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rate source" htmlFor="mt-rate" help="When a day has both, documents freeze this one.">
            <Select id="mt-rate" value={form.rateSource} disabled={locked} onChange={(event) => set("rateSource", event.target.value as BusinessSettings["rateSource"])}>
              <option value="RBZ">RBZ interbank rate</option>
              <option value="MANUAL">The rate typed in</option>
            </Select>
          </Field>
        </div>
      </div>
      <div className="form-sec">
        <header>
          <h2>Financial year</h2>
          <p>When the year closes into retained earnings.</p>
        </header>
        <div className="body">
          <Field label="The year ends in" htmlFor="mt-year">
            <Select id="mt-year" value={String(form.yearEndMonth)} disabled={locked} onChange={(event) => set("yearEndMonth", Number(event.target.value))}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Retained earnings" htmlFor="mt-retained" error={fieldError("retainedEarningsAccountId")}>
            <Select id="mt-retained" value={form.retainedEarningsAccountId ?? ""} disabled={locked} onChange={(event) => set("retainedEarningsAccountId", event.target.value || null)}>
              <option value="">Not chosen yet</option>
              {data.equity.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      {error && !error.field ? (
        <p className="error" role="alert">
          {error.message}
        </p>
      ) : null}
    </KitPage>
  );
}

/* ── Money accounts ──────────────────────────────────────────────────── */

export type MoneyAccountsData = { rows: MoneyAccountRow[]; ledgers: Array<{ id: string; label: string }>; people: Array<{ id: string; name: string }>; baseCurrency: string; can: { change: boolean } };

/**
 * Management › Company › Money accounts (books-final §3.2; Management's list
 * pattern): every bank, mobile money and cash account and petty cash float,
 * where each posts in the ledger and what it holds there.
 */
export function MoneyAccountsView({ data, onOpen, onNew }: { data: MoneyAccountsData; onOpen: (row: MoneyAccountRow) => void; onNew: () => void }) {
  const active = data.rows.filter((row) => row.active);
  const count = (kind: MoneyAccountRow["kind"]) => active.filter((row) => row.kind === kind).length;
  const floats = active.filter((row) => row.isFloat).length;
  return (
    <KitPage
      title="Money accounts"
      mark={<Icon name="bank" />}
      flush
      actions={
        data.can.change ? (
          <Button variant="primary" icon="plus" shortcut="N" onClick={onNew}>
            New money account
          </Button>
        ) : null
      }
    >
      <div style={{ padding: "28px 24px 12px" }}>
        <Finding
          fact={active.length ? `${active.length} money ${active.length === 1 ? "account" : "accounts"}: ${[count("BANK") && `${count("BANK")} bank`, count("MOBILE") && `${count("MOBILE")} mobile money`, count("CASH") && `${count("CASH")} cash`].filter(Boolean).join(", ")}.` : "No money accounts yet."}
          rest={active.length ? (floats ? `${floats} ${floats === 1 ? "is a petty cash float" : "are petty cash floats"} with a holder.` : "Each posts to its own account in the ledger.") : "Add the bank account money is paid into first."}
        />
      </div>
      <TableShell label="Money accounts" foot={<TableFoot range={`${data.rows.length} accounts${data.rows.length > active.length ? `, ${data.rows.length - active.length} not in use` : ""}`} />}>
        {data.rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>No money accounts yet</b>
            <p className="muted">Add one with New money account.</p>
          </div>
        ) : (
          <table className="table" aria-label="Money accounts">
            <colgroup>
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="fill">Account</th>
                <th>Kind</th>
                <th>Currency</th>
                <th>Posts to</th>
                <th className="num">Holds</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} tabIndex={0} style={{ cursor: data.can.change ? "pointer" : undefined }} onClick={() => data.can.change && onOpen(row)} onKeyDown={(event) => event.key === "Enter" && data.can.change && onOpen(row)}>
                  <td className="fill truncate">
                    <span className="cell-lead">{row.name}</span>
                    <span className="sub" style={{ display: "block", fontSize: 12, color: "var(--color-muted)" }}>
                      {row.isFloat && row.holder ? <Person name={row.holder.name} src={row.holder.image} /> : [row.bankName, row.accountNumber].filter(Boolean).join(" · ") || (row.isDefault ? "Paid into by default" : "—")}
                    </span>
                  </td>
                  <td>
                    <span className="muted">{row.isFloat ? "Petty cash float" : KIND_WORD[row.kind]}</span>
                  </td>
                  <td>{row.currency}</td>
                  <td className="truncate">
                    <span className="muted">{row.ledger ? `${row.ledger.code} ${row.ledger.name}` : row.usual ? `${row.usual.code} ${row.usual.name}` : "Not linked"}</span>
                  </td>
                  <td className="num">{n2(row.balance)}</td>
                  <td>
                    <span className={row.active ? "status status-success" : "status"} style={row.active ? undefined : { color: "var(--color-muted)" }}>
                      {row.active ? (row.isDefault ? "Default" : "In use") : "Not in use"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </KitPage>
  );
}

type AccountForm = { name: string; kind: MoneyAccountRow["kind"]; currency: string; bankName: string; accountNumber: string; accountName: string; ledgerAccountId: string; isFloat: boolean; imprestAmount: string; holderId: string; showOnDocuments: boolean; isDefault: boolean; active: boolean; openingBalance: string };

/** New money account (N) or one account's details: what it is, where it posts, a float's holder and imprest. */
export function MoneyAccountDrawer({ open, account, data, saving, error, onOpenChange, onSave }: { open: boolean; account: MoneyAccountRow | null; data: MoneyAccountsData; saving: boolean; error: string | null; onOpenChange: (open: boolean) => void; onSave: (form: Record<string, unknown>) => void }) {
  const blank: AccountForm = { name: "", kind: "BANK", currency: data.baseCurrency, bankName: "", accountNumber: "", accountName: "", ledgerAccountId: "", isFloat: false, imprestAmount: "", holderId: "", showOnDocuments: false, isDefault: false, active: true, openingBalance: "" };
  const [form, setForm] = React.useState<AccountForm>(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(
      account
        ? { name: account.name, kind: account.kind, currency: account.currency, bankName: account.bankName ?? "", accountNumber: account.accountNumber ?? "", accountName: account.accountName ?? "", ledgerAccountId: account.ledger?.id ?? "", isFloat: account.isFloat, imprestAmount: account.imprest ? String(account.imprest) : "", holderId: account.holder?.id ?? "", showOnDocuments: account.showOnDocuments, isDefault: account.isDefault, active: account.active, openingBalance: "" }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account]);
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () =>
    onSave({
      name: form.name,
      kind: form.kind,
      currency: form.currency,
      bankName: form.bankName || null,
      accountNumber: form.accountNumber || null,
      accountName: form.accountName || null,
      ledgerAccountId: form.ledgerAccountId || null,
      isFloat: form.kind === "CASH" && form.isFloat,
      imprestAmount: form.kind === "CASH" && form.isFloat && form.imprestAmount ? Number(form.imprestAmount) : null,
      holderId: form.kind === "CASH" && form.isFloat ? form.holderId || null : null,
      showOnDocuments: form.showOnDocuments,
      isDefault: form.isDefault,
      active: form.active,
      ...(account ? {} : { openingBalance: form.openingBalance ? Number(form.openingBalance) : null }),
    });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={account ? account.name : "New money account"}
      footer={
        <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={saving} disabled={saving || !form.name.trim() || (form.isFloat && (!form.holderId || !form.imprestAmount))} onClick={submit}>
          {account ? "Save" : "Add the account"}
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <Field label="Name" htmlFor="ma-name">
          <Input id="ma-name" value={form.name} placeholder="CBZ current, USD" onChange={(event) => set("name", event.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <Field label="Kind" htmlFor="ma-kind">
            <Select id="ma-kind" value={form.kind} onChange={(event) => set("kind", event.target.value as AccountForm["kind"])}>
              <option value="BANK">Bank</option>
              <option value="MOBILE">Mobile money</option>
              <option value="CASH">Cash</option>
            </Select>
          </Field>
          <Field label="Currency" htmlFor="ma-currency">
            <Select id="ma-currency" value={form.currency} onChange={(event) => set("currency", event.target.value)}>
              {[...new Set([data.baseCurrency, "USD", "ZWG", "ZAR"])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {form.kind !== "CASH" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={form.kind === "MOBILE" ? "Provider" : "Bank"} htmlFor="ma-bank" optional>
              <Input id="ma-bank" value={form.bankName} placeholder={form.kind === "MOBILE" ? "EcoCash" : "CBZ"} onChange={(event) => set("bankName", event.target.value)} />
            </Field>
            <Field label={form.kind === "MOBILE" ? "Merchant number" : "Account number"} htmlFor="ma-number" optional>
              <Input id="ma-number" value={form.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} />
            </Field>
          </div>
        ) : (
          <Check checked={form.isFloat} onCheckedChange={(value) => set("isFloat", value)} label="A petty cash float, held by one person and topped up to an amount" />
        )}
        {form.kind === "CASH" && form.isFloat ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
            <Field label="Held by" htmlFor="ma-holder">
              <Select id="ma-holder" value={form.holderId} onChange={(event) => set("holderId", event.target.value)}>
                <option value="">Choose a person</option>
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topped up to" htmlFor="ma-imprest">
              <Input id="ma-imprest" inputMode="decimal" value={form.imprestAmount} onChange={(event) => set("imprestAmount", event.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          </div>
        ) : null}
        <Field label="Posts to" htmlFor="ma-ledger" help="Left empty, the chart's own account for its kind.">
          <Select id="ma-ledger" value={form.ledgerAccountId} onChange={(event) => set("ledgerAccountId", event.target.value)}>
            <option value="">The usual account</option>
            {data.ledgers.map((ledger) => (
              <option key={ledger.id} value={ledger.id}>
                {ledger.label}
              </option>
            ))}
          </Select>
        </Field>
        {!account ? (
          <Field label="Balance today" htmlFor="ma-opening" optional help="What it holds now, as its opening balance.">
            <Input id="ma-opening" inputMode="decimal" value={form.openingBalance} onChange={(event) => set("openingBalance", event.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
        ) : null}
        {form.kind !== "CASH" ? (
          <>
            <Field label="Held in the name of" htmlFor="ma-held" optional help="Printed on quotes and invoices with the number.">
              <Input id="ma-held" value={form.accountName} onChange={(event) => set("accountName", event.target.value)} />
            </Field>
            <Switch checked={form.showOnDocuments} onCheckedChange={(value) => set("showOnDocuments", value)} label="Print it on quotes and invoices" />
          </>
        ) : null}
        <Switch checked={form.isDefault} onCheckedChange={(value) => set("isDefault", value)} label="Payments go here unless someone chooses another" />
        {account ? <Switch checked={form.active} onCheckedChange={(value) => set("active", value)} label="In use" /> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ── Accountant export ───────────────────────────────────────────────── */

export type AccountantExportData = { yearToDate: { from: string; to: string }; booksStart: string | null; baseCurrency: string; today: string; history: Array<{ id: string; at: string; by: string; image: string | null; from: string | null; to: string | null }> };

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Management › Company › Accountant export (books-final §3.2, §8 P5; no board
 * of its own): the trial balance, the general ledger and the profit and loss,
 * balance sheet and cash flow for a period, as one Excel workbook. Core: it
 * needs no Books screens.
 */
export function AccountantExportView({ data, from, to, onFrom, onTo, href, onDownloaded }: { data: AccountantExportData; from: string; to: string; onFrom: (from: string) => void; onTo: (to: string) => void; href: string; onDownloaded: () => void }) {
  const [y] = data.today.split("-").map(Number);
  const lastYear = { from: `${Number(data.yearToDate.from.slice(0, 4)) - 1}${data.yearToDate.from.slice(4)}`, to: new Date(Date.parse(`${data.yearToDate.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) };
  const presets = [
    { key: "ytd", label: "This financial year so far", ...data.yearToDate },
    { key: "last", label: "Last financial year", ...lastYear },
    ...(data.booksStart ? [{ key: "all", label: "Since the books started", from: data.booksStart, to: data.today }] : []),
  ];
  const valid = from && to && from <= to;
  const link = React.useRef<HTMLAnchorElement>(null);
  return (
    <KitPage
      title="Accountant export"
      mark={<Icon name="export" />}
      actions={
        <Button variant="primary" icon="export" shortcut="D" disabled={!valid} onClick={() => link.current?.click()}>
          Download the export
        </Button>
      }
    >
      <a ref={link} hidden href={href} download onClick={() => window.setTimeout(onDownloaded, 1500)}>
        Download
      </a>
      <Finding fact={`The books from ${dayLabel(from)} to ${dayLabel(to)}, in ${data.baseCurrency}, as one workbook.`} rest="The trial balance, the general ledger, and the profit and loss, balance sheet and cash flow." />
      <div className="form-sec">
        <header>
          <h2>Which period</h2>
          <p>The trial balance is as at the last day; the rest cover the period.</p>
        </header>
        <div className="body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presets.map((preset) => (
              <Button key={preset.key} variant={preset.from === from && preset.to === to ? undefined : "quiet"} aria-pressed={preset.from === from && preset.to === to} onClick={() => (onFrom(preset.from), onTo(preset.to))}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="From" htmlFor="ae-from">
              <Input id="ae-from" type="date" value={from} max={to} onChange={(event) => onFrom(event.target.value)} />
            </Field>
            <Field label="To" htmlFor="ae-to" error={valid ? null : "The first day comes after the last."}>
              <Input id="ae-to" type="date" value={to} max={`${y + 1}-12-31`} onChange={(event) => onTo(event.target.value)} />
            </Field>
          </div>
        </div>
      </div>
      <div className="form-sec">
        <header>
          <h2>Sent before</h2>
          <p>Each download, with who and the period.</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          {data.history.length === 0 ? (
            <span className="muted">Nobody has downloaded one yet.</span>
          ) : (
            data.history.map((row) => (
              <div key={row.id} className="setting">
                <span className="t">
                  <b>
                    <Person name={row.by} src={row.image} />
                  </b>
                  <span>{row.from && row.to ? `${dayLabel(row.from)} to ${dayLabel(row.to)}` : "—"}</span>
                </span>
                <span className="muted">{new Date(row.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" })}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <p className="muted">Amounts are in {data.baseCurrency}, the base currency; a document in another currency is at the rate it froze.</p>
    </KitPage>
  );
}
