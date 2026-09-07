/**
 * What the workflows have been costing and where they break.
 *
 * A run count next to a rule says it fired. It does not say whether the last
 * forty firings did anything, which action keeps failing, or which rule is
 * quietly taking two seconds off every stage change. Those are the three
 * questions somebody has when they open this screen, and none of them was
 * answerable.
 *
 * Everything here is arithmetic over rows the caller fetched, for the same
 * reason the sales reports are: the interesting part is which denominator you
 * chose, and that is an argument settled by a test rather than by reading SQL.
 */

export type RunStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export type RunRecord = {
  automationId: string;
  automationName: string;
  status: RunStatus;
  /** Null for runs recorded before duration was measured. */
  durationMs: number | null;
  actionCount: number;
  createdAt: Date | string;
  /** Per-action outcomes, as the runner stored them. */
  result: unknown;
};

export type RunTotals = {
  runs: number;
  succeeded: number;
  partial: number;
  failed: number;
  /** Share of runs that did everything they set out to. */
  cleanRate: number;
  /** Actions carried out — the unit of work these rules actually spend. */
  actionsRun: number;
  /** Null when nothing in the window carried a measured duration. */
  medianMs: number | null;
  averageMs: number | null;
  slowestMs: number | null;
  /** How many runs predate timing, so an average is not read as complete. */
  untimed: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function runTotals(runs: RunRecord[]): RunTotals {
  const succeeded = runs.filter((run) => run.status === "SUCCEEDED").length;
  const partial = runs.filter((run) => run.status === "PARTIAL").length;
  const failed = runs.filter((run) => run.status === "FAILED").length;

  const timed = runs
    .map((run) => run.durationMs)
    .filter((value): value is number => typeof value === "number" && value >= 0);

  return {
    runs: runs.length,
    succeeded,
    partial,
    failed,
    // Partial counts against it. A rule that half-worked is a rule somebody
    // has to go and finish by hand, which is the thing automation was for.
    cleanRate: runs.length > 0 ? succeeded / runs.length : 0,
    actionsRun: runs.reduce((sum, run) => sum + (run.actionCount || 0), 0),
    medianMs: median(timed),
    averageMs:
      timed.length > 0
        ? Math.round(timed.reduce((sum, value) => sum + value, 0) / timed.length)
        : null,
    slowestMs: timed.length > 0 ? Math.max(...timed) : null,
    untimed: runs.length - timed.length,
  };
}

export type RulePerformance = {
  automationId: string;
  automationName: string;
  runs: number;
  failed: number;
  partial: number;
  actionsRun: number;
  medianMs: number | null;
  /** Failed and partial together, over runs. */
  troubleRate: number;
};

/**
 * Per rule, worst first.
 *
 * Sorted by how often a rule goes wrong rather than by how often it runs: the
 * rule that fires a thousand times a week and never fails is not the one that
 * needs attention, however impressive the number next to it.
 */
export function rulePerformance(runs: RunRecord[]): RulePerformance[] {
  const byRule = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const list = byRule.get(run.automationId);
    if (list) list.push(run);
    else byRule.set(run.automationId, [run]);
  }

  return Array.from(byRule.entries())
    .map(([automationId, rows]) => {
      const failed = rows.filter((row) => row.status === "FAILED").length;
      const partial = rows.filter((row) => row.status === "PARTIAL").length;
      return {
        automationId,
        automationName: rows[0].automationName,
        runs: rows.length,
        failed,
        partial,
        actionsRun: rows.reduce((sum, row) => sum + (row.actionCount || 0), 0),
        medianMs: median(
          rows
            .map((row) => row.durationMs)
            .filter((value): value is number => typeof value === "number" && value >= 0),
        ),
        troubleRate: (failed + partial) / rows.length,
      };
    })
    .sort((a, b) => b.troubleRate - a.troubleRate || b.runs - a.runs);
}

export type FailureGroup = {
  /** The action type, as the runner recorded it. */
  action: string;
  detail: string;
  count: number;
};

/**
 * The failures, grouped by what actually went wrong.
 *
 * A list of failed runs is a list; the same message forty times is one
 * problem. Grouping by action and message turns "forty failures" into "one
 * rule cannot find a user", which is a thing somebody can go and fix.
 */
export function failureGroups(runs: RunRecord[], limit = 8): FailureGroup[] {
  const counts = new Map<string, FailureGroup>();

  for (const run of runs) {
    if (!Array.isArray(run.result)) continue;
    for (const outcome of run.result) {
      if (!outcome || typeof outcome !== "object") continue;
      const record = outcome as { ok?: unknown; type?: unknown; detail?: unknown };
      if (record.ok !== false) continue;

      const action = typeof record.type === "string" ? record.type : "UNKNOWN";
      const detail = typeof record.detail === "string" ? record.detail : "Action failed";
      const key = `${action}::${detail}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { action, detail, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type EnrolmentEntity = "LEAD" | "DEAL" | "PERSON" | "COMPANY" | "SITE" | "WORK_ORDER";

/**
 * Which kinds of record each trigger can ever fire on.
 *
 * Named explicitly rather than inferred from the trigger's name, because the
 * two document triggers fire against a deal and read nothing like it. Without
 * this, a lead's page would list "When a payment is received" as something
 * waiting to happen to it, which is a promise the engine will never keep.
 */
const TRIGGER_ENTITIES: Record<string, EnrolmentEntity[]> = {
  LEAD_CREATED: ["LEAD"],
  LEAD_STAGE_CHANGED: ["LEAD"],
  DEAL_CREATED: ["DEAL"],
  DEAL_STAGE_CHANGED: ["DEAL"],
  DOCUMENT_APPROVED: ["DEAL"],
  PAYMENT_RECEIVED: ["DEAL"],
  TASK_OVERDUE: ["LEAD", "DEAL"],
  RECORD_IDLE: ["LEAD", "DEAL"],
};

export function triggerAppliesTo(trigger: string, entity: EnrolmentEntity): boolean {
  return (TRIGGER_ENTITIES[trigger] ?? []).includes(entity);
}

export type ArmedRule = {
  id: string;
  name: string;
  trigger: string;
  isEnabled: boolean;
};

/**
 * The rules that could still fire on this record.
 *
 * There is no queue behind this: the engine runs a rule the moment its event
 * happens, so nothing is literally sitting in a pending state. What somebody
 * asking "what happens next to this lead" actually wants is which rules are
 * armed and pointed at it, and that is what this answers — honestly, rather
 * than by drawing a spinner next to something that is not running.
 *
 * A rule already fired against this record is still listed: most triggers can
 * fire again, and a stage-change rule that ran on Tuesday will run again on
 * Thursday.
 */
export function armedRules(rules: ArmedRule[], entity: EnrolmentEntity): ArmedRule[] {
  return rules.filter((rule) => rule.isEnabled && triggerAppliesTo(rule.trigger, entity));
}

/** Milliseconds, in the units somebody reads them in. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
