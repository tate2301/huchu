"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Drawer } from "@/components/core";
import type { VaneCard } from "@/lib/vane/panel";

import { NotNowMenu } from "./not-now-menu";

const SECTION: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-8)" };
const SQL: React.CSSProperties = {
  margin: 0,
  padding: "var(--space-12)",
  borderRadius: 8,
  background: "var(--color-ground)",
  border: "1px solid var(--color-line)",
  font: "var(--text-12)/1.55 var(--font-mono)",
  color: "var(--color-ink-2)",
  whiteSpace: "pre-wrap",
};
const NOTE: React.CSSProperties = {
  padding: "var(--space-12) var(--space-16)",
  borderRadius: 8,
  background: "var(--color-ground)",
  color: "var(--color-ink-2)",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The page a table's records are read on, and what the table is called there. */
const TABLES: Record<string, { label: string; href?: string }> = {
  SalesInvoice: { label: "Invoices", href: "/books/invoices" },
  SalesQuotation: { label: "Quotes", href: "/crm/quotes" },
  CrmDeal: { label: "Deals", href: "/crm/deals" },
  Deal: { label: "Deals", href: "/crm/deals" },
  Customer: { label: "Customers" },
  BankTransaction: { label: "Bank lines", href: "/books/bank" },
  RetailSale: { label: "Sales", href: "/retail/sales" },
  RetailShift: { label: "Till shifts", href: "/retail/shifts" },
  RetailPurchaseOrder: { label: "Purchase orders" },
  Employee: { label: "Employees", href: "/people" },
};

/** "SalesInvoice" → "Sales invoice", for a table the map does not name. */
function tableLabel(table: string): { label: string; href?: string } {
  if (TABLES[table]) return TABLES[table];
  const words = table.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return { label: words.charAt(0).toUpperCase() + words.slice(1) };
}

/** The tables a card read, for the What I read button's tooltip: "Invoices, Quotes". */
export function readSummary(card: VaneCard): string {
  return [...new Set(card.read.map((read) => tableLabel(read.table).label))].join(", ");
}

/**
 * A card and what Vane read for it (the PageVaneCard board): beside the list,
 * its kind, source and time; the tables it read and how many rows each gave;
 * the question it ran. So nothing it says is unchecked. Its act and Not now
 * are at the foot.
 */
export function VaneCardDrawer({
  card,
  onClose,
  onAct,
  onMute,
}: {
  card: VaneCard | null;
  onClose: () => void;
  onAct: (card: VaneCard) => void;
  onMute: (card: VaneCard, reason: string) => void;
}) {
  return (
    <Drawer
      open={Boolean(card)}
      onOpenChange={(open) => (open ? null : onClose())}
      width={460}
      title={card?.headline ?? ""}
      sub={card ? `${card.kind === "issue" ? "Issue" : "Suggestion"} · ${card.source} · ${time(card.createdAt)}` : undefined}
      footer={
        card ? (
          <>
            <NotNowMenu labelled variant="default" onMute={(reason) => onMute(card, reason)} />
            {card.action ? (
              <Button variant="primary" shortcut="S" onClick={() => onAct(card)}>
                {card.action.label}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {card ? (
        <>
          <div style={SECTION}>
            <span className="sec-title">It read</span>
            {card.read.length > 0 ? (
              <dl className="attrs">
                {card.read.map((read) => {
                  const table = tableLabel(read.table);
                  return (
                    <React.Fragment key={read.table}>
                      <dt>
                        {table.href ? (
                          <Link className="link" href={table.href}>
                            {table.label}
                          </Link>
                        ) : (
                          table.label
                        )}
                        {read.about ? <span style={{ color: "var(--color-muted)" }}> {read.about}</span> : null}
                      </dt>
                      <dd>
                        {read.rows.toLocaleString("en-GB")} {read.rows === 1 ? "row" : "rows"}
                      </dd>
                    </React.Fragment>
                  );
                })}
              </dl>
            ) : (
              <p className="muted">Vane did not say which tables it read for this card.</p>
            )}
          </div>
          <div style={SECTION}>
            <span className="sec-title">The question it ran</span>
            {card.sql ? (
              <>
                <pre style={SQL}>{card.sql}</pre>
                <span className="muted">Read only, in this workspace, as Vane is allowed to read it.</span>
              </>
            ) : (
              <p className="muted">Vane kept no question for this card.</p>
            )}
          </div>
          {card.action ? (
            <div style={NOTE}>Nothing is sent, paid or changed until someone presses {card.action.label} and finishes it there.</div>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}
