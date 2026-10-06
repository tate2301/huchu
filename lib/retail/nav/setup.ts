import { DeviceMobile, ListChecks, Money, Receipt, Rows, ShieldCheck, Stamp, Storefront, Trash, UsersPair, Wrench } from "@/lib/icons";

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
    // SET-07: what every till receipt says, with a live preview.
    { href: "/retail/manage/receipts", icon: Receipt, label: "Receipts", requires: [["retail.receipts", "view"]] },
    { href: "/retail/manage/fiscal", icon: Stamp, label: "Fiscal device", requires: [["retail.fiscal", "view"]] },
    {
      href: "/retail/manage/posting",
      icon: Rows,
      label: "Posting to the books",
      requires: [["retail.posting", "view"]],
    },
    // ADM-02: the shop's people — retail roles, till PINs, site access (the People board).
    { href: "/retail/manage/people", icon: UsersPair, label: "Staff and PINs", requires: [["retail.people", "view"]] },
    // ADM-04: when the owner must say yes, who is asked and how; what is waiting now.
    { href: "/retail/manage/approvals", icon: ShieldCheck, label: "Approvals", requires: [["retail.approvals", "view"]] },
    { href: "/retail/manage/bin", icon: Trash, label: "Bin", requires: [["retail.bin", "view"]] },
  ],
};
