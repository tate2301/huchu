"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { BkState, BkTabs } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, ButtonLink, Empty, Input, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { ApiError, fetchJson } from "@/lib/api-client";
import type { CustomerView } from "@/lib/books/customers-view";
import { money, shortDay } from "@/lib/books/format";

type Page = CustomerView & { can: { invoice: boolean; pay: boolean } };
type Tab = "activity" | "invoices" | "payments" | "statement" | "details";

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const STATUS: Record<string, { tone: "info" | "success" | "void" | "plain"; label: string }> = {
  DRAFT: { tone: "plain", label: "Draft" },
  ISSUED: { tone: "info", label: "Issued" },
  PAID: { tone: "success", label: "Paid" },
  VOIDED: { tone: "void", label: "Void" },
};

function Boxed({ children }: { children: React.ReactNode }) {
  return <div style={{ margin: "16px 24px 0", borderRadius: 10, boxShadow: "var(--shadow-ring)", overflowX: "auto" }}>{children}</div>;
}

function Statement({ data, onPeriod }: { data: Page; onPeriod: (from: string, to: string) => void }) {
  const { statement, currency } = data;
  const [from, setFrom] = React.useState(statement.from);
  const [to, setTo] = React.useState(statement.to);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 24px 0" }}>
        <MenuButton
          className="chipsel is-set"
          label="Period"
          items={[
            { key: "this", label: "This month so far", onSelect: () => onPeriod(`${statement.to.slice(0, 7)}-01`, statement.to) },
            { key: "three", label: "The last three months", onSelect: () => onPeriod(statement.from, statement.to) },
            { key: "year", label: "This year", onSelect: () => onPeriod(`${statement.to.slice(0, 4)}-01-01`, statement.to) },
          ]}
        >
          Period <b>{`${shortDay(statement.from)} to ${shortDay(statement.to)} ${statement.to.slice(0, 4)}`}</b>
        </MenuButton>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Input type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} style={{ width: 150 }} />
          <Input type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} style={{ width: 150 }} />
          <Button variant="quiet" onClick={() => onPeriod(from, to)}>
            Show
          </Button>
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <ButtonLink variant="quiet" icon="print" href={`/books/statements?customers=${data.id}`} target="_blank">
            Download PDF
          </ButtonLink>
        </span>
      </div>
      <Boxed>
        <table className="table" aria-label="Statement">
          <colgroup>
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Document</th>
              <th className="num">Invoiced</th>
              <th className="num">Paid</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">{shortDay(statement.from)}</td>
              <td className="muted">Opening balance</td>
              <td className="num" />
              <td className="num" />
              <td className="num">{plain(statement.opening)}</td>
            </tr>
            {statement.lines.map((line, index) => (
              <tr key={index}>
                <td className="muted">{line.date}</td>
                <td>
                  <span className="cell-lead">
                    {line.href ? <Link href={line.href}>{line.document}</Link> : line.document} <span className="sub2">{line.detail}</span>
                  </span>
                </td>
                <td className="num">{line.invoiced !== null ? plain(line.invoiced) : ""}</td>
                <td className="num">{line.paid !== null ? plain(line.paid) : ""}</td>
                <td className="num">{plain(line.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td>{shortDay(statement.to)}</td>
              <td>Closing balance</td>
              <td className="num">{plain(statement.invoiced)}</td>
              <td className="num">{plain(statement.paid)}</td>
              <td className="num">{plain(statement.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </Boxed>
      <p className="bk-note" style={{ paddingTop: 12 }}>
        In {currency}. Invoices, payments, credit notes and write-offs, as the customer is sent it.
      </p>
    </>
  );
}

function CustomerRecord() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params?.id ?? "";
  const [tab, setTab] = React.useState<Tab>((search.get("tab") as Tab) || "statement");
  const [period, setPeriod] = React.useState<{ from: string; to: string } | null>(null);
  const query = period ? `?from=${period.from}&to=${period.to}` : "";
  const customer = useQuery({
    queryKey: ["books", "customer", id, query],
    queryFn: () => fetchJson<Page>(`/api/books/customers/${id}${query}`),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const data = customer.data;
  const notFound = customer.error instanceof ApiError && customer.error.status === 404;

  return (
    <>
      <PageChrome
        title={data?.name ?? "Customer"}
        backHref="/books/customers"
        backLabel="Customers"
        primary={data?.can.invoice ? { label: "New invoice", icon: "plus", shortcut: "N", href: `/books/invoices/new?customer=${id}` } : null}
      >
        {data ? (
          <Kit contents>
            <MenuButton
              iconOnly
              icon="more"
              iconEnd={undefined}
              align="end"
              label="More actions"
              aria-label="More actions"
              items={[
                ...(data.can.pay ? [{ key: "pay", icon: "payments" as const, label: "Record a payment", onSelect: () => router.push(`/books/payments/new?customer=${id}`) }] : []),
                { key: "statement", icon: "print", label: "Print the statement", onSelect: () => window.open(`/books/statements?customers=${id}`, "_blank", "noopener") },
                { key: "crm", icon: "users", label: "Their payments", onSelect: () => router.push(`/books/payments?customer=${id}`) },
              ]}
            />
          </Kit>
        ) : null}
      </PageChrome>
      {data ? (
        <div className="bk bk-rec">
          <div className="bk-main">
            <div className="bk-hd">
              <div className="tr">
                <div className="bk-title">{data.name}</div>
              </div>
              <div className="ml">
                {data.line.map((item, index) => (
                  <React.Fragment key={item}>
                    {index ? <i>·</i> : null}
                    <span>{item}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="bk-strip">
              <div className="kstrip" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                <div className="kt">
                  <span className="kt-l">Owes</span>
                  <span className="kt-v">{money(data.tiles.owes, data.currency)}</span>
                  <span className="kt-n">{data.tiles.nextDue ? `Due ${data.tiles.nextDue}` : "Nothing due"}</span>
                </div>
                <div className="kt">
                  <span className="kt-l">Overdue</span>
                  <span className="kt-v">{money(data.tiles.overdue, data.currency)}</span>
                  <span className="kt-n">{data.terms ? `Pays in ${data.terms}` : "No terms yet"}</span>
                </div>
                <div className="kt">
                  <span className="kt-l">Paid this year</span>
                  <span className="kt-v">{money(data.tiles.paidYear, data.currency)}</span>
                  <span className="kt-n">{data.tiles.paymentsYear === 1 ? "1 payment" : `${data.tiles.paymentsYear} payments`}</span>
                </div>
              </div>
            </div>
            <div className="bk-rtabs">
              <BkTabs<Tab>
                label="Customer views"
                value={tab}
                onChange={setTab}
                items={[
                  { value: "activity", label: "Activity" },
                  { value: "invoices", label: "Invoices", count: data.invoices.length },
                  { value: "payments", label: "Payments", count: data.payments.length },
                  { value: "statement", label: "Statement" },
                  { value: "details", label: "Details" },
                ]}
              />
            </div>
            {tab === "statement" ? <Statement data={data} onPeriod={(from, to) => setPeriod({ from, to })} /> : null}
            {tab === "activity" ? (
              <Boxed>
                <ol className="bk-tl" style={{ padding: "4px 16px" }}>
                  {[...data.statement.lines].reverse().map((line, index) => (
                    <li key={index}>
                      <span className={line.paid ? "d ok" : "d in"} />
                      <span>
                        <b>{line.document}</b> {line.invoiced ? `invoiced ${money(line.invoiced, data.currency)}` : `${line.detail.toLowerCase()} ${money(line.paid ?? 0, data.currency)}`}
                      </span>
                      <time>{line.date}</time>
                    </li>
                  ))}
                  {data.statement.lines.length === 0 ? (
                    <li>
                      <span className="d" />
                      <span>Nothing in this period.</span>
                      <time />
                    </li>
                  ) : null}
                </ol>
              </Boxed>
            ) : null}
            {tab === "invoices" ? (
              <Boxed>
                <table className="table" aria-label="Invoices">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>State</th>
                      <th className="num">Total</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <Link className="ref" href={`/books/invoices/${invoice.id}`}>
                            {invoice.number}
                          </Link>
                        </td>
                        <td className="muted">{invoice.date}</td>
                        <td>
                          <BkState tone={STATUS[invoice.status]?.tone ?? "plain"}>{STATUS[invoice.status]?.label ?? invoice.status}</BkState>
                        </td>
                        <td className="num muted">{money(invoice.total, invoice.currency)}</td>
                        <td className="num">{invoice.balance > 0.005 ? money(invoice.balance, invoice.currency) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Boxed>
            ) : null}
            {tab === "payments" ? (
              <Boxed>
                <table className="table" aria-label="Payments">
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Date</th>
                      <th>For</th>
                      <th>Into</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <span className="ref">{payment.number}</span>
                        </td>
                        <td className="muted">{payment.date}</td>
                        <td>{payment.invoiceId ? <Link href={`/books/invoices/${payment.invoiceId}`}>{payment.forWhat}</Link> : <span className="muted">{payment.forWhat}</span>}</td>
                        <td className="muted">{payment.into}</td>
                        <td className="num" style={payment.voided ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                          {money(payment.amount, payment.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Boxed>
            ) : null}
            {tab === "details" ? (
              <div style={{ padding: "16px 24px 0" }}>
                <dl className="attrs" style={{ gridTemplateColumns: "140px minmax(0,1fr)", rowGap: 10 }}>
                  <dt>VAT number</dt>
                  <dd>{data.tax.vatNumber ?? "Not on file"}</dd>
                  <dt>TIN</dt>
                  <dd>{data.tax.tin ?? "Not on file"}</dd>
                  <dt>Address</dt>
                  <dd>{data.contact.address ?? "Not on file"}</dd>
                  <dt>Currency</dt>
                  <dd>{data.currency}</dd>
                </dl>
              </div>
            ) : null}
          </div>
          <aside className="rail" aria-label={`About ${data.name}`}>
            <section>
              <div className="sec-title">Contact</div>
              <dl className="attrs">
                <dt>Phone</dt>
                <dd>{data.contact.phone ?? "—"}</dd>
                <dt>Email</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{data.contact.email ?? "—"}</dd>
                <dt>Address</dt>
                <dd>{data.contact.address ?? "—"}</dd>
              </dl>
            </section>
            <section>
              <div className="sec-title">Terms</div>
              <dl className="attrs">
                <dt>Terms</dt>
                <dd>{data.terms ?? "None yet"}</dd>
                <dt>Currency</dt>
                <dd>{data.currency}</dd>
                <dt>VAT number</dt>
                <dd>{data.tax.vatNumber ?? "Not on file"}</dd>
                <dt>On account</dt>
                <dd>{money(data.onAccount, data.currency)}</dd>
              </dl>
            </section>
          </aside>
        </div>
      ) : notFound ? (
        <Empty icon="users" title="There is no such customer here">
          They may have been merged into another, or belong to another workspace. Customers lists every one.
        </Empty>
      ) : customer.isError ? (
        <BooksError what="This customer" onRetry={() => customer.refetch()} />
      ) : (
        <BooksLoading />
      )}
    </>
  );
}

/** Books → Sales → one customer (design/core-modules/boards/view/BkCustomer.html). The Statement tab is the one full-activity statement. */
export default function BooksCustomerPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <CustomerRecord />
      </React.Suspense>
    </BooksPage>
  );
}
