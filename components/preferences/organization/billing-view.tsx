"use client";

import * as React from "react";

import { Banner, Button, Icon, Status, VaneMark, type IconName } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import type { BillingPreferences } from "@/lib/preferences/api";

/** A vertical's product mark where it has one; a core icon for the rest. */
const PRODUCT_MARKS: Record<string, string> = {
  CRM: "/brand/flare-mark.svg",
  RETAIL: "/brand/tender-mark.svg",
  PAYROLL: "/brand/shift-mark.svg",
};

const VERTICAL_ICONS: Record<string, IconName> = {
  GOLD: "measure",
  SCHOOLS: "training",
  RETAIL: "store",
  CRM: "pipeline",
  WORKSHOP: "inspections",
  PAYROLL: "payments",
  GENERAL: "ws",
};

const money = (value: number, currency = "USD") =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

/** How a payment method or provider is written: its own name, or a common noun in lower case. */
const PROVIDER_NAMES: Record<string, string> = { ECOCASH: "EcoCash", PAYNOW: "Paynow", PESEPAY: "Pesepay", CONTIPAY: "Contipay" };
const methodWord = (method: string) => (/^(cash|cheque|card|bank transfer)$/i.test(method) ? method.toLowerCase() : method);

function Mark({ code, icon }: { code: string; icon: IconName }) {
  const src = PRODUCT_MARKS[code];
  if (src) {
    // A product's mark, a fixed 32px SVG.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pm" src={src} alt="" width={32} height={32} />;
  }
  return (
    <span className="mi">
      <Icon name={icon} size={20} />
    </span>
  );
}

function Price({ amount, currency }: { amount: number; currency: string }) {
  return (
    <span className="pr">
      <b className="num">{money(amount, currency)}</b>
      <span>a month</span>
    </span>
  );
}

