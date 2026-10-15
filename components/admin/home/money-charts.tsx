"use client";

import { AdminDistributionChart, AdminTrendChart } from "@/components/charts/admin-headless-charts";
import { formatMoney } from "@/lib/admin/format";

export type ProjectionPoint = { monthStart: string; paid: number; expected: number };
export type MixPoint = { vertical: string; label: string; workspaces: number; value: number };

const SHORT_MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const LONG_MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const wholeDollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/**
 * The next twelve months, a month's money each: what is already paid into it,
 * and what to expect if every paying workspace renews and every trial
 * converts. One measure, one axis.
 */
export function ProjectionChart({ months }: { months: ProjectionPoint[] }) {
  return (
    <section aria-labelledby="projection-heading" className="min-w-0 space-y-2">
      <h2 id="projection-heading" className="t-section text-[var(--ink)]">
        The next 12 months
      </h2>
      <p className="t-body-sm text-[var(--text-muted)]">
        Paid counts a workspace in the months its payments reach. Expected assumes every paying workspace renews at today&apos;s
        price and every trial converts from the month it ends.
      </p>
      <AdminTrendChart
        height={240}
        rows={months.map((month) => ({
          label: SHORT_MONTH.format(new Date(month.monthStart)),
          tooltipLabel: LONG_MONTH.format(new Date(month.monthStart)),
          paid: month.paid,
          expected: month.expected,
        }))}
        series={[
          { key: "expected", label: "Expected", kind: "line", color: "var(--text-muted)", dashed: true },
          { key: "paid", label: "Paid", kind: "area", color: "var(--action)" },
        ]}
        valueFormatter={formatMoney}
        yTickFormatter={wholeDollars}
        emptyLabel="No workspace pays anything yet."
      />
      <table className="sr-only">
        <caption>A month&apos;s money, paid and expected</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Paid</th>
            <th scope="col">Expected</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.monthStart}>
              <th scope="row">{LONG_MONTH.format(new Date(month.monthStart))}</th>
              <td>{formatMoney(month.paid)}</td>
              <td>{formatMoney(month.expected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** What the paying workspaces pay a month, by vertical. */
export function VerticalMixChart({ mix }: { mix: MixPoint[] }) {
  return (
    <section aria-labelledby="mix-heading" className="min-w-0 space-y-2">
      <h2 id="mix-heading" className="t-section text-[var(--ink)]">
        By vertical
      </h2>
      <p className="t-body-sm text-[var(--text-muted)]">What paying workspaces pay a month for each.</p>
      <AdminDistributionChart
        height={Math.max(120, mix.length * 34)}
        rows={mix.map((row) => ({
          id: row.vertical,
          label: row.label,
          value: row.value,
          secondary: `${row.workspaces} ${row.workspaces === 1 ? "workspace" : "workspaces"}`,
          color: "var(--action)",
        }))}
        valueLabel="A month, by vertical"
        valueFormatter={wholeDollars}
        emptyLabel="No workspace pays anything yet."
      />
    </section>
  );
}
