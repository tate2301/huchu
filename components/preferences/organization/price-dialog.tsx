"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BillingPreferences } from "@/lib/preferences/api";
import { VERTICAL_RATE } from "@/lib/platform/verticals";

import styles from "./organization.module.css";

const money = (value: number) => `$${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

/**
 * Billing's "See prices": how the price is worked out, with this workspace's
 * own figures, and how to add or take away a vertical. Changing what a
 * workspace runs is arranged with Corelith; nothing is bought here.
 */
export function PriceDialog({
  open,
  onOpenChange,
  charges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charges: BillingPreferences["charges"];
}) {
  // What their verticals come to at each rate; one, before they have any.
  const held = Math.max(1, charges.lines.length);
  const included = VERTICAL_RATE.includedMembers;
  const rows = [
    { label: `Up to ${included} members`, each: VERTICAL_RATE.small, now: !charges.over },
    { label: `${included + 1} members or more`, each: VERTICAL_RATE.large, now: charges.over },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className={styles.dialogTitle}>How the price works</DialogTitle>
          <DialogDescription>Each vertical is charged at the same rate, set by how many members the workspace has.</DialogDescription>
        </DialogHeader>

        <div className={`${styles.dialogBody} space-y-4`}>
          <p className="text-sm text-[var(--text-body)]">
            A vertical is one line of business: a shop, a school, a workshop. Everything in it is included. Members are the people
            with access; a school&apos;s parents and students do not count.
          </p>
          <table className="w-full border-y border-[var(--border)] text-sm">
            <caption className="sr-only">Price a month, by members</caption>
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th scope="col" className="py-2 font-medium">Members</th>
                <th scope="col" className="py-2 text-right font-medium">Each vertical</th>
                <th scope="col" className="py-2 text-right font-medium">
                  {held === 1 ? "One vertical" : `Your ${held} verticals`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="py-2 text-left font-normal text-[var(--text-strong)]">
                    {row.label}
                    {row.now ? <span className="text-[var(--text-muted)]">, you now</span> : null}
                  </th>
                  <td className="py-2 text-right font-mono tabular-nums">{money(row.each)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {money(row.each * held)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-[var(--text-body)]">
            {charges.why} One more vertical would make it <span className="font-mono tabular-nums">{money(charges.withOneMore)}</span> a
            month.
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            To add or take away a vertical, ask your Corelith contact. The new price applies from the next payment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
