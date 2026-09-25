"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import styles from "./organization.module.css";
import { PricingPanel } from "./pricing-panel";

/**
 * Billing's "Change plan" verb.
 *
 * The plan's itemised modules used to open as a disclosure under the Plan
 * section, which pushed the charges and invoices down the page and left the
 * page's own total somewhere below the fold. A dialog keeps the page as it
 * was and gives the module list the whole card to be browsed in — expanding a
 * module, or showing what is available but off.
 *
 * `PricingPanel` only mounts while the dialog is open, so its query does not
 * run for somebody who opened Billing to read an invoice.
 */
export function ChangePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className={styles.dialogTitle}>Change plan</DialogTitle>
          {/* `DialogDescription` is `sr-only` by this repo's own styling. */}
          <DialogDescription>
            Modules on this workspace and what each costs per month.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.dialogBody}>
          <PricingPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
