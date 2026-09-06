import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Gold: the mine's shifts, allocations, settlements and the gold books. Composed only into this host.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "gold",
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
};
