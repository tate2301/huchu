"use client";

/**
 * One workflow run: which workflow fired, on what, and what each of its
 * actions did.
 *
 * A run's page exists for the run that went wrong. The list says that it had
 * a problem; this says which action, and what it said — a row per action in
 * the order they ran, the failed ones in red — with the workflow and the
 * record it touched one click away, so the fix is the next thing to do.
 */

import { useQuery } from "@tanstack/react-query";

import { Alert, Skeleton } from "@corelithzw/react";
import { ColumnList, ColumnName, SectionHeading, StatusDot } from "@/components/management/ui";
import { formatDate } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ACTION_LABELS, TRIGGER_LABELS } from "@/lib/crm/automation";
import { Clock, FlowArrow, Rule, Zap } from "@/lib/icons";

import { ENTITY_HREF, actionLabel, runOutcomes } from "./run-result";

type Run = {
  id: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  entity: string;
  recordId: string;
  result: unknown;
  durationMs: number | null;
  actionCount: number;
  createdAt: string;
  automation: { id: string; name: string; trigger: string; isEnabled: boolean } | null;
};

/** The section's measure. */
const WIDTH = 760;

const STATUS_WORDS: Record<Run["status"], string> = {
  SUCCEEDED: "Ran cleanly",
  PARTIAL: "Partly ran",
  FAILED: "Failed",
};

/** "DEAL" is a database value; "Deal" is the record somebody opens. */
function entityWord(entity: string): string {
  if (entity === "CLIENT") return "Company";
  return entity.charAt(0) + entity.slice(1).toLowerCase();
}

export function WorkflowRunRecordContent({ runId }: { runId: string }) {
  const query = useQuery({
    queryKey: ["crm-workflow-runs", "record", runId],
    queryFn: () =>
      fetchJson<{ run: Run; recordLabel: string | null }>(`/api/v2/crm/automations/runs/${runId}`),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Run not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been cleared."}
      </Alert>
    );
  }

  const { run, recordLabel } = query.data;
  const outcomes = runOutcomes(run.result);
  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  const recordHref = ENTITY_HREF[run.entity]?.(run.recordId) ?? null;
  const trigger = run.automation
    ? (TRIGGER_LABELS[run.automation.trigger as keyof typeof TRIGGER_LABELS] ?? run.automation.trigger)
    : null;
  const when = new Date(run.createdAt);
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  const attributes: RecordAttribute[] = [
    {
      id: "workflow",
      label: "Workflow",
      icon: FlowArrow,
      display: run.automation ? (
        <EntityLink href={`/crm/workflows/${run.automation.id}`}>{run.automation.name}</EntityLink>
      ) : undefined,
      value: run.automation?.name ?? null,
      placeholder: "Deleted since",
    },
    { id: "trigger", label: "When", icon: Zap, value: trigger, placeholder: "Trigger unknown" },
    {
      id: "record",
      label: entityWord(run.entity),
      icon: Rule,
      display:
        recordHref && recordLabel ? <EntityLink href={recordHref}>{recordLabel}</EntityLink> : undefined,
      value: recordLabel,
      placeholder: "Deleted since",
    },
    {
      id: "ran",
      label: "Ran",
      icon: Clock,
      tone: "code",
      value: `${formatDate(run.createdAt)}, ${time} UTC`,
    },
    ...(run.durationMs !== null
      ? [{ id: "took", label: "Took", icon: Clock, tone: "code" as const, value: `${run.durationMs} ms` }]
      : []),
  ];

  return (
    <RecordPageShell
      icon={FlowArrow}
      backHref="/crm/workflows/runs"
      backLabel="Workflow activity"
      title={run.automation?.name ?? "A deleted workflow"}
      subtitle={`${formatDate(run.createdAt)}, ${time} UTC`}
      // Rule 5: a clean run is what a run is; the band speaks up otherwise.
      status={
        run.status === "SUCCEEDED" ? null : { status: "failing", label: STATUS_WORDS[run.status] }
      }
      bandValue={`${run.actionCount} ${run.actionCount === 1 ? "action" : "actions"}`}
      related={
        <RecordRelated
          items={[
            ...(run.automation ? [{ href: `/crm/workflows/${run.automation.id}`, label: run.automation.name }] : []),
            ...(recordHref && recordLabel ? [{ href: recordHref, label: recordLabel }] : []),
          ]}
        />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab="actions"
      onTabChange={() => undefined}
      tabs={[
        {
          value: "actions",
          label: "What it did",
          icon: FlowArrow,
          count: outcomes.length,
          attention: failed > 0,
          content: (
            <section aria-labelledby="run-actions" style={{ maxWidth: WIDTH }}>
              <SectionHeading count={outcomes.length} maxWidth={WIDTH} className="mt-0">
                <span id="run-actions">What it did</span>
              </SectionHeading>
              <ColumnList
                label="What it did"
                maxWidth={WIDTH}
                empty="It had nothing to do: no action ran."
                columns={[
                  { id: "action", label: "Action" },
                  { id: "result", label: "Result" },
                ]}
                rows={outcomes.map((outcome, index) => ({
                  id: String(index),
                  cells: {
                    action: (
                      <ColumnName
                        name={
                          outcome.type
                            ? (ACTION_LABELS[outcome.type as keyof typeof ACTION_LABELS] ?? actionLabel(outcome.type))
                            : "An action"
                        }
                        meta={outcome.detail ?? undefined}
                      />
                    ),
                    result: outcome.ok ? (
                      <StatusDot tone="success" label="Done" />
                    ) : (
                      <StatusDot tone="danger" label="Failed" />
                    ),
                  },
                }))}
              />
            </section>
          ),
        },
      ]}
    />
  );
}
