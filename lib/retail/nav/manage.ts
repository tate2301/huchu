import { DeviceMobile, GearSix, ListChecks, Rows, Stamp, Trash } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/**
 * Management: the gear at the foot of the rail, not a mark among the others
 * (`lib/rail/model.ts`). Until ADM-01 gives each settings page its own
 * resource, `retail.setup:view` stands for them (00-foundations 5.3.4).
 */
export const manageNav: RetailNavModule = {
  id: "retail-manage",
  title: "Management",
  icon: GearSix,
  items: [
    { href: "/retail/manage/tills", icon: DeviceMobile, label: "Tills and devices", requires: [["retail.setup", "view"]] },
    { href: "/retail/manage/till-rules", icon: ListChecks, label: "Till rules", requires: [["retail.setup", "view"]] },
    { href: "/retail/manage/fiscal", icon: Stamp, label: "Fiscal device", requires: [["retail.setup", "view"]] },
    // Owner and bookkeeper; the manager's column is blank.
    {
      href: "/retail/manage/posting",
      icon: Rows,
      label: "Posting to the books",
      requires: [["retail.posting", "view"]],
    },
    { href: "/retail/manage/bin", icon: Trash, label: "Bin", requires: [["retail.setup", "view"]] },
  ],
};
