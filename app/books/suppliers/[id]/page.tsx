"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { BkState, BkTabs } from "@/components/books/bk-list";
import { Bleed, Callout, FactTable, History, RailSection, RecordHead, Section, Strip } from "@/components/books/bk-record";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, ButtonGroup, ButtonLink, Check, Drawer, Empty, Field, Input, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";
import { SUPPLIER_TABS, type SupplierRecordPage, type SupplierTab } from "@/lib/books/suppliers";

const PILL = { owed: ["pill-info", "Owed"], overdue: ["pill-warn", "Overdue"], "paid-up": ["pill-ok", "Paid up"] } as const;
const STATE_TONE: Record<string, "info" | "success" | "warning" | "void" | "plain"> = { Draft: "plain", "To pay": "info", "Part paid": "info", Overdue: "warning", Paid: "success", Void: "void", "To approve": "warning", Approved: "info" };
const TAB_LABEL: Record<SupplierTab, string> = { activity: "Activity", bills: "Bills", payments: "Payments", statement: "Statement", tax: "Tax" };
const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * One supplier in Books (design/core-modules/boards/view/BkSupplier.html):
 * what is owed them and how late, paid this year and on order; then Activity,
 * Bills, Payments, the Statement with its running balance, and Tax (their VAT
 * number, TIN and the FDMS checks on their invoices; their ITF263, recorded
 * from the copy they send, and this year's withholding, D17). Pay (P) pays
 * their open bills; the caret holds the rest.
 */
function SupplierRecord() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const search = useSearchParams();
  const asked = search.get("tab") as SupplierTab | null;
  const [tab, setTab] = React.useState<SupplierTab>(asked && SUPPLIER_TABS.includes(asked) ? asked : "activity");
  const [period, setPeriod] = React.useState<{ from: string; to: string } | null>(null);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const client = useQueryClient();
  const { toast } = useToast();
  const [recording, setRecording] = React.useState(false);
  const [itf, setItf] = React.useState({ number: "", expires: "", agent: false });
  const [itfError, setItfError] = React.useState<string | null>(null);
  const saveItf = async () => {
    try {
      await fetchJson(`/api/books/suppliers/${id}`, { method: "PATCH", body: JSON.stringify({ itf263Number: itf.number.trim() || null, itf263ExpiresAt: itf.expires || null, isVatWithholdingAgent: itf.agent }) });
      setRecording(false);
      toast({ title: "Their tax clearance is recorded", variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
    } catch (error) {
      setItfError(getApiErrorMessage(error, "Check the connection and try again."));
    }
  };

  const supplier = useQuery({
    queryKey: ["books", "supplier", id, period],
    queryFn: () => fetchJson<SupplierRecordPage>(`/api/books/suppliers/${id}${period ? `?from=${period.from}&to=${period.to}` : ""}`),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const data = supplier.data;
  const notFound = supplier.error instanceof ApiError && supplier.error.status === 404;
  const c = data?.currency ?? "USD";

  const openItf = () => {
    setItf({ number: data?.itf263.number ?? "", expires: data?.itf263.expiresIso ?? "", agent: data?.vatAgent ?? false });
    setItfError(null);
    setRecording(true);
  };
  const askHref = data
    ? `https://wa.me/${(data.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Good day. Please send us your current ITF263 tax clearance${data.itf263.state === "Expired" ? `: the one we have expired on ${data.itf263.expires}` : ""}. Without it we must withhold 30% of each payment for ZIMRA.`)}`
    : "#";

  const menu: MenuEntry[] = data
    ? [
        { key: "statement", icon: "print", label: "Print the statement", onSelect: () => (setTab("statement"), window.setTimeout(() => window.print(), 50)) },
        ...(data.can.bill ? [{ key: "bill", icon: "docs" as const, label: "New bill", onSelect: () => router.push("/books/bills/new") }] : []),
        ...(data.can.order ? [{ key: "order", icon: "list" as const, label: "New order", onSelect: () => router.push("/books/orders/new") }] : []),
        { key: "bills", icon: "docs", label: "Their bills", onSelect: () => router.push(`/books/bills?supplier=${id}`) },
        { key: "itf263", icon: "file", label: "Record their ITF263", onSelect: () => openItf() },
      ]
    : [];

  return (
    <>
      <PageChrome title={data?.name ?? "Supplier"} backHref="/books/suppliers" backLabel="Suppliers">
        {data ? (
          <Kit contents>
            {data.can.pay && data.tiles.owed > 0.005 ? (
              <ButtonGroup aria-label="Pay, and more">
                <ButtonLink variant="primary" icon="payments" shortcut="P" href={`/books/payments-made/new?supplier=${id}`}>
                  Pay
                </ButtonLink>
                <MenuButton variant="primary" iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
              </ButtonGroup>
            ) : (
              <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
            )}
          </Kit>
        ) : null}
      </PageChrome>
      {data ? (
        <div className="bk bk-rec">
          <div className="bk-main">
            <RecordHead title={data.name} pill={data.itf263.state !== "Valid" ? <span className="pill pill-warn">{data.itf263.state === "Expired" ? "ITF263 expired" : "No ITF263"}</span> : <span className={`pill ${PILL[data.state][0]}`}>{PILL[data.state][1]}</span>} line={[data.contact, data.delivers ? `Delivers ${data.delivers}` : `Pays ${data.terms.toLowerCase()}`]} />
            <Strip
              tiles={[
                { label: "We owe", value: money(data.tiles.owed, c), note: data.tiles.late ? `${data.tiles.late} ${data.tiles.late === 1 ? "day" : "days"} late` : "Nothing late" },
                { label: "Paid this year", value: money(data.tiles.paidYear, c), note: data.tiles.withheld > 0 ? "Before withholding" : data.tiles.payments === 1 ? "1 payment" : `${data.tiles.payments} payments` },
                { label: "Withheld this year", value: money(data.tiles.withheld, c), note: data.tiles.certificates === 1 ? "1 certificate" : `${data.tiles.certificates} certificates` },
                { label: "On order", value: money(data.tiles.onOrder, c), note: data.tiles.firstOrder ?? "Nothing open" },
              ]}
            />
            <BkTabs<SupplierTab>
              className="bk-rtabs"
              label="Supplier views"
              value={tab}
              onChange={setTab}
              items={SUPPLIER_TABS.map((value) => ({ value, label: TAB_LABEL[value], count: value === "bills" ? data.bills.length : value === "payments" ? data.payments.length : undefined }))}
            />
            {tab === "activity" ? (
              <History
                items={
                  data.statement.lines.length
                    ? [...data.statement.lines].reverse().map((line) => ({ tone: line.billed ? ("in" as const) : ("ok" as const), text: `${line.document}: ${line.detail.toLowerCase()}, ${money(line.billed ?? line.paid ?? 0, c)}`, when: line.date }))
                    : [{ tone: "" as const, text: "Nothing in the last three months.", when: "" }]
                }
              />
            ) : null}
            {tab === "bills" ? (
              <Bleed>
                <table className="table" aria-label="Bills">
                  <colgroup>
                    <col style={{ width: 120 }} />
                    <col style={{ width: 80 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Date</th>
                      <th>Their invoice</th>
                      <th>FDMS</th>
                      <th>State</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bills.map((bill) => (
                      <tr key={bill.id}>
                        <td>
                          <Link className="ref" href={`/books/bills/${bill.id}`}>
                            {bill.number}
                          </Link>
                        </td>
                        <td className="muted">{bill.date}</td>
                        <td className="mono truncate">{bill.fti ?? "—"}</td>
                        <td>
                          <BkState tone={bill.fdms === "Valid" ? "success" : bill.fdms === "Not valid" ? "danger" : "plain"}>{bill.fdms}</BkState>
                        </td>
                        <td>
                          <BkState tone={STATE_TONE[bill.state] ?? "plain"}>{bill.state}</BkState>
                        </td>
                        <td className="num">{bill.balance > 0.005 ? money(bill.balance, c) : <span className="muted">{money(bill.total, c)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Bleed>
            ) : null}
            {tab === "payments" ? (
              <Bleed>
                <table className="table" aria-label="Payments">
                  <colgroup>
                    <col style={{ width: 120 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 120 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Date</th>
                      <th>Bill</th>
                      <th>From</th>
                      <th>State</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <span className={payment.number === "Draft" ? "muted" : "ref"}>{payment.number}</span>
                        </td>
                        <td className="muted">{payment.date}</td>
                        <td>{payment.bill ? <Link className="ref" href={`/books/bills/${payment.bill.id}`}>{payment.bill.number}</Link> : <span className="muted">—</span>}</td>
                        <td className="truncate muted">{payment.from ?? "—"}</td>
                        <td>
                          <BkState tone={STATE_TONE[payment.state] ?? "plain"}>{payment.state}</BkState>
                        </td>
                        <td className="num" style={payment.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                          {money(payment.amount, c)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Bleed>
            ) : null}
            {tab === "statement" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "20px 24px 0" }}>
                  <span className="muted">
                    {shortDay(data.statement.from)} to {shortDay(data.statement.to)} {data.statement.to.slice(0, 4)}
                  </span>
                  <Input type="date" aria-label="From" value={from || data.statement.from} onChange={(event) => setFrom(event.target.value)} style={{ width: 150 }} />
                  <Input type="date" aria-label="To" value={to || data.statement.to} onChange={(event) => setTo(event.target.value)} style={{ width: 150 }} />
                  <Button variant="quiet" onClick={() => setPeriod({ from: from || data.statement.from, to: to || data.statement.to })}>
                    Show
                  </Button>
                  <span style={{ marginLeft: "auto" }}>
                    <Button variant="quiet" icon="print" onClick={() => window.print()}>
                      Print
                    </Button>
                  </span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Bleed>
                    <table className="table" aria-label="Statement">
                      <colgroup>
                        <col style={{ width: 80 }} />
                        <col style={{ width: 120 }} />
                        <col />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 130 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Document</th>
                          <th>Detail</th>
                          <th className="num">Billed</th>
                          <th className="num">Paid</th>
                          <th className="num">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="muted">{shortDay(data.statement.from)}</td>
                          <td />
                          <td className="muted">Owed before</td>
                          <td />
                          <td />
                          <td className="num">{plain(data.statement.opening)}</td>
                        </tr>
                        {data.statement.lines.map((line, index) => (
                          <tr key={index}>
                            <td className="muted">{line.date}</td>
                            <td>{line.href ? <Link className="ref" href={line.href}>{line.document}</Link> : <span className="ref">{line.document}</span>}</td>
                            <td className="truncate muted">{line.detail}</td>
                            <td className="num">{line.billed !== null ? plain(line.billed) : ""}</td>
                            <td className="num">{line.paid !== null ? plain(line.paid) : ""}</td>
                            <td className="num">{plain(line.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="tot">
                          <td colSpan={5}>Owed on {shortDay(data.statement.to)}</td>
                          <td className="num">{money(data.statement.closing, c)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </Bleed>
                </div>
              </>
            ) : null}
            {tab === "tax" ? (
              <>
              {data.itf263.state !== "Valid" ? (
                <Callout
                  icon="warn"
                  action={
                    <a className="btn btn-sm" href={askHref} target="_blank" rel="noreferrer">
                      Ask for it
                    </a>
                  }
                >
                  <b>{data.itf263.state === "Expired" ? `No valid ITF263 since ${data.itf263.expires?.replace(/ \d{4}$/, "")}.` : "No ITF263 on file."}</b> Every payment to them withholds 30%.
                </Callout>
              ) : null}
              <Section id="s1" title="Tax clearance, ITF263">
                <FactTable
                  label="ITF263"
                  rows={[
                    ["Number", data.itf263.number ? <span className="mono">ITF263 {data.itf263.number}</span> : "None on file"],
                    ["Valid", data.itf263.state === "None" ? "—" : data.itf263.expires ? `${data.itf263.state === "Expired" ? "Expired" : "To"} ${data.itf263.expires}` : "No expiry recorded"],
                    ["Record", <Button key="r" size="sm" icon="edit" onClick={openItf}>Record their ITF263</Button>],
                  ]}
                />
              </Section>
              <Section id="s2" title="Withholding this year" sum={data.tiles.withheld > 0 ? `${money(data.tiles.withheld, c)} held` : undefined}>
                {data.withholding.length === 0 ? (
                  <p className="muted" style={{ padding: "0 24px 24px" }}>Nothing withheld from them this year.</p>
                ) : (
                  <Bleed>
                    <table className="table" aria-label="Withholding">
                      <colgroup>
                        <col style={{ width: 120 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 140 }} />
                        <col style={{ width: 130 }} />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Payment</th>
                          <th>Bill</th>
                          <th className="num">Gross</th>
                          <th className="num">Withheld, 30%</th>
                          <th>Certificate</th>
                          <th>To ZIMRA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.withholding.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <span className="ref">{row.number}</span>
                            </td>
                            <td>{row.bill ? <Link className="ref" href={`/books/bills/${row.bill.id}`}>{row.bill.number}</Link> : <span className="muted">—</span>}</td>
                            <td className="num">{money(row.gross, c)}</td>
                            <td className="num">{row.withheld > 0 ? money(row.withheld, c) : <span className="muted">When paid</span>}</td>
                            <td>{row.certificate ? <span className="ref">{row.certificate}</span> : <span className="muted">{row.state === "Paid" ? "Not issued" : "Drafted"}</span>}</td>
                            <td>
                              <BkState tone={STATE_TONE[row.state] ?? "plain"}>{row.state === "Paid" ? `Paid ${row.date}` : row.state}</BkState>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="tot">
                          <td>{new Date().getFullYear()}</td>
                          <td />
                          <td className="num">{money(data.withholding.reduce((sum, row) => sum + row.gross, 0), c)}</td>
                          <td className="num">{money(data.withholding.reduce((sum, row) => sum + row.withheld, 0), c)}</td>
                          <td />
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </Bleed>
                )}
              </Section>
              <section aria-labelledby="s3">
                <div className="group-head">
                  <h2 id="s3">VAT</h2>
                </div>
                <FactTable
                  label="VAT"
                  rows={[
                    ["VAT number", data.tax.vatNumber ? `${data.tax.vatNumber}, registered` : "Not registered"],
                    ["TIN", data.tax.tin ?? "Not on file"],
                    ["Their invoices", data.tax.billsWithTax ? `${data.tax.valid} of ${data.tax.billsWithTax} valid on FDMS${data.tax.checked > data.tax.valid ? `, ${data.tax.checked - data.tax.valid} not valid` : ""}` : "None with VAT yet"],
                    ["VAT withholding", data.vatAgent ? "A withholding agent" : "Not an agent"],
                  ]}
                />
              </section>
              </>
            ) : null}
          </div>
          <aside className="rail" aria-label={`About ${data.name}`}>
            <RailSection title="Contact" rows={[["Phone", data.phone ?? "—"], ["Address", data.address ?? "—"]]} />
            <RailSection title="Terms" rows={[["Terms", data.terms], ["Currency", c], ["Pay to", data.payTo ?? "Not on file"], ...(data.supplies ? ([["Supplies", data.supplies]] as Array<[string, string]>) : [])]} />
          </aside>
        </div>
      ) : notFound ? (
        <Empty icon="store" title="There is no such supplier here">
          They may belong to another workspace. Suppliers lists every one.
        </Empty>
      ) : supplier.isError ? (
        <BooksError what="This supplier" onRetry={() => supplier.refetch()} />
      ) : (
        <BooksLoading />
      )}
      <Drawer
        open={recording}
        onOpenChange={setRecording}
        title="Their ITF263"
        footer={
          <>
            <Button variant="quiet" onClick={() => setRecording(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" onClick={saveItf}>
              Save
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <Field label="Number" htmlFor="itf-number" help="As on the copy they sent.">
            <Input id="itf-number" value={itf.number} onChange={(event) => setItf({ ...itf, number: event.target.value })} />
          </Field>
          <Field label="Valid to" htmlFor="itf-expires" error={itfError}>
            <Input id="itf-expires" type="date" value={itf.expires} onChange={(event) => setItf({ ...itf, expires: event.target.value })} />
          </Field>
          <Check checked={itf.agent} onCheckedChange={(agent) => setItf({ ...itf, agent })} label="They withhold VAT as an appointed agent" />
        </div>
      </Drawer>
    </>
  );
}

/** Books → Bills & spending → one supplier (design/core-modules/boards/view/BkSupplier.html). */
export default function BooksSupplierPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <SupplierRecord />
      </React.Suspense>
    </BooksPage>
  );
}
