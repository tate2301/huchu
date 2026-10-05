import { DeviceMobile, ListChecks, Money, Rows, Stamp, Storefront, Trash, Wrench } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/**
 * Setup: the shop's own settings, a module in the retail sidebar (98-decisions,
 * "Owner direction, 5 October"). Not Management: the gear at the foot of the
 * rail opens the Management surface (`/management/master-data`), and what it
 * already has (company details, branding, users, sites, billing, activity) is
 * not rebuilt here — except Sites: shops are managed here, on the same
 * `Site` model, because Management's sites page is a mining register.
 *
 * Each item reads its own resource's `view` from the Roles matrix (ADM-01).
 * Routes stay under `/retail/manage/*`; the unit that builds a page adds its
 * item here with the grant 80-admin names for it — Payments
 * `retail.payments`, Receipts `retail.receipts`, Staff and PINs
 * `retail.people`, Approvals `retail.approvals`, Loyalty `retail.loyalty` (all
 * `view`).
 *
 * Shop is `/retail/manage/company` (FND-08): the business type, the liquor
 * features and the money rules, on the SettingsFrame.
 */
export const setupNav: RetailNavModule = {
  id: "retail-setup",
  title: "Setup",
  icon: Wrench,
  items: [
    { href: "/retail/manage/company", icon: Storefront, label: "Shop", requires: [["retail.company", "view"]] },
    // SET-02 (98-decisions, owner direction 8): shops, the places inside them and the default site.
    { href: "/retail/manage/sites", icon: Storefront, label: "Sites", requires: [["retail.sites", "view"]] },
    { href: "/retail/manage/tills", icon: DeviceMobile, label: "Tills and devices", requires: [["retail.tills", "view"]] },
    // SET-05: the tenders, the ZiG rate and EcoCash.
    { href: "/retail/manage/payments", icon: Money, label: "Payments", requires: [["retail.payments", "view"]] },
    {
      href: "/retail/manage/till-rules",
      icon: ListChecks,
      label: "Till rules",
      requires: [["retail.till-rules", "view"]],
    },
    { href: "/retail/manage/fiscal", icon: Stamp, label: "Fiscal device", requires: [["retail.fiscal", "view"]] },
    {
      href: "/retail/manage/posting",
      icon: Rows,
      label: "Posting to the books",
      requires: [["retail.posting", "view"]],
    },
    { href: "/retail/manage/bin", icon: Trash, label: "Bin", requires: [["retail.bin", "view"]] },
  ],
};
