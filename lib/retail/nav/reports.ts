import { FileText } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/**
 * Reports: every template, built in or saved by the team. Owner, manager and
 * bookkeeper only (98-decisions C-35).
 *
 * Borrowed from the reporting module at `/reports` until INS-07/INS-08 build
 * `/retail/reports` and its areas (C-16); they replace `borrowed` with the
 * module's own items.
 */
export const reportsNav: RetailNavModule = {
  id: "retail-reports",
  title: "Reports",
  icon: FileText,
  items: [],
  borrowed: [{ moduleId: "reporting", href: "/reports", requires: [["retail.reports", "view"]] }],
};
