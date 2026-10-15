"use client";

import { BillingPageView } from "@/components/preferences/organization/billing-view";

import { FixtureManagement } from "../_fixtures/management";

/** Management → Billing with the board's figures (design/core-modules/html/management-billing.html). */
export default function ManagementBillingFixture() {
  return (
    <FixtureManagement active="billing">
      <BillingPageView
        onAskPrice={() => {}}
        data={{
          company: { id: "c", name: "Floorcode", slug: "floorcode", tenantStatus: "ACTIVE", workspaceProfile: "GENERAL" },
          subscription: { id: "s", status: "ACTIVE", startedAt: "2026-08-01T00:00:00Z", currentPeriodEnd: "2026-11-01T00:00:00Z" },
          charges: {
            currency: "USD",
            total: 198,
            each: 99,
            members: 6,
            over: true,
            why: "6 members, over the 5 included, so each vertical is $99.",
            withOneMore: 297,
            lines: [
              { vertical: "RETAIL", label: "Retail", detail: "Retail, 6 members", amount: 99 },
              { vertical: "CRM", label: "Sales and CRM", detail: "Sales and CRM, 6 members", amount: 99 },
            ],
          },
          health: {
            state: "ACTIVE",
            status: "ACTIVE",
            shouldBlock: false,
            warningDays: 7,
            graceDays: 7,
            currentPeriodEnd: "2026-11-01T00:00:00Z",
            daysUntilEnd: 19,
            daysOverdue: null,
            reason: "",
          },
          available: [
            { vertical: "PAYROLL", label: "Payroll services" },
            { vertical: "WORKSHOP", label: "Service workshop" },
          ],
          vane: { jobsThisMonth: 1284, monthlyAllowance: 5000 },
          payments: {
            onlinePaymentsSupported: false,
            methods: ["EcoCash"],
            guidance: "077 220 4180, James Nyabadza",
            invoiceDocumentsSupported: false,
            methodEditable: false,
            history: [
              { id: "p10", amount: 198, currency: "USD", status: "PAID", paidAt: "2026-10-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: "" },
              { id: "p09", amount: 198, currency: "USD", status: "PAID", paidAt: "2026-09-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: "" },
              { id: "p08", amount: 99, currency: "USD", status: "PAID", paidAt: "2026-08-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: "" },
            ],
          },
        }}
      />
    </FixtureManagement>
  );
}
