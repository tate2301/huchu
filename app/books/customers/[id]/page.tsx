"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { BkState, BkTabs } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage, Cents } from "@/components/books/figures";
import { Avatar, Button, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { Ask } from "@/lib/workspace/ask";
import type { CustomerView } from "@/lib/books/customers-view";
import { money, shortDay } from "@/lib/books/format";
import { statementMessage, whatsappLink, whatsappNumber } from "@/lib/books/statement-message";

type Page = CustomerView & { can: { invoice: boolean; pay: boolean; delete: boolean } };
type Tab = "activity" | "invoices" | "payments" | "statement" | "details";

const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const STATUS: Record<string, { tone: "info" | "success" | "void" | "plain"; label: string }> = {
  DRAFT: { tone: "plain", label: "Draft" },
  ISSUED: { tone: "info", label: "Issued" },
  PAID: { tone: "success", label: "Paid" },
  VOIDED: { tone: "void", label: "Void" },
};

function Boxed({ children }: { children: React.ReactNode }) {
  return <div className="bk-bleed" style={{ marginTop: 16 }}>{children}</div>;
}

const withYear = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** A date the statement is read between: the button names it, pressing it opens the date picker. */
function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (day: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="chipsel is-set"
        onClick={() => {
          const field = input.current;
          if (!field) return;
          if (typeof field.showPicker === "function") field.showPicker();
          else field.focus();
        }}
      >
        {label} <b>{withYear(value)}</b>
      </button>
      <input
        ref={input}
        type="date"
        aria-label={label}
        value={value}
        tabIndex={-1}
        onChange={(event) => (event.target.value ? onChange(event.target.value) : undefined)}
        style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
      />
    </span>
  );
}