const CORE_MODULES: Array<{ icon: IconName; name: string; detail: string }> = [
  { icon: "books", name: "Books", detail: "Money in, owed, the bank and VAT, from your products" },
  { icon: "reports", name: "Reports and insights", detail: "Boards and tables over any of your data" },
  { icon: "docs", name: "Forms and documents", detail: "What your people fill in and what you send out" },
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Management → Billing (design/core-modules/html/management-billing.html), on
 * the workspace's subscription: what it pays each month and why — its
 * verticals at the rate its member count sets — the core modules every
 * workspace has, the verticals it could add, and how it pays. Pure: the page
 * and the fixture route feed it.
 */
export function BillingPageView({
  data,
  onAskPrice,
}: {
  data: BillingPreferences;
  /** Adding a vertical is arranged with Corelith; this opens how, and how the price works. */
  onAskPrice: () => void;
}) {
  const { company, charges, health, available, vane, payments } = data;
  const currency = charges.currency;
  const nextDate = data.subscription?.currentPeriodEnd ?? health.currentPeriodEnd;
  const method = payments.methods.map(methodWord).join(" or ");

  return (
    <KitPage screen="management-billing" title="Billing" mark={<Icon name="bank" />}>
      {health.state === "EXPIRING_SOON" || health.state === "IN_GRACE" || health.state === "EXPIRED_BLOCKED" ? (
        <Banner tone={health.state === "EXPIRING_SOON" ? "warning" : "danger"}>
          {health.state === "EXPIRING_SOON"
            ? `The plan runs out in ${health.daysUntilEnd ?? 0} days. Pay before ${nextDate ? dayMonth(nextDate) : "then"} to keep going.`
            : health.state === "IN_GRACE"
              ? `The plan ran out ${health.daysOverdue ?? 0} days ago. The workspace stops after ${health.graceDays} days.`
              : "The plan ran out. Pay Corelith to open the workspace again."}
        </Banner>
      ) : null}

      <div className="finding" style={{ padding: 0 }}>
        {charges.lines.length > 0 ? (
          <p className="lede-figure">
            {company.name} pays <span className="num">{money(charges.total, currency)}</span> a month for{" "}
            {plural(charges.lines.length, "vertical", "verticals")}.{" "}
            <span className="q">
              {nextDate ? `The next payment is on ${dayMonth(nextDate)}, by ${method}.` : `It pays by ${method}.`}
            </span>
          </p>
        ) : (
          <p className="lede-figure">
            {company.name} has nothing to pay for yet. <span className="q">Corelith sets up what it runs when the workspace is agreed.</span>
          </p>
        )}
      </div>

      <div className="form-sec">
        <header>
          <h2>Verticals</h2>
          <p>What you pay for. {charges.why}</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          {charges.lines.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            charges.lines.map((line) => (
              <div className="setting ar" key={line.vertical}>
                <Mark code={line.vertical} icon={VERTICAL_ICONS[line.vertical] ?? "ws"} />
                <span className="t">
                  <b>{line.label}</b>
                  <span>Everything in it included, for {plural(charges.members, "member", "members")}</span>
                </span>
                <Price amount={line.amount} currency={currency} />
              </div>
            ))
          )}
          <div className="setting ar">
            <Mark code="" icon="help" />
            <span className="t">
              <b>How the price works</b>
              <span>
                Each vertical is the same price, set by how many people have access. Parents and students do not count.
              </span>
            </span>
            <Button onClick={onAskPrice}>See prices</Button>
          </div>
        </div>
      </div>

      <div className="form-sec">
        <header>
          <h2>Core modules</h2>
          <p>In every workspace, whatever it runs.</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          {CORE_MODULES.map((module) => (
            <div className="setting ar" key={module.name}>
              <Mark code="" icon={module.icon} />
              <span className="t">
                <b>{module.name}</b>
                <span>{module.detail}</span>
              </span>
              <Status tone="success">Included</Status>
            </div>
          ))}
          <div className="setting ar">
            <span className="mi">
              <VaneMark size={20} />
            </span>
            <span className="t">
              <b>Vane</b>
              <span>
                Watches your products, raises issues and drafts. {vane.jobsThisMonth.toLocaleString("en-GB")} of{" "}
                {vane.monthlyAllowance.toLocaleString("en-GB")} jobs this month
              </span>
            </span>
            <Status tone="success">Included</Status>
          </div>
        </div>
      </div>

      {available.length > 0 ? (
        <div className="form-sec">
          <header>
            <h2>More verticals</h2>
            <p>Each adds {money(charges.each, currency)} a month at your size. Corelith adds it for you.</p>
          </header>
          <div className="body" style={{ gap: 0 }}>
            {available.map((option) => (
              <div className="setting ar" key={option.vertical}>
                <Mark code={option.vertical} icon={VERTICAL_ICONS[option.vertical] ?? "ws"} />
                <span className="t">
                  <b>{option.label}</b>
                  <span>Everything in it included</span>
                </span>
                <Price amount={charges.each} currency={currency} />
                <Button icon="plus" onClick={onAskPrice}>
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="form-sec">
        <header>
          <h2>Paying</h2>
          <p>{nextDate ? `Corelith bills on the ${new Date(nextDate).getUTCDate() === 1 ? "1st" : dayMonth(nextDate)}.` : "Corelith bills each month."}</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          <div className="setting ar">
            {payments.methods.length === 1 && payments.methods[0] === "EcoCash" ? (
              <span className="mk">
                {/* EcoCash's own wordmark, a fixed raster. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/ecocash-wordmark.png" alt="EcoCash" style={{ width: "80%", height: "auto" }} />
              </span>
            ) : (
              <Mark code="" icon="payments" />
            )}
            <span className="t">
              <b>{payments.methods.join(" or ")}</b>
              <span>{payments.guidance}</span>
            </span>
          </div>
          {payments.history.length === 0 ? (
            <div className="setting ar">
              <Mark code="" icon="invoice" />
              <span className="t">
                <b>No payments yet</b>
                <span>Each payment shows here once Corelith records it</span>
              </span>
            </div>
          ) : (
            payments.history.map((payment) => (
              <div className="setting ar" key={payment.id}>
                <Mark code="" icon="invoice" />
                <span className="t">
                  <b>{payment.paidAt ? monthYear(payment.paidAt) : "Payment"}</b>
                  <span>
                    {payment.paidAt ? `Paid ${shortDay(payment.paidAt)}` : "Paid"}
                    {payment.provider ? `, ${PROVIDER_NAMES[payment.provider] ?? payment.provider.charAt(0) + payment.provider.slice(1).toLowerCase()}` : ""}
                  </span>
                </span>
                <b className="num" style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                  {money(payment.amount, payment.currency)}
                </b>
              </div>
            ))
          )}
        </div>
      </div>
    </KitPage>
  );
}
