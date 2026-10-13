"use client";

import { BillingPageView } from "@/components/preferences/organization/billing-view";

import { FixtureManagement } from "../_fixtures/management";

/** Management → Billing with the board's figures (design/core-modules/html/management-billing.html). */
export default function ManagementBillingFixture() {
  return (
    <FixtureManagement active="billing">
      <BillingPageView
        onAddOn={() => {}}
        data={{
          company: { id: "c", name: "Floorcode", slug: "floorcode", tenantStatus: "ACTIVE", workspaceProfile: "GENERAL" },
          subscription: { id: "s", status: "ACTIVE", startedAt: "2026-08-01T00:00:00Z", currentPeriodEnd: "2026-11-01T00:00:00Z" },
          plan: null,
          charges: {
            currency: "USD",
            total: 96,
            lineItems: [
              { code: "ADDON_CRM_SUITE", label: "CRM", amount: 59, type: "addon" },
              { code: "ADDON_RETAIL_SUITE", label: "Tender", amount: 37, type: "addon" },
            ],
          },
          details: {
            ADDON_CRM_SUITE: "Deals, site visits and quotes. 212 customers",
            ADDON_RETAIL_SUITE: "The showroom till. 1 till, 148 products",
          },
          usage: { activeSites: 1, totalSites: 1, activeUsers: 6, totalUsers: 6 },
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
            { code: "ADDON_ADVANCED_PAYROLL", name: "Payroll", description: "Pay the fitters weekly, with NSSA and PAYE worked out", monthlyPrice: 19 },
            { code: "ADDON_STORES_CORE", name: "Stock", description: "Stores and stock levels across the showroom and vans", monthlyPrice: 15 },
          ],
          vane: { jobsThisMonth: 1284, monthlyAllowance: 5000 },
          payments: {
            onlinePaymentsSupported: false,
            methods: ["EcoCash"],
            guidance: "077 220 4180, James Nyabadza",
            invoiceDocumentsSupported: false,
            methodEditable: false,
            history: [
              { id: "p10", amount: 96, currency: "USD", status: "PAID", paidAt: "2026-10-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: null },
              { id: "p09", amount: 96, currency: "USD", status: "PAID", paidAt: "2026-09-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: null },
              { id: "p08", amount: 59, currency: "USD", status: "PAID", paidAt: "2026-08-01T00:00:00Z", periodMonths: 1, provider: "ECOCASH", reference: null },
            ],
          },
        }}
      />
    </FixtureManagement>
  );
}
