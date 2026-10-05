import { formatCount } from "@/lib/workspace/format";

/**
 * A shift's figures in words, the same wherever the shift is read: its record
 * (the Takings KPI, the Sales tab's Σ, the chart's title) and its PDF.
 */

/** "17 sales", "17 sales, 1 refund", "17 sales, 2 voided": every row of the Sales tab. */
export function salesWords(shift: { saleCount: number; refundCount: number; voidCount: number }): string {
  const parts = [`${formatCount(shift.saleCount)} ${shift.saleCount === 1 ? "sale" : "sales"}`];
  if (shift.refundCount) parts.push(`${formatCount(shift.refundCount)} ${shift.refundCount === 1 ? "refund" : "refunds"}`);
  if (shift.voidCount) parts.push(`${formatCount(shift.voidCount)} voided`);
  return parts.join(", ");
}

/** The takings chart's title for bars of this many hours. */
export function takingsTitle(hoursEach: number): string {
  if (hoursEach === 1) return "Takings per hour";
  if (hoursEach === 24) return "Takings per day";
  return `Takings per ${hoursEach} hours`;
}
