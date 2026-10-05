import { DeviceMobile, GearSix, ListChecks, Rows, Stamp, Trash } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/**
 * Management: the gear at the foot of the rail, not a mark among the others
 * (`lib/rail/model.ts`). Each item reads its own resource's `view` from the
 * Roles matrix (ADM-01). Items are listed in 00-foundations 5.3.4 order, and
 * only for pages that exist; the unit that builds a page adds its item here
 * with the grant 80-admin names for it — Company `retail.company`, Sites
 * `retail.sites`, Payments `retail.payments`, Receipts `retail.receipts`,
 * People `retail.people`, Approvals `retail.approvals`, Loyalty
 * `retail.loyalty`, Activity `retail.activity`, Plan and billing
 * `retail.billing` (all `view`).
 */
export const manageNav: RetailNavModule = {
  id: "retail-manage",
  title: "Management",
  icon: GearSix,
  items: [
    { href: "/retail/manage/tills", icon: DeviceMobile, label: "Tills and devices", requires: [["retail.tills", "view"]] },
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
