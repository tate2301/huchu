import type { CompanyPricingResult } from "@/lib/platform/entitlements";
import { formatMoney } from "@/lib/admin/format";
import { VERTICAL_RATE } from "@/lib/platform/verticals";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What a workspace pays a month and why: one line per vertical at the rate
 * its member count sets, the step-up said in words, and what one more
 * vertical would come to. The same reading the tenant sees on their Billing.
 */
export function PriceBreakdown({ workspaceName, pricing }: { workspaceName: string; pricing: CompanyPricingResult }) {
  return (
    <section aria-labelledby="price-heading" className="space-y-3">
      <h2 id="price-heading" className="t-section text-[var(--ink)]">
        What it pays
      </h2>
      {pricing.verticals === 0 ? (
        <p className="t-body text-[var(--text-body)]">
          {workspaceName} has no verticals, so it pays nothing. Add one on its Features page.
        </p>
      ) : (
        <>
          <p className="t-body text-[var(--text-body)]">
            {workspaceName} pays <span className="font-mono tabular-nums text-[var(--ink)]">{formatMoney(pricing.total)}</span> a month:{" "}
            {plural(pricing.verticals, "vertical", "verticals")} at <span className="font-mono tabular-nums">{formatMoney(pricing.each)}</span>{" "}
            each. {pricing.why}
          </p>
          <table className="w-full max-w-xl border-y border-[var(--line)] t-body">
            <caption className="sr-only">Charges a month, by vertical</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">A month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {pricing.lines.map((line) => (
                <tr key={line.vertical}>
                  <th scope="row" className="py-2 text-left font-normal text-[var(--ink)]">
                    {line.detail}
                  </th>
                  <td className="py-2 text-right font-mono tabular-nums">{formatMoney(line.amount)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 text-left font-medium text-[var(--ink)]">
                  Total
                </th>
                <td className="py-2 text-right font-mono font-medium tabular-nums text-[var(--ink)]">{formatMoney(pricing.total)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <p className="t-body-sm text-[var(--text-muted)]">
        With one more vertical it would pay <span className="font-mono tabular-nums">{formatMoney(pricing.withOneMore)}</span> a month.
        {pricing.over
          ? null
          : ` From the ${VERTICAL_RATE.includedMembers + 1}th member, each vertical is ${formatMoney(VERTICAL_RATE.large)}.`}
      </p>
    </section>
  );
}