function Statement({ data, onPeriod }: { data: Page; onPeriod: (from: string, to: string) => void }) {
  const { statement } = data;
  return (
    <>
      <div className="ws-tools" style={{ boxShadow: "none" }}>
        <DateFilter label="From" value={statement.from} onChange={(day) => onPeriod(day, day > statement.to ? day : statement.to)} />
        <DateFilter label="To" value={statement.to} onChange={(day) => onPeriod(day < statement.from ? day : statement.from, day)} />
      </div>
      <div className="bk-bleed">
        <table className="table" aria-label="Statement">
          <colgroup>
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th>Number</th>
              <th className="num">Charged</th>
              <th className="num">Paid</th>
              <th className="num">Balance, {data.currency}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">{shortDay(statement.from)}</td>
              <td className="muted">Opening balance</td>
              <td />
              <td className="num" />
              <td className="num" />
              <td className="num">
                <Cents value={statement.opening} currency={data.currency} />
              </td>
            </tr>
            {statement.lines.map((line, index) => (
              <tr key={index}>
                <td className="muted">{line.date}</td>
                <td>{line.what}</td>
                <td>
                  {line.href ? (
                    <Link className="ref" href={line.href}>
                      {line.document}
                    </Link>
                  ) : (
                    <span className="ref">{line.document}</span>
                  )}
                </td>
                <td className="num">{line.invoiced !== null ? <Cents value={line.invoiced} currency={data.currency} /> : null}</td>
                <td className="num">{line.paid !== null ? <Cents value={line.paid} currency={data.currency} /> : null}</td>
                <td className="num">
                  <Cents value={line.balance} currency={data.currency} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tot">
              <td />
              <td>Closing balance</td>
              <td />
              <td className="num">
                <Cents value={statement.invoiced} currency={data.currency} />
              </td>
              <td className="num">
                <Cents value={statement.paid} currency={data.currency} />
              </td>
              <td className="num">
                <Cents value={statement.closing} currency={data.currency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
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
  const { toast } = useToast();
  const client = useQueryClient();
  const [removing, setRemoving] = React.useState<"delete" | "archive" | null>(null);
  const ask: Ask | null = !data || !removing
    ? null
    : removing === "delete"
      ? { title: `Delete ${data.name}?`, body: "They are removed for good. A customer with invoices, payments or quotes cannot be deleted: archive them instead.", keep: "Keep customer", go: "Delete customer", fill: "bad" }
      : { title: `Archive ${data.name}?`, body: "They leave the lists and forms. Their invoices and payments stay as they are, and you can find them in the records.", keep: "Keep customer", go: "Archive customer", fill: "action" };
  const remove = async () => {
    if (!removing || !data) return;
    try {
      await fetchJson(`/api/books/customers/${id}`, { method: "DELETE", body: JSON.stringify({ archive: removing === "archive" }) });
    } catch (error) {
      throw new Error(getApiErrorMessage(error, "Check the connection and try again."));
    }
    toast({ title: removing === "delete" ? `${data.name} is deleted` : `${data.name} is archived`, variant: "success" });
    await client.invalidateQueries({ queryKey: ["books"] });
    router.push("/books/customers");
  };

  const [printing, setPrinting] = React.useState(false);
  /** The statement as a PDF file, for the period on screen: downloaded, never the open page printed. */
  const downloadStatement = async () => {
    if (!data || printing) return;
    setPrinting(true);
    try {
      const response = await fetch(`/api/books/customers/${id}/statement?from=${data.statement.from}&to=${data.statement.to}`);
      if (!response.ok) throw new Error("The statement could not be made.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `statement-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${data.statement.to}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "The statement did not download", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };
  const send = data && whatsappNumber(data.contact.phone) ? () => window.open(whatsappLink(whatsappNumber(data.contact.phone)!, statementMessage(data)), "_blank", "noopener") : null;

  return (
    <>
      <PageChrome
        title={data?.name ?? "Customer"}
        backHref="/books/customers"
        backLabel="Customers"
        primary={send ? { label: "Send statement", icon: "whatsapp", shortcut: "S", onClick: send } : null}
      >
        {data ? (
          <Kit contents>
            <Button icon="print" busy={printing} disabled={printing} onClick={downloadStatement}>
              Print statement
            </Button>
            {data.can.pay ? (
              <ButtonLink icon="payments" shortcut="R" href={`/books/payments/new?customer=${id}`}>
                Record a payment
              </ButtonLink>
            ) : null}
            <MenuButton
              iconOnly
              icon="more"
              iconEnd={undefined}
              align="end"
              label="More actions"
              aria-label="More actions"
              items={[
                ...(data.can.invoice ? [{ key: "invoice", icon: "plus" as const, label: "New invoice", onSelect: () => router.push(`/books/invoices/new?customer=${id}`) }] : []),
                { key: "crm", icon: "users", label: "Their payments", onSelect: () => router.push(`/books/payments?customer=${id}`) },
                ...(data.can.invoice ? [{ separator: true as const }, { key: "archive", icon: "keep" as const, label: "Archive customer", onSelect: () => setRemoving("archive") }] : []),
                ...(data.can.delete ? [{ key: "delete", icon: "x" as const, danger: true, label: "Delete customer", onSelect: () => setRemoving("delete") }] : []),
              ]}
            />
          </Kit>
        ) : null}
      </PageChrome>
      {ask ? <ConfirmDialog ask={ask} open onOpenChange={(open) => (open ? undefined : setRemoving(null))} onConfirm={remove} /> : null}
      {data ? (
        <div className="bk bk-rec">
          <div className="bk-main">
            <div className="bk-hd">
              <div className="tr">
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Avatar name={data.name} src={data.image} size={32} />
                  <div className="bk-title">{data.name}</div>
                </span>
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
            <BkTabs<Tab>
                className="bk-rtabs"
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
            {tab === "statement" ? <Statement data={data} onPeriod={(from, to) => setPeriod({ from, to })} /> : null}
            {tab === "activity" ? (
              <Boxed>
                <ol className="bk-tl">
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
