"use client";

import { MarketplacePageView } from "@/components/management/marketplace-view";

import { FixtureManagement } from "../_fixtures/management";

/** Management → Marketplace with the board's items (design/core-modules/html/management-marketplace.html). */
export default function ManagementMarketplaceFixture() {
  return (
    <FixtureManagement active="marketplace">
      <MarketplacePageView
        sections={[
          {
            title: "For flooring",
            items: [
              { key: "f1", kind: "forms", name: "Carpet measure", detail: "Form that drafts a carpet quote by the roll width", maker: "Corelith", price: "Free", href: "#" },
              { key: "f2", kind: "documents", name: "Job sheet with a floor plan", detail: "Document printed for the fitters", maker: "Corelith", price: "Free", href: "#" },
              { key: "f3", kind: "reports", name: "Fitter week", detail: "Report of visits, quotes and pay by fitter", maker: "Corelith", price: "Free", href: "#" },
            ],
          },
          {
            title: "Add-ons from Corelith",
            items: [
              { key: "a1", kind: "apps", name: "Payroll", detail: "Weekly pay with NSSA and PAYE", maker: "Corelith", price: "$19.00 a month", href: "#", mark: "/brand/shift-mark.svg" },
              { key: "a2", kind: "apps", name: "Stock", detail: "Stores, stock levels and reorders", maker: "Corelith", price: "$15.00 a month", href: "#", mark: "/brand/silo-mark.svg" },
            ],
          },
        ]}
      />
    </FixtureManagement>
  );
}
