"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatRate, type ReportRange } from "@/lib/crm/reports";
import { formatDuration, type FailureGroup, type RulePerformance, type RunTotals } from "@/lib/crm/run-insights";
import { RecordList } from "@/components/crm/records/record-list";

type Insights = {
  range: ReportRange;
  totals: RunTotals;
  byRule: RulePerformance[];
  failures: FailureGroup[];
  truncated: boolean;
};

/** `ADD_TAG` is a database value; "Add tag" is what somebody reads. */
function actionLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * Whether the workflows are going well.
 *
 * The run list says what happened, one line at a time. That answers "did this
 * fire" and answers nothing about the forty identical failures three screens
 * down, which are one problem wearing forty rows.
 *
 * There is no in-progress count and no credit meter here. This engine runs a
 * rule synchronously the moment its event happens and meters nothing, so both
 * would be a permanent zero pretending to be a measurement. What it does cost
 * is actions carried out, and that is counted.
 */
export function RunInsightsPanel({ range }: { range: ReportRange }) {
  const query = useQuery({
    queryKey: ["crm-workflow-insights", range],
    queryFn: () => fetchJson<Insights>(`/api/v2/crm/automations/insights?range=${range}`),
  });

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={96} />
        ))}
      </div>
    );
  }

  if (query.error) {
    return (
      <Alert tone="danger" title="Couldn't summarise the runs">
        {getApiErrorMessage(query.error)}
      </Alert>
    );
  }

  const insights = query.data;
  if (!insights) return null;
  const { totals } = insights;

  if (totals.runs === 0) {
    return (
      <EmptyState
        title="Nothing has run in this period"
        body="Once a workflow is live, how it is behaving shows up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Runs"
          value={String(totals.runs)}
          footer={`${totals.succeeded} clean · ${totals.partial} half done · ${totals.failed} failed`}
        />
        <StatCard
          label="Went through cleanly"
          value={formatRate(totals.cleanRate)}
          // Partial counts against it: a rule that half-worked is a rule
          // somebody has to go and finish by hand.
          footer="A half-done run counts against this"
        />
        <StatCard
          label="Typical runtime"
          value={formatDuration(totals.medianMs)}
          footer={
            totals.untimed > 0
              ? `Median · slowest ${formatDuration(totals.slowestMs)} · ${totals.untimed} not timed`
              : `Median · slowest ${formatDuration(totals.slowestMs)}`
          }
        />
        <StatCard
          label="Actions carried out"
          value={String(totals.actionsRun)}
          footer="What these rules actually spend"
        />
      </div>

      {insights.truncated ? (
        <Alert tone="info" title="Showing a sample">
          There were more runs in this period than this summary reads. The figures above are
          drawn from the most recent of them.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Workflows that need attention" subtitle="Worst first, not busiest first">
          {insights.byRule.length === 0 ? (
            <EmptyState title="Nothing has run yet" />
          ) : (
            <>
            {/* A phone reads this as the list it is: which workflow, how much
                trouble it is in, and the run counts underneath. These rows go
                somewhere, so they are links rather than plain rows. */}
            <RecordList
              className="md:hidden"
              rows={insights.byRule.map((rule) => ({
                id: rule.automationId,
                href: `/crm/workflows/${rule.automationId}`,
                title: rule.automationName,
                subtitle: `${rule.runs} runs · typically ${formatDuration(rule.medianMs)}`,
                facts: [{ value: formatRate(rule.troubleRate), mono: true }],
              }))}
            />

            <table className="hidden w-full text-sm md:table">
              <thead className="text-left text-sm font-medium text-[var(--text-muted)]">
                <tr>
                  <th className="pb-1 font-medium">Workflow</th>
                  <th className="pb-1 text-right font-medium">Runs</th>
                  <th className="pb-1 text-right font-medium">Trouble</th>
                  <th className="pb-1 text-right font-medium">Typical</th>
                </tr>
              </thead>
              <tbody>
                {insights.byRule.map((rule) => (
                  <tr key={rule.automationId} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5">
                      <Link
                        href={`/crm/workflows/${rule.automationId}`}
                        className="underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
                      >
                        {rule.automationName}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right font-mono">{rule.runs}</td>
                    <td
                      className={
                        rule.troubleRate > 0
                          ? "py-1.5 text-right font-mono text-[var(--status-error-text)]"
                          : "py-1.5 text-right font-mono text-[var(--text-muted)]"
                      }
                    >
                      {formatRate(rule.troubleRate)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatDuration(rule.medianMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </Card>

        <Card
          title="What keeps going wrong"
          subtitle="Grouped, because the same message forty times is one problem"
        >
          {insights.failures.length === 0 ? (
            <EmptyState title="Nothing has failed in this period" />
          ) : (
            <ul className="space-y-2">
              {insights.failures.map((failure) => (
                <li
                  key={`${failure.action}-${failure.detail}`}
                  className="flex items-baseline gap-2 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-strong)]">
                      {actionLabel(failure.action)}
                    </span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {failure.detail}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm text-[var(--status-error-text)]">
                    ×{failure.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
