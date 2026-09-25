"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  FormPage,
  HeaderAction,
  StatusBadge,
  type StatusTone,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { getApiErrorMessage } from "@/lib/api-client";
import { Download, Payments } from "@/lib/icons";
import {
  fetchBillingPreferences,
  type BillingPreferences as BillingPreferencesResponse,
} from "@/lib/preferences/api";

import {
  FactRow,
  FactRowsSkeleton,
  FormSection,
  LoadFailure,
  NothingHere,
} from "./form-parts";
import styles from "./organization.module.css";
import { PricingPanel } from "./pricing-panel";

function formatMoney(value: number | null | undefined, currency = "USD") {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not set";
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The board's date shape: `1 Jan 2027`. */
function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function countOf(used: number, limit: number | null | undefined) {
  return limit == null ? `${used} of unlimited` : `${used} of ${limit}`;
}

/**
 * One settled charge, plus the one field that is not in the payload today.
 *
 * `SubscriptionPayment.amount` is `Decimal(14,2)`, and a Prisma `Decimal`
 * crosses JSON as a string however the type reads on this side, so the amount
 * is put through `Number()` before it is formatted rather than trusted to be a
 * number already.
 *
 * `documentUrl` is the field `lib/preferences/api.ts` says joins each row the
 * day `invoiceDocumentsSupported` flips ("a `documentUrl` joins each row").
 * It is declared optional here so the board's Download has a real href to point
 * at the moment one exists, and renders nothing until then — rather than a
 * button wired to a route nobody has written.
 */
type InvoiceRow = BillingPreferencesResponse["payments"]["history"][number] & {
  documentUrl?: string | null;
};

/**
 * The badge the subscription's health earns, if it earns one.
 *
 * `health.status` is the raw subscription status off the row — `PAST_DUE`,
 * `TRIALING` — so it is the wrong string to put in a chip. `health.state` is
 * the decision the platform already made about that status, and these five are
 * the whole union; writing them out means a sixth arrives as a type error
 * rather than as `EXPIRED_BLOCKED` in a red box.
 */
const HEALTH: Record<
  BillingPreferencesResponse["health"]["state"],
  { tone: StatusTone; label: string }
> = {
  ACTIVE: { tone: "success", label: "Active" },
  EXPIRING_SOON: { tone: "warn", label: "Expiring soon" },
  IN_GRACE: { tone: "warn", label: "Past due" },
  EXPIRED_BLOCKED: { tone: "danger", label: "Expired" },
  MISSING_SUBSCRIPTION: { tone: "danger", label: "No subscription" },
};

/**
 * Billing — `Billing.dc.html`.
 *
 * The board is the minimal treatment: a title line, the plan's four facts, and
 * the invoices under their count. What it replaces was an info `Alert`, a 4-up
 * `StatCard` grid, two `Card`s and the pricing panel — five surfaces saying
 * three things, with the plan name in a stat tile and the seat count in a
 * different one.
 *
 * **Invoices** are now real. `/api/preferences/billing` returns
 * `payments.history` — up to twelve settled `SubscriptionPayment` rows, newest
 * first, each with a reference, a settlement date and an amount. That is
 * exactly what the board's rows say, so the section draws them under its own
 * count, and falls to the shared empty state when a workspace has not paid us
 * yet. There is still no `SalesInvoice`-style document for a workspace's own
 * subscription — the invoice routes in `app/api` are accounting and school
 * fees, a tenant's invoices to its own customers.
 *
 * **Change plan.** Nothing in this workspace can change a plan: billing is
 * offline, `payments.onlinePaymentsSupported` is `false` by type. So the
 * header's one verb does the thing somebody actually opens this page to do
 * before they change a plan — it shows what the plan is made of, module by
 * module, at what price. That is `PricingPanel`, which already existed and was
 * previously stapled to the bottom of the page whether anybody wanted it or
 * not.
 *
 * Two verbs the board draws are gated on the API's own capability flags rather
 * than on a guess here, because rule 9 says hide an action that is not valid
 * rather than disable it:
 *
 *   - **Download**, per invoice row, on `payments.invoiceDocumentsSupported`
 *     and the row's `documentUrl`. The flag is `false` today: the money is
 *     recorded but no document is rendered or stored anywhere, so there is
 *     nothing to hand somebody who clicks.
 *   - **Update**, on the Payment row, on `payments.methodEditable`. Also
 *     `false`: the method is the hard-coded offline one and there is no
 *     company payment-method record to open an editor onto.
 *
 * Both are one condition away from drawing; nothing else on the page moves
 * when the flags flip.
 */
export function BillingPreferences() {
  const [showPricing, setShowPricing] = useState(false);

  const billingQuery = useQuery({
    queryKey: ["preferences", "billing"],
    queryFn: fetchBillingPreferences,
  });

  const billing = billingQuery.data;

  if (billingQuery.isLoading) {
    return (
      <PreferencesShell>
        <FormPage title="Billing" width={600} className={styles.page}>
          <FormSection>Plan</FormSection>
          {/* Four bars, because the section that lands here has four rows. */}
          <FactRowsSkeleton rows={4} />
        </FormPage>
      </PreferencesShell>
    );
  }

  if (!billing) {
    return (
      <PreferencesShell>
        <FormPage title="Billing" width={600} className={styles.page}>
          <LoadFailure
            message={getApiErrorMessage(billingQuery.error)}
            onRetry={() => {
              void billingQuery.refetch();
            }}
          />
        </FormPage>
      </PreferencesShell>
    );
  }

  const currency = billing.plan?.currency ?? "USD";
  const health = HEALTH[billing.health.state];
  const payment = ["Offline", ...billing.payments.methods].join(" · ");
  const invoices: InvoiceRow[] = billing.payments.history;
  const canDownloadInvoices = billing.payments.invoiceDocumentsSupported;

  return (
    <PreferencesShell>
      <FormPage
        title="Billing"
        width={600}
        className={styles.page}
        // Rule 5: the plan's health is a chip only when it is not fine. A
        // `header` badge on a `success` tone renders null, so this is safe to
        // pass unconditionally.
        badge={
          <StatusBadge context="header" tone={health.tone}>
            {health.label}
          </StatusBadge>
        }
        action={
          <HeaderAction
            icon={Payments}
            aria-expanded={showPricing}
            onClick={() => setShowPricing((open) => !open)}
          >
            Change plan
          </HeaderAction>
        }
      >
        <FormSection>Plan</FormSection>
        <FactRow label="Plan">{billing.plan?.name ?? "No plan"}</FactRow>
        <FactRow label="Seats" mono>
          {countOf(billing.usage.activeUsers, billing.usage.maxUsers)}
        </FactRow>
        {/* Four rows, not five. `Billing.dc.html` draws Plan, Seats, Renews,
            Payment; the site allowance is a plan limit, and the page that
            itemises plan limits is one click away behind "Change plan". */}
        <FactRow label="Renews" mono>
          {formatDate(billing.subscription?.currentPeriodEnd)}
        </FactRow>
        {/* The board draws an Update verb on this row. `payments.methodEditable`
            is the API's own answer to whether it has anywhere to go, and it is
            false: the method is the hard-coded offline one and there is no
            company payment-method record, so there is no editor to open. Rule 9
            hides an invalid action rather than disabling it, and a button wired
            to a screen nobody has written is not an implementation of it. */}
        <FactRow label="Payment">{payment}</FactRow>

        {/* The itemised answer sits directly under the plan it itemises, not at
            the foot of the page: the verb that reveals it is in the header, and
            a disclosure that opens below the fold reads as nothing happening. */}
        {showPricing ? <PricingPanel /> : null}

        {billing.addons.length > 0 ? (
          <>
            <FormSection count={billing.addons.length}>Add-ons</FormSection>
            {billing.addons.map((addon) => (
              <FactRow key={addon.id} label={addon.name} mono>
                {formatMoney(addon.monthlyPrice, currency)}
              </FactRow>
            ))}
          </>
        ) : null}

        {/* Rule 7: the heading over a list carries its count. */}
        <FormSection count={invoices.length}>Invoices</FormSection>
        {invoices.length === 0 ? (
          <NothingHere>No invoices</NothingHere>
        ) : (
          invoices.map((invoice) => {
            const documentUrl = canDownloadInvoices ? invoice.documentUrl : null;
            const amount = formatMoney(Number(invoice.amount), invoice.currency);
            // `paidAt` is nullable even on a PAID row, and the board's value is
            // "<date> · <amount>". A charge with no settlement date shows the
            // amount alone rather than the words "Not set" where a date goes.
            const settled = invoice.paidAt ? formatDate(invoice.paidAt) : null;

            return (
              <FactRow
                key={invoice.id}
                mono
                label={
                  // A gateway reference is not a 12-character invoice number
                  // and the label column is a fixed 150px, so a long one
                  // truncates on one line rather than pushing the row to two.
                  <span className={styles.reference} title={invoice.reference}>
                    {invoice.reference}
                  </span>
                }
                action={
                  documentUrl ? (
                    // An anchor, not a button: a download is a navigation, and
                    // the middle click, the context menu and Save link as… all
                    // have to keep working.
                    <a
                      href={documentUrl}
                      download
                      className={styles.rowAction}
                      aria-label={`Download invoice ${invoice.reference}`}
                    >
                      <Download />
                      Download
                    </a>
                  ) : null
                }
              >
                {settled ? `${settled} · ${amount}` : amount}
              </FactRow>
            );
          })
        )}
      </FormPage>
    </PreferencesShell>
  );
}
