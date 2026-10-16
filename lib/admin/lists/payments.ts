import { listPayments } from "@/lib/admin/billing";
import { PAYMENT_STATE, paymentMethod } from "@/lib/admin/payment-words";
import { prisma } from "@/lib/prisma";
import type { ListGrant, ListSpec, ReportRow, Tone } from "@/lib/reports/types";
import { dayKey, formatTime } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * Payments, every workspace's: from the gateways and recorded by hand. Each tab
 * is a question billing asks — what needs someone, what came in, what did not.
 * A payment nobody heard back about is settled here, once the statement says.
 */

const READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "payment.review"], ["admin", "member.signInAs"]];
const REVIEW: ListGrant[] = [["admin", "payment.review"]];

/** The most payments the list holds: newest first, enough for any statement worth checking. */
const LOADED = 5000;

const OPEN = [{ column: "status", op: "is" as const, value: ["PENDING", "INITIATED"] }];

const BADGE_TONE: Record<string, Tone> = { neutral: "neutral", warn: "warn", success: "ok", danger: "bad", info: "info" };
const STATE_TONES = Object.fromEntries(
  Object.values(PAYMENT_STATE).map((state) => [state.label, BADGE_TONE[state.tone] ?? "neutral"]),
) as Record<string, Tone>;

const tab = (key: string, label: string, statuses: string[]) => ({
  key,
  label,
  where: [{ column: "status", op: "is" as const, value: statuses }],
});

export const PAYMENTS_LIST: ListSpec = {
  noun: "payments",
  read: READ,
  search: { placeholder: "Reference, workspace or method", keys: ["reference", "workspace", "slug", "method"] },
  tabs: [
    { key: "all", label: "All", where: [] },
    { ...tab("needs-someone", "Not confirmed", ["PENDING"]), empty: "Every payment has been heard back about." },
    tab("waiting", "Waiting on the customer", ["INITIATED"]),
    tab("paid", "Paid", ["PAID"]),
    tab("failed", "Failed", ["FAILED", "CANCELLED"]),
  ],
  filters: [
    { key: "when", label: "When", type: "period", any: "Any time", column: "when", primary: true, default: "any" },
    {
      key: "method",
      label: "Method",
      type: "choice",
      any: "Any method",
      column: "method",
      primary: true,
      optionsFromLoader: true,
    },
  ],
  sorts: [
    { key: "newest", label: "Newest first", rules: [{ column: "when", dir: "desc" }] },
    { key: "oldest", label: "Oldest first", rules: [{ column: "when", dir: "asc" }] },
    { key: "amount", label: "Largest first", rules: [{ column: "amount", dir: "desc" }, { column: "when", dir: "desc" }] },
    { key: "workspace", label: "Workspace A–Z", rules: [{ column: "workspace", dir: "asc" }, { column: "when", dir: "desc" }] },
  ],
  groups: ["state", "method", "workspace"],
  columns: [
    { key: "reference", label: "Reference", kind: "code", cell: "mono", width: "minmax(150px,1fr)", align: "start", priority: 1 },
    {
      key: "workspace",
      label: "Workspace",
      kind: "text",
      cell: "link",
      sortable: true,
      width: "minmax(160px,1.2fr)",
      align: "start",
      priority: 1,
    },
    { key: "method", label: "Method", kind: "text", cell: "text", width: "120px", align: "start", priority: 2 },
    { key: "forWhat", label: "For", kind: "text", cell: "muted", width: "minmax(120px,1fr)", align: "start", priority: 3 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: STATE_TONES,
      width: "180px",
      align: "start",
      priority: 1,
      summary: { tones: ["warn"], label: "to confirm" },
    },
    { key: "failure", label: "Why it failed", kind: "text", cell: "muted", width: "minmax(140px,1fr)", align: "start", priority: 3, hidden: true },
    { key: "when", label: "When", kind: "date", cell: "date", timeKey: "time", dayFormat: "relative", sortable: true, width: "150px", align: "start", priority: 2 },
    { key: "amount", label: "Amount", kind: "money", currency: "USD", currencyKey: "currency", cell: "money", total: "sum", sortable: true, width: "110px", align: "end", priority: 1 },
  ],
  rowHref: "/admin/w/{slug}/billing",
  rowMenu: [
    { key: "billing", label: "Open its billing", requires: READ, do: { href: "/admin/w/{slug}/billing" } },
    {
      key: "paid",
      label: "Confirm as paid…",
      separated: true,
      requires: REVIEW,
      when: OPEN,
      do: { run: "payments-confirm", endpoint: "/api/platform-admin/payments/confirm" },
    },
    {
      key: "failed",
      label: "Mark as failed…",
      tone: "bad",
      requires: REVIEW,
      when: OPEN,
      do: { run: "payments-fail", endpoint: "/api/platform-admin/payments/fail" },
    },
  ],
  bulk: [
    { key: "paid", label: "Confirm as paid", requires: REVIEW, when: OPEN, do: { run: "payments-confirm", endpoint: "/api/platform-admin/payments/confirm" } },
    { key: "export" },
    {
      key: "failed",
      label: "Mark as failed",
      tone: "bad",
      more: true,
      requires: REVIEW,
      when: OPEN,
      do: { run: "payments-fail", endpoint: "/api/platform-admin/payments/fail" },
    },
  ],
  card: { title: "workspace", badge: "state", figure: "amount", meta: "{method} · {reference}", metaMono: ["reference"] },
  empty: {
    icon: "Receipt",
    title: "No payments yet",
    line: "A payment shows here when a customer pays through a gateway, or when one is recorded by hand on a workspace's billing.",
  },
};

export const paymentsSource: AdminListSource = {
  key: "admin-payments",
  title: "Payments",
  list: PAYMENTS_LIST,
  /** The ways money has come in: each gateway, and each method recorded by hand. */
  async options() {
    const providers = await prisma.subscriptionPayment.findMany({ distinct: ["provider"], select: { provider: true } });
    const methods = [...new Set(providers.map((row) => paymentMethod(row.provider)))].sort((a, b) => a.localeCompare(b));
    return { method: methods.map((method) => ({ value: method, label: method })) };
  },
  async load() {
    const payments = await listPayments({}, LOADED);
    return payments.map((payment): ReportRow => {
      const months = `${payment.periodMonths} ${payment.periodMonths === 1 ? "month" : "months"}`;
      return {
        id: payment.id,
        reference: payment.providerReference,
        // The row's name, in asks and refusals: what the statement says.
        name: `${payment.providerReference} from ${payment.company.name}`,
        workspace: payment.company.name,
        slug: payment.company.slug,
        method: paymentMethod(payment.provider),
        forWhat: months,
        state: PAYMENT_STATE[payment.status]?.label ?? payment.status,
        status: payment.status,
        failure: payment.failureReason,
        when: dayKey(payment.createdAt),
        time: formatTime(payment.createdAt),
        amount: Number(payment.amount),
        currency: payment.currency,
      };
    });
  },
};
