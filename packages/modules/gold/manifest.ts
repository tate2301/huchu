import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { mergeSchema, reportTemplate } from "@corelithzw/module-documents/default-template-catalog";

/**
 * Gold: the mine's shifts, allocations, settlements and the gold books. Composed only into this host.
 * Data only.
 */
export const manifest: ModuleManifest = {
  id: "gold",
  requires: ["people", "books", "records", "workflow", "documents", "notifications"],
  notifications: {
    viewPaths: {
      GOLD_SHIFT_ALLOCATION: "/gold/settlement/approvals?allocationId={id}",
    },
    approvalActions: {
      HR_GOLD_PAYOUT_SUBMITTED: [
        {
          key: "approve_gold_payout_allocation",
          label: "Approve",
          kind: "api",
          href: "/api/gold/shift-allocations/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_gold_payout_allocation",
          label: "Reject",
          kind: "api",
          href: "/api/gold/shift-allocations/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this settlement allocation? You can add a note from the allocation screen.",
        },
      ],
    },
  },
  documents: {
    templates: [
      {
        key: "reports.shift",
        sourceKey: "reports.shift",
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        name: "Shift Report Default",
        description: "Default print-ready template for shift report list exports.",
        schema: reportTemplate("Shift Report"),
      },
      {
        key: "reports.plant",
        sourceKey: "reports.plant",
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        name: "Plant Report Default",
        description: "Default print-ready template for plant report list exports.",
        schema: reportTemplate("Plant Report"),
      },
      {
        key: "dashboard.executive-summary",
        sourceKey: "dashboard.executive-summary",
        documentType: "DASHBOARD_PACK",
        targetType: "DASHBOARD",
        name: "Executive Dashboard Default",
        description: "Default branded dashboard summary template.",
        schema: mergeSchema({
          page: {
            orientation: "portrait",
            marginMm: 10,
          },
          table: {
            compact: true,
          },
          labels: {
            documentTitle: "Executive Summary",
          },
          footer: {
            showPaymentDetails: false,
          },
        }),
      },
    ],
  },
};
