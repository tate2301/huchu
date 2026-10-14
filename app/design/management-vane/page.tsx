"use client";

import { VaneSettingsPageView } from "@/app/management/vane/vane-settings-view";

import { FixtureManagement } from "../_fixtures/management";

/** Management → Vane with the board's figures (design/core-modules/html/management-vane.html). */
export default function ManagementVaneFixture() {
  return (
    <FixtureManagement active="vane">
      <VaneSettingsPageView
        onChange={() => {}}
        data={{
          workspaceName: "Floorcode",
          canChange: true,
          roles: [
            { role: "SUPERADMIN", label: "Superadmin" },
            { role: "MANAGER", label: "Manager" },
          ],
          watchables: [
            { key: "books", name: "Books", detail: "Invoices, payments, the bank and VAT", mark: { kind: "icon", icon: "books" } },
            { key: "crm", name: "CRM", detail: "Customers, deals, site visits and quotes", mark: { kind: "image", src: "/brand/flare-mark.svg" } },
            { key: "retail", name: "Tender", detail: "Sales, tills and cash-ups", mark: { kind: "image", src: "/brand/tender-mark.svg" } },
            { key: "reports", name: "Reports", detail: "Every report and the questions behind it", mark: { kind: "icon", icon: "reports" } },
          ],
          settings: {
            paused: false,
            watches: {},
            raiseIssues: true,
            plans: true,
            drafts: true,
            readsPeoplePrivate: false,
            quietFrom: "20:00",
            quietTo: "06:00",
            routing: {},
            monthlyAllowance: 5000,
            month: { jobs: 1284, issues: 37, suggestionsTaken: 29, resetsOn: "2026-11-01" },
            working: true,
          },
        }}
      />
    </FixtureManagement>
  );
}
