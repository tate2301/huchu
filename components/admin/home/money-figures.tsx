import { formatMoney } from "@/lib/admin/format";
import type { Figure, HomeFigures } from "@/lib/admin/projections";

const workspaces = (count: number) => `${count} ${count === 1 ? "workspace" : "workspaces"}`;

const FIGURES: Array<{ key: keyof HomeFigures; label: string; note: (figure: Figure) => string }> = [
  { key: "mrr", label: "Monthly recurring", note: (figure) => `${workspaces(figure.count)} paying` },
  { key: "dueThisMonth", label: "Due this month", note: (figure) => `${workspaces(figure.count)}, renewals and trials ending` },
  { key: "pastDue", label: "Past due", note: (figure) => `${workspaces(figure.count)} in their grace days` },
  { key: "atRisk", label: "At risk", note: (figure) => `${workspaces(figure.count)} past due or read-only` },
  { key: "renewals30", label: "Renewing in 30 days", note: (figure) => workspaces(figure.count) },
  { key: "trialsEnding14", label: "Trials ending in 14 days", note: (figure) => `${workspaces(figure.count)}, if they convert` },
];

/** Home's money band: six figures, each a month's price summed over the workspaces it names. */
export function MoneyFigures({ figures }: { figures: HomeFigures }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[var(--line)] py-4 sm:grid-cols-3 xl:grid-cols-6">
      {FIGURES.map(({ key, label, note }) => (
        <div key={key} className="min-w-0">
          <dt className="t-body-sm text-[var(--text-muted)]">{label}</dt>
          <dd className="mt-1 font-mono text-xl tabular-nums text-[var(--ink)]">{formatMoney(figures[key].value)}</dd>
          <dd className="t-body-sm text-[var(--text-muted)]">{note(figures[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
