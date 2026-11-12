"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { RecordCustomerPaymentDrawer } from "@/components/books/bk-payment-drawers";
import { BooksFinding } from "@/components/books/figures";
import { Button, ButtonLink, Drawer, DrawerSection, Field, Input, Select } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";
import { statementMessage, whatsappLink, whatsappNumber } from "@/lib/books/statement-message";

type CustomerOverviewRow = {
  id: string;
  name: string;
  code: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  balance: number;
  overdue: number;
  openCount: number;
  oldestDate: string | null;
  lastPaid: string | null;
};

type OverviewResponse = {
  mode: "overview";
  currency: string;
  asOf: string;
  summary: {
    totalReceivables: number;
    totalOverdue: number;
    customersWithBalance: number;
    totalCustomers: number;
  };
  customers: CustomerOverviewRow[];
};

type StatementDetail = {
  id: string;
  name: string;
  code: string;
  contact: { phone: string | null; email: string | null; address: string | null };
  tax: { vatNumber: string | null; tin: string | null };
  whatsapp: string | null;
  currency: string;
  statement: {
    from: string;
    to: string;
    lines: Array<{
      date: string;
      document: string;
      detail: string;
      href: string | null;
      invoiced: number | null;
      paid: number | null;
      balance: number;
    }>;
    opening: number;
    closing: number;
    invoiced: number;
    paid: number;
  };
  ages: {
    "Not yet due": number;
    "1 to 30 days": number;
    "31 to 60 days": number;
    "61 to 90 days": number;
    "Over 90 days": number;
  };
  tiles: { owes: number; overdue: number; nextDue: string | null };
  outstandingLines: Array<{
    id: string;
    number: string;
    date: string;
    dueDate: string | null;
    total: number;
    balance: number;
    currency: string;
  }>;
};

type StatementResponse = {
  mode: "statement";
  branding: {
    displayName: string;
    legalName: string | null;
    tradingName: string | null;
    registrationNumber: string | null;
    taxNumber: string | null;
    vatNumber: string | null;
    email: string | null;
    phone: string | null;
    physicalAddress: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    bankAccounts: Array<{ currency: string; accountName: string; accountNumber: string }>;
  };
  asOf: string;
  statements: StatementDetail[];
};

