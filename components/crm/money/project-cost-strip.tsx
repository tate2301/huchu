"use client";

import { formatMoney } from "./money";

export type ProjectCosts = {
  approved: string;
  outstanding: string;
  committed: string;
  spent: string;
  received: string;
  budget: string | null;
  remaining: string | null;
  currency: string;
};

/**
 * What a project has cost, as four figures that are not summed.
 *
 * Committing 200 to somebody and then having them spend it is one 200, and a
 * strip that showed 400 would have people cancelling work that is inside its
 * budget. So the spend stands on its own, what is approved and what is out in
 * somebody's pocket sit beside it, and the last figure says what is left of
 * the budget — or by how much it is over.
 */
export function ProjectCostStrip({ costs }: { costs: ProjectCosts }) {
  const over = costs.budget !== null && Number(costs.remaining) < 0;

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
      <Figure label="Spent" value={formatMoney(costs.spent, costs.currency)} />
      <Figure label="Approved, unpaid" value={formatMoney(costs.approved, costs.currency)} />
      <Figure label="Out there" value={formatMoney(costs.outstanding, costs.currency)} />
      <Figure
        label={costs.budget === null ? "Budget" : over ? "Over by" : "Left"}
        value={
          costs.budget === null
            ? "not set"
            : formatMoney(
                over ? String(Math.abs(Number(costs.remaining))) : costs.remaining!,
                costs.currency,
              )
        }
        strong
        alert={over}
      />
    </dl>
  );
}

function Figure({
  label,
  value,
  strong,
  alert,
}: {
  label: string;
  value: string;
  strong?: boolean;
  alert?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd
        className={
          alert
            ? "font-mono text-sm font-semibold tabular-nums text-[var(--badge-bad-fg)]"
            : strong
              ? "font-mono text-sm font-semibold tabular-nums text-[var(--text-strong)]"
              : "font-mono text-sm tabular-nums text-[var(--text-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
