"use client";

import { FactList } from "@/components/management/ui";

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
 * list that added up to 400 would have people cancelling work that is inside
 * its budget. So the spend stands on its own, what is approved and what is
 * out in somebody's pocket sit under it, and the last figure says what is
 * left of the budget — or by how much it is over.
 *
 * Fact rows with the figures against the right edge, so the four line up
 * digit under digit the way a statement does.
 */
export function ProjectCostStrip({ costs, maxWidth }: { costs: ProjectCosts; maxWidth?: number }) {
  const over = costs.budget !== null && Number(costs.remaining) < 0;
  const money = (value: string) => formatMoney(value, costs.currency);

  return (
    <FactList
      align="end"
      maxWidth={maxWidth}
      labelWidth={200}
      items={[
        { label: "Spent", value: money(costs.spent), mono: true },
        { label: "Approved, not yet paid", value: money(costs.approved), mono: true },
        { label: "Floats not accounted for", value: money(costs.outstanding), mono: true },
        costs.budget === null
          ? { label: "Left of the budget", value: "No budget", tone: "muted" }
          : over
            ? {
                label: "Over the budget by",
                value: money(String(Math.abs(Number(costs.remaining)))),
                mono: true,
                tone: "danger",
              }
            : { label: "Left of the budget", value: money(costs.remaining!), mono: true },
      ]}
    />
  );
}