export function BooksStatementsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const customerParam = searchParams.get("customers") || searchParams.get("id") || "";
  const initialCustomerId = customerParam.split(",")[0]?.trim() || null;

  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(initialCustomerId);
  const [periodPreset, setPeriodPreset] = React.useState<"outstanding" | "this-month" | "last-3-months" | "this-year" | "custom">("last-3-months");
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterMode, setFilterMode] = React.useState<"all" | "balance" | "overdue">("balance");

  // Drawers
  const [paymentDrawerOpen, setPaymentDrawerOpen] = React.useState(false);
  const [emailDrawerOpen, setEmailDrawerOpen] = React.useState(false);
  const [emailTo, setEmailTo] = React.useState("");
  const [emailSubject, setEmailSubject] = React.useState("");
  const [emailMessage, setEmailMessage] = React.useState("");
  const [sendingEmail, setSendingEmail] = React.useState(false);

  // Sync state with URL if URL changes
  React.useEffect(() => {
    setSelectedCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  // Overview query (all customers with balances)
  const overviewQuery = useQuery({
    queryKey: ["books", "statements", "overview"],
    queryFn: () => fetchJson<OverviewResponse>("/api/books/statements"),
  });

  // Selected statement query
  const statementQuery = useQuery({
    queryKey: ["books", "statements", selectedCustomerId, fromDate, toDate],
    queryFn: () => {
      const p = new URLSearchParams();
      if (selectedCustomerId) p.set("customers", selectedCustomerId);
      if (fromDate) p.set("from", fromDate);
      if (toDate) p.set("to", toDate);
      return fetchJson<StatementResponse>(`/api/books/statements?${p.toString()}`);
    },
    enabled: Boolean(selectedCustomerId),
  });

  const activeStatement = statementQuery.data?.statements?.[0] ?? null;
  const branding = statementQuery.data?.branding;

  // Prefill email details when statement loads
  React.useEffect(() => {
    if (activeStatement) {
      setEmailTo(activeStatement.contact.email || "");
      const company = branding?.displayName || "Accounts";
      setEmailSubject(`Statement of Account — ${activeStatement.name} [${company}]`);
      setEmailMessage(
        `Dear ${activeStatement.name},\n\nPlease find attached your latest statement of account showing all recent entries and open balance.\n\nThank you for your business.`,
      );
    }
  }, [activeStatement, branding]);

  const selectCustomer = (id: string | null) => {
    setSelectedCustomerId(id);
    if (id) {
      router.replace(`/books/statements?customers=${id}`);
    } else {
      router.replace("/books/statements");
    }
  };

  const handlePeriodChange = (preset: typeof periodPreset) => {
    setPeriodPreset(preset);
    const today = new Date().toISOString().slice(0, 10);
    if (preset === "this-month") {
      setFromDate(`${today.slice(0, 7)}-01`);
      setToDate(today);
    } else if (preset === "last-3-months") {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (preset === "this-year") {
      setFromDate(`${today.slice(0, 4)}-01-01`);
      setToDate(today);
    } else if (preset === "outstanding") {
      setFromDate("");
      setToDate(today);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedCustomerId || !emailTo.trim()) {
      toast({ title: "Email required", description: "Please enter a valid recipient email address.", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      await fetchJson(`/api/books/statements/${selectedCustomerId}/email`, {
        method: "POST",
        body: JSON.stringify({
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
          from: fromDate || undefined,
          toPeriod: toDate || undefined,
        }),
      });
      toast({ title: "Statement emailed", description: `Successfully sent statement to ${emailTo}` });
      setEmailDrawerOpen(false);
    } catch (err) {
      toast({ title: "Failed to send email", description: getApiErrorMessage(err), variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  // WhatsApp link generator
  const waPhone = activeStatement ? whatsappNumber(activeStatement.whatsapp || activeStatement.contact.phone) : null;
  const waMessage = activeStatement
    ? statementMessage({
        name: activeStatement.name,
        currency: activeStatement.currency,
        statement: {
          from: activeStatement.statement.from,
          to: activeStatement.statement.to,
          closing: activeStatement.statement.closing,
          lines: activeStatement.statement.lines.map((l) => ({
            date: l.date,
            document: l.document,
            invoiced: l.invoiced,
            paid: l.paid,
          })),
        },
      })
    : "";

  return (
    <>
      <style>{`
        @media print {
          nav, header, aside, .app-sidebar, .page-chrome, .bk-tools-bar, .no-print {
            display: none !important;
          }
          body, main, .bk-statement-container {
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .bk-statement-sheet {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <PageChrome
        title={activeStatement ? `Statement · ${activeStatement.name}` : "Statements"}
        backHref="/books/invoices"
        backLabel="Invoices"
      />

      <div className="bkd" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Top Control Bar */}
        <div
          className="bk-tools-bar no-print"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-12)",
            flexWrap: "wrap",
            padding: "var(--space-12) var(--space-24)",
            borderBottom: "1px solid var(--color-line)",
            background: "var(--color-surface)",
          }}
        >
          {selectedCustomerId ? (
            <>
              <Button variant="quiet" icon="back" onClick={() => selectCustomer(null)}>
                All customers
              </Button>

              <div style={{ width: 1, height: 24, background: "var(--color-line)" }} />

              {/* Customer Switcher */}
              <Select
                value={selectedCustomerId}
                onChange={(e) => selectCustomer(e.target.value)}
                style={{ width: 220 }}
                aria-label="Switch customer"
              >
                {overviewQuery.data?.customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.balance > 0 ? `(${money(c.balance, overviewQuery.data.currency)})` : ""}
                  </option>
                ))}
              </Select>

              {/* Period Selector */}
              <MenuButton
                className="chipsel is-set"
                label="Period"
                items={[
                  { key: "outstanding", label: "Outstanding invoices only", checked: periodPreset === "outstanding", onSelect: () => handlePeriodChange("outstanding") },
                  { key: "this-month", label: "This month so far", checked: periodPreset === "this-month", onSelect: () => handlePeriodChange("this-month") },
                  { key: "last-3-months", label: "Last 3 months", checked: periodPreset === "last-3-months", onSelect: () => handlePeriodChange("last-3-months") },
                  { key: "this-year", label: "This year", checked: periodPreset === "this-year", onSelect: () => handlePeriodChange("this-year") },
                  { separator: true },
                  { key: "custom", label: "Custom date range", checked: periodPreset === "custom", onSelect: () => setPeriodPreset("custom") },
                ]}
              >
                Period:{" "}
                <b>
                  {periodPreset === "outstanding"
                    ? "Outstanding invoices"
                    : activeStatement
                      ? `${shortDay(activeStatement.statement.from)} – ${shortDay(activeStatement.statement.to)}`
                      : periodPreset}
                </b>
              </MenuButton>

              {periodPreset === "custom" && (
                <span style={{ display: "inline-flex", gap: "var(--space-8)", alignItems: "center" }}>
                  <Input type="date" aria-label="From" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: 140 }} />
                  <span className="muted">to</span>
                  <Input type="date" aria-label="To" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: 140 }} />
                </span>
              )}

              {/* Right Action Buttons */}
              <div style={{ marginLeft: "auto", display: "inline-flex", gap: "var(--space-8)", alignItems: "center" }}>
                <ButtonLink
                  variant="quiet"
                  icon="export"
                  href={`/api/books/statements/${selectedCustomerId}/pdf?download=1${fromDate ? `&from=${fromDate}` : ""}${toDate ? `&to=${toDate}` : ""}`}
                  target="_blank"
                >
                  Download PDF
                </ButtonLink>

                <Button variant="quiet" icon="print" onClick={() => window.print()}>
                  Print
                </Button>

                <Button variant="quiet" icon="at" onClick={() => setEmailDrawerOpen(true)}>
                  Send email
                </Button>

                {waPhone ? (
                  <ButtonLink icon="whatsapp" href={whatsappLink(waPhone, waMessage)} target="_blank" rel="noopener">
                    WhatsApp
                  </ButtonLink>
                ) : (
                  <Button icon="whatsapp" disabled title="No phone or WhatsApp number on file">
                    WhatsApp
                  </Button>
                )}

                <Button variant="primary" icon="plus" onClick={() => setPaymentDrawerOpen(true)}>
                  Record payment
                </Button>

                <ButtonLink variant="quiet" href={`/books/invoices/new?customer=${selectedCustomerId}`}>
                  New invoice
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              {/* Overview Mode Filters */}
              <span style={{ fontWeight: 600, color: "var(--color-ink)", fontSize: "var(--text-14)" }}>
                Customer Account Statements
              </span>

              <div style={{ width: 1, height: 24, background: "var(--color-line)" }} />

              <Input
                placeholder="Search by customer, code or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 280 }}
              />

              <div style={{ display: "inline-flex", gap: "var(--space-4)" }}>
                <Button
                  variant={filterMode === "balance" ? "primary" : "quiet"}
                  size="sm"
                  onClick={() => setFilterMode("balance")}
                >
                  Has open balance
                </Button>
                <Button
                  variant={filterMode === "overdue" ? "primary" : "quiet"}
                  size="sm"
                  onClick={() => setFilterMode("overdue")}
                >
                  Overdue only
                </Button>
                <Button
                  variant={filterMode === "all" ? "primary" : "quiet"}
                  size="sm"
                  onClick={() => setFilterMode("all")}
                >
                  All customers
                </Button>
              </div>

              <div style={{ marginLeft: "auto", display: "inline-flex", gap: "var(--space-8)" }}>
                <ButtonLink variant="quiet" href="/books/invoices">
                  View invoices
                </ButtonLink>
                <ButtonLink variant="primary" icon="plus" href="/books/invoices/new">
                  New invoice
                </ButtonLink>
              </div>
            </>
          )}
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, overflow: "auto", background: selectedCustomerId ? "var(--color-ground)" : "var(--color-surface)" }}>
          {selectedCustomerId ? (
            /* ================= STATEMENT PREVIEW ================= */
            <div className="bk-statement-container" style={{ padding: "var(--space-24) var(--space-16)" }}>
              {statementQuery.isLoading ? (
                <div style={{ padding: "var(--space-48)", textAlign: "center" }} className="muted">
                  Loading statement…
                </div>
              ) : activeStatement && branding ? (
                <article
                  className="bk-statement-sheet"
                  style={{
                    maxWidth: 880,
                    margin: "0 auto",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
                    borderRadius: "var(--radius-card)",
                    padding: "var(--space-40) var(--space-48)",
                    border: "1px solid var(--color-line)",
                    color: "var(--color-ink)",
                    fontFamily: "var(--font-sans, system-ui, sans-serif)",
                  }}
                >
                  {/* Top Masthead & Letterhead */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-32)", borderBottom: "2px solid var(--color-ink)", paddingBottom: "var(--space-24)" }}>
                    <div style={{ flex: 1 }}>
                      {branding.logoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={branding.logoUrl}
                          alt={branding.displayName}
                          style={{ maxHeight: 52, maxWidth: 220, objectFit: "contain", marginBottom: "var(--space-12)" }}
                        />
                      ) : (
                        <h1 style={{ fontSize: "var(--text-24)", fontWeight: 700, margin: 0, color: "var(--color-ink)", letterSpacing: "-0.02em" }}>
                          {branding.displayName}
                        </h1>
                      )}
                      <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-13)", color: "var(--color-muted)", lineHeight: 1.45 }}>
                        {branding.legalName && branding.legalName !== branding.displayName ? `${branding.legalName} · ` : ""}
                        {branding.physicalAddress ?? ""}
                        {branding.vatNumber ? ` · VAT ${branding.vatNumber}` : branding.taxNumber ? ` · Tax ${branding.taxNumber}` : ""}
                      </p>
                      <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-13)", color: "var(--color-muted)" }}>
                        {branding.email ? `${branding.email} ` : ""}
                        {branding.phone ? `· ${branding.phone}` : ""}
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-block", padding: "var(--space-4) var(--space-12)", background: "var(--color-ink)", color: "#fff", fontWeight: 700, fontSize: "var(--text-12)", letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: "var(--radius-sm)" }}>
                        Statement of Account
                      </div>
                      <table style={{ marginTop: "var(--space-12)", marginLeft: "auto", fontSize: "var(--text-13)", borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ color: "var(--color-muted)", paddingRight: "var(--space-12)", textAlign: "right" }}>Date</td>
                            <td className="mono" style={{ fontWeight: 600 }}>{activeStatement.statement.to}</td>
                          </tr>
                          <tr>
                            <td style={{ color: "var(--color-muted)", paddingRight: "var(--space-12)", textAlign: "right" }}>Account No.</td>
                            <td className="mono" style={{ fontWeight: 600 }}>{activeStatement.code}</td>
                          </tr>
                          <tr>
                            <td style={{ color: "var(--color-muted)", paddingRight: "var(--space-12)", textAlign: "right" }}>Currency</td>
                            <td className="mono" style={{ fontWeight: 600 }}>{activeStatement.currency}</td>
                          </tr>
                          <tr>
                            <td style={{ color: "var(--color-muted)", paddingRight: "var(--space-12)", textAlign: "right" }}>Status</td>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: "var(--text-11)",
                                  fontWeight: 600,
                                  background: activeStatement.statement.closing > 0.005 ? "var(--color-warning-subtle, #fef3c7)" : "var(--color-success-subtle, #d1fae5)",
                                  color: activeStatement.statement.closing > 0.005 ? "var(--color-warning-text, #92400e)" : "var(--color-success-text, #065f46)",
                                }}
                              >
                                {activeStatement.statement.closing > 0.005 ? "Payment Due" : "Settled"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Customer Information (Bill To) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-24)", margin: "var(--space-24) 0" }}>
                    <div style={{ padding: "var(--space-16)", background: "var(--color-fill)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-line)" }}>
                      <p style={{ margin: 0, fontSize: "var(--text-11)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)", fontWeight: 600 }}>
                        Account for / Bill to
                      </p>
                      <h2 style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-16)", fontWeight: 700, color: "var(--color-ink)" }}>
                        {activeStatement.name}
                      </h2>
                      {activeStatement.contact.address && (
                        <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-13)", color: "var(--color-ink-2)" }}>
                          {activeStatement.contact.address}
                        </p>
                      )}
                      <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-13)", color: "var(--color-muted)" }}>
                        {activeStatement.contact.email ? `${activeStatement.contact.email} ` : ""}
                        {activeStatement.contact.phone ? `· ${activeStatement.contact.phone}` : ""}
                      </p>
                      {(activeStatement.tax.vatNumber || activeStatement.tax.tin) && (
                        <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
                          {activeStatement.tax.vatNumber ? `VAT No: ${activeStatement.tax.vatNumber} ` : ""}
                          {activeStatement.tax.tin ? `· Tax: ${activeStatement.tax.tin}` : ""}
                        </p>
                      )}
                    </div>

                    <div style={{ padding: "var(--space-16)", background: "var(--color-fill)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-line)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <p style={{ margin: 0, fontSize: "var(--text-11)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)", fontWeight: 600 }}>
                        Account Summary
                      </p>
                      <p style={{ margin: "var(--space-8) 0 0", fontSize: "var(--text-24)", fontWeight: 700, color: "var(--color-ink)" }} className="mono">
                        {money(activeStatement.statement.closing, activeStatement.currency)}
                      </p>
                      <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-13)", color: activeStatement.tiles.overdue > 0 ? "var(--color-danger, #dc2626)" : "var(--color-muted)" }}>
                        {activeStatement.tiles.overdue > 0
                          ? `${money(activeStatement.tiles.overdue, activeStatement.currency)} currently overdue`
                          : "No overdue amounts"}
                      </p>
                    </div>
                  </div>

                  {/* 5-Bucket Aging Summary Strip */}
                  <div style={{ margin: "var(--space-24) 0", border: "1px solid var(--color-line)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                    <div style={{ background: "var(--color-ground)", padding: "var(--space-8) var(--space-16)", borderBottom: "1px solid var(--color-line)", fontSize: "var(--text-12)", fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Aging Analysis ({activeStatement.currency})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", background: "#fff", textAlign: "center" }}>
                      <div style={{ padding: "var(--space-12)", borderRight: "1px solid var(--color-line)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block" }}>Current</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>
                          {money(activeStatement.ages["Not yet due"], activeStatement.currency)}
                        </span>
                      </div>
                      <div style={{ padding: "var(--space-12)", borderRight: "1px solid var(--color-line)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block" }}>1–30 Days</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>
                          {money(activeStatement.ages["1 to 30 days"], activeStatement.currency)}
                        </span>
                      </div>
                      <div style={{ padding: "var(--space-12)", borderRight: "1px solid var(--color-line)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block" }}>31–60 Days</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>
                          {money(activeStatement.ages["31 to 60 days"], activeStatement.currency)}
                        </span>
                      </div>
                      <div style={{ padding: "var(--space-12)", borderRight: "1px solid var(--color-line)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block" }}>61–90 Days</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 600 }}>
                          {money(activeStatement.ages["61 to 90 days"], activeStatement.currency)}
                        </span>
                      </div>
                      <div style={{ padding: "var(--space-12)", borderRight: "1px solid var(--color-line)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block" }}>90+ Days</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 600, color: activeStatement.ages["Over 90 days"] > 0 ? "var(--color-danger, #dc2626)" : "inherit" }}>
                          {money(activeStatement.ages["Over 90 days"], activeStatement.currency)}
                        </span>
                      </div>
                      <div style={{ padding: "var(--space-12)", background: "var(--color-fill)" }}>
                        <span style={{ fontSize: "var(--text-11)", color: "var(--color-muted)", display: "block", fontWeight: 600 }}>Total Due</span>
                        <span className="mono" style={{ fontSize: "var(--text-13)", fontWeight: 700, color: "var(--color-ink)" }}>
                          {money(activeStatement.statement.closing, activeStatement.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div style={{ margin: "var(--space-24) 0" }}>
                    <h3 style={{ fontSize: "var(--text-14)", fontWeight: 600, margin: "0 0 var(--space-8)", color: "var(--color-ink)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {periodPreset === "outstanding" ? "Outstanding Invoices" : "Statement Activity"}
                    </h3>

                    {periodPreset === "outstanding" ? (
                      /* Outstanding Invoices Mode */
                      activeStatement.outstandingLines.length === 0 ? (
                        <p className="muted" style={{ padding: "var(--space-24) 0" }}>
                          All invoices for this customer have been settled in full.
                        </p>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-13)" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid var(--color-line)", textAlign: "left" }}>
                              <th style={{ padding: "8px 12px 8px 0" }}>Invoice No.</th>
                              <th style={{ padding: "8px 12px" }}>Date</th>
                              <th style={{ padding: "8px 12px" }}>Due Date</th>
                              <th style={{ padding: "8px 12px", textAlign: "right" }}>Total</th>
                              <th style={{ padding: "8px 0 8px 12px", textAlign: "right" }}>Owing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeStatement.outstandingLines.map((inv) => (
                              <tr key={inv.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                                <td style={{ padding: "10px 12px 10px 0" }}>
                                  <Link href={`/books/invoices/${inv.id}`} className="mono" style={{ fontWeight: 600, color: "var(--color-primary, #2563eb)", textDecoration: "none" }}>
                                    {inv.number}
                                  </Link>
                                </td>
                                <td style={{ padding: "10px 12px" }} className="mono">{inv.date}</td>
                                <td style={{ padding: "10px 12px" }} className="mono">{inv.dueDate ?? "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right" }} className="mono">{money(inv.total, inv.currency)}</td>
                                <td style={{ padding: "10px 0 10px 12px", textAlign: "right", fontWeight: 700 }} className="mono">
                                  {money(inv.balance, inv.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid var(--color-ink)", fontWeight: 700 }}>
                              <td colSpan={4} style={{ padding: "12px 12px 12px 0", textAlign: "right" }}>Total Outstanding</td>
                              <td style={{ padding: "12px 0 12px 12px", textAlign: "right", fontSize: "var(--text-15)" }} className="mono">
                                {money(activeStatement.statement.closing, activeStatement.currency)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )
                    ) : (
                      /* Activity / Running Ledger Mode */
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-13)" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--color-line)", textAlign: "left" }}>
                            <th style={{ padding: "8px 12px 8px 0" }}>Date</th>
                            <th style={{ padding: "8px 12px" }}>Reference</th>
                            <th style={{ padding: "8px 12px" }}>Description</th>
                            <th style={{ padding: "8px 12px", textAlign: "right" }}>Invoiced</th>
                            <th style={{ padding: "8px 12px", textAlign: "right" }}>Paid</th>
                            <th style={{ padding: "8px 0 8px 12px", textAlign: "right" }}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening Balance Row */}
                          <tr style={{ borderBottom: "1px solid var(--color-line)", background: "var(--color-fill)" }}>
                            <td style={{ padding: "10px 12px 10px 0" }} className="mono">{activeStatement.statement.from}</td>
                            <td style={{ padding: "10px 12px" }} className="muted">—</td>
                            <td style={{ padding: "10px 12px", fontWeight: 500 }}>Opening balance</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }} className="muted">—</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }} className="muted">—</td>
                            <td style={{ padding: "10px 0 10px 12px", textAlign: "right", fontWeight: 600 }} className="mono">
                              {money(activeStatement.statement.opening, activeStatement.currency)}
                            </td>
                          </tr>

                          {activeStatement.statement.lines.map((line, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid var(--color-line)" }}>
                              <td style={{ padding: "10px 12px 10px 0" }} className="mono">{line.date}</td>
                              <td style={{ padding: "10px 12px" }}>
                                {line.href ? (
                                  <Link href={line.href} className="mono" style={{ fontWeight: 600, color: "var(--color-primary, #2563eb)", textDecoration: "none" }}>
                                    {line.document}
                                  </Link>
                                ) : (
                                  <span className="mono" style={{ fontWeight: 600 }}>{line.document}</span>
                                )}
                              </td>
                              <td style={{ padding: "10px 12px" }}>{line.detail || "—"}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }} className="mono">
                                {line.invoiced !== null ? money(line.invoiced, activeStatement.currency) : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }} className="mono">
                                {line.paid !== null ? money(line.paid, activeStatement.currency) : "—"}
                              </td>
                              <td style={{ padding: "10px 0 10px 12px", textAlign: "right", fontWeight: 600 }} className="mono">
                                {money(line.balance, activeStatement.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--color-ink)", fontWeight: 700 }}>
                            <td colSpan={3} style={{ padding: "12px 12px 12px 0" }}>Closing Balance as of {activeStatement.statement.to}</td>
                            <td style={{ padding: "12px 12px", textAlign: "right" }} className="mono">
                              {money(activeStatement.statement.invoiced, activeStatement.currency)}
                            </td>
                            <td style={{ padding: "12px 12px", textAlign: "right" }} className="mono">
                              {money(activeStatement.statement.paid, activeStatement.currency)}
                            </td>
                            <td style={{ padding: "12px 0 12px 12px", textAlign: "right", fontSize: "var(--text-15)" }} className="mono">
                              {money(activeStatement.statement.closing, activeStatement.currency)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>

                  {/* Payment Instructions & Remittance Advice */}
                  <div style={{ marginTop: "var(--space-32)", paddingTop: "var(--space-20)", borderTop: "1px dashed var(--color-line)", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--space-24)" }}>
                    <div>
                      <h4 style={{ margin: "0 0 var(--space-8)", fontSize: "var(--text-12)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-muted)", fontWeight: 600 }}>
                        Payment Instructions / Bank Accounts
                      </h4>
                      {branding.bankAccounts && branding.bankAccounts.length > 0 ? (
                        <div style={{ fontSize: "var(--text-12)", color: "var(--color-ink-2)", lineHeight: 1.5 }}>
                          {branding.bankAccounts.map((acc, i) => (
                            <p key={i} style={{ margin: "var(--space-4) 0" }}>
                              <b>{acc.accountName}</b> · Account: <span className="mono">{acc.accountNumber}</span> ({acc.currency})
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
                          Please contact accounts for banking and transfer details.
                        </p>
                      )}
                      <p style={{ margin: "var(--space-8) 0 0", fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
                        Please quote reference <b>{activeStatement.code}</b> on all payments.
                      </p>
                    </div>

                    <div style={{ padding: "var(--space-12) var(--space-16)", background: "var(--color-fill)", borderRadius: "var(--radius-sm)", textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: "var(--text-11)", textTransform: "uppercase", color: "var(--color-muted)", fontWeight: 600 }}>
                        Total Amount Due
                      </p>
                      <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-20)", fontWeight: 700, color: "var(--color-ink)" }} className="mono">
                        {money(activeStatement.statement.closing, activeStatement.currency)}
                      </p>
                      <p style={{ margin: "var(--space-4) 0 0", fontSize: "var(--text-11)", color: "var(--color-muted)" }}>
                        Due on receipt
                      </p>
                    </div>
                  </div>
                </article>
              ) : (
                <div style={{ padding: "var(--space-48)", textAlign: "center" }} className="muted">
                  No statement data found for this customer.
                </div>
              )}
            </div>
          ) : (
            /* ================= OVERVIEW MODE (ALL CUSTOMERS) ================= */
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
              {overviewQuery.data?.summary && (
                <div style={{ padding: "var(--space-16) var(--space-24)", borderBottom: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
                  <BooksFinding
                    finding={{
                      fact: `${money(overviewQuery.data.summary.totalReceivables, overviewQuery.data.currency)} is currently owed across ${overviewQuery.data.summary.customersWithBalance} customers.`,
                      rest: overviewQuery.data.summary.totalOverdue > 0
                        ? `${money(overviewQuery.data.summary.totalOverdue, overviewQuery.data.currency)} is overdue.`
                        : null,
                    }}
                  />
                </div>
              )}

              <div style={{ flex: 1, overflow: "auto" }}>
                <table className="bkt" style={{ width: "100%" }} aria-label="Customers with open balances">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Account code</th>
                      <th>Open invoices</th>
                      <th>Oldest invoice</th>
                      <th className="r">Overdue</th>
                      <th className="r">Total owing</th>
                      <th className="r">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewQuery.data?.customers
                      ?.filter((c) => {
                        if (searchQuery.trim()) {
                          const q = searchQuery.toLowerCase();
                          const match =
                            c.name.toLowerCase().includes(q) ||
                            c.code.toLowerCase().includes(q) ||
                            (c.phone && c.phone.includes(q)) ||
                            (c.contactName && c.contactName.toLowerCase().includes(q));
                          if (!match) return false;
                        }
                        if (filterMode === "balance") return c.balance > 0.005;
                        if (filterMode === "overdue") return c.overdue > 0.005;
                        return true;
                      })
                      .map((c) => (
                        <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => selectCustomer(c.id)}>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span className="who" style={{ fontWeight: 600 }}>{c.name}</span>
                              {c.contactName && (
                                <span className="muted" style={{ fontSize: "var(--text-12)" }}>{c.contactName}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="code">{c.code}</span>
                          </td>
                          <td>
                            {c.openCount > 0 ? (
                              <span>{c.openCount} {c.openCount === 1 ? "invoice" : "invoices"}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="muted">{c.oldestDate ?? "—"}</span>
                          </td>
                          <td className="r">
                            {c.overdue > 0 ? (
                              <span style={{ color: "var(--color-danger, #dc2626)", fontWeight: 600 }} className="num">
                                {money(c.overdue, overviewQuery.data.currency)}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="r">
                            <span style={{ fontWeight: 600, color: "var(--color-ink)" }} className="num">
                              {money(c.balance, overviewQuery.data.currency)}
                            </span>
                          </td>
                          <td className="r" onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "inline-flex", gap: "var(--space-4)" }}>
                              <Button
                                size="sm"
                                variant="quiet"
                                onClick={() => selectCustomer(c.id)}
                              >
                                View statement
                              </Button>
                              <ButtonLink
                                size="sm"
                                variant="quiet"
                                icon="export"
                                href={`/api/books/statements/${c.id}/pdf?download=1`}
                                target="_blank"
                                title="Download PDF"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Drawer */}
      {selectedCustomerId && (
        <RecordCustomerPaymentDrawer
          open={paymentDrawerOpen}
          onOpenChange={setPaymentDrawerOpen}
          initialCustomerId={selectedCustomerId}
          onDone={() => {
            setPaymentDrawerOpen(false);
            queryClient.invalidateQueries({ queryKey: ["books", "statements"] });
            toast({ title: "Payment recorded", description: "Customer statement updated." });
          }}
        />
      )}

      {/* Send Statement Email Drawer */}
      <Drawer
        open={emailDrawerOpen}
        onOpenChange={setEmailDrawerOpen}
        title="Email statement of account"
        sub={activeStatement ? `Send statement PDF to ${activeStatement.name}` : ""}
        width={480}
        footer={
          <>
            <Button disabled={sendingEmail} onClick={() => setEmailDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={sendingEmail} onClick={handleSendEmail}>
              {sendingEmail ? "Sending…" : "Send statement"}
            </Button>
          </>
        }
      >
        <DrawerSection title="Recipient & Subject">
          <Field label="Recipient email">
            <Input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="billing@customer.com"
            />
          </Field>
          <Field label="Subject">
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </Field>
        </DrawerSection>

        <DrawerSection title="Message">
          <Field label="Note for the client">
            <textarea
              className="bk-textarea"
              style={{
                width: "100%",
                minHeight: 120,
                padding: "var(--space-8)",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-line)",
                fontFamily: "inherit",
                fontSize: "var(--text-13)",
              }}
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
            />
          </Field>
          <div style={{ marginTop: "var(--space-12)", padding: "var(--space-12)", background: "var(--color-fill)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
            <span style={{ fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
              📎 Attached: Statement of Account ({activeStatement?.name}.pdf)
            </span>
          </div>
        </DrawerSection>
      </Drawer>
    </>
  );
}
