/**
 * Sales reporting.
 *
 * Everything here is pure arithmetic over rows the caller has already fetched.
 * The reason to keep it that way is that funnel and conversion maths is the
 * part people argue about, and an argument you can settle with a unit test is
 * cheaper than one you settle by staring at SQL.
 */
export type FunnelStageInput = {
  key: string;
  label: string;
  /** Records that have ever reached this stage. */
  reached: number;
  value: number;
};

export type FunnelStage = FunnelStageInput & {
  /** Share of everything that entered the funnel. */
  shareOfTotal: number;
  /** Share of what reached the previous stage — where the leak is. */
  conversionFromPrevious: number;
  droppedFromPrevious: number;
};

/**
 * Turn stage counts into a funnel.
 *
 * Conversion is measured against the previous stage, not against the top,
 * because "we lose two thirds of everything between quote and order" is
 * actionable and "8% of leads become orders" is not.
 */
export function buildFunnel(stages: FunnelStageInput[]): FunnelStage[] {
  const total = stages[0]?.reached ?? 0;

  return stages.map((stage, index) => {
    const previous = index === 0 ? stage.reached : stages[index - 1].reached;
    return {
      ...stage,
      shareOfTotal: total > 0 ? stage.reached / total : 0,
      conversionFromPrevious: previous > 0 ? stage.reached / previous : 0,
      droppedFromPrevious: index === 0 ? 0 : Math.max(0, previous - stage.reached),
    };
  });
}

/**
 * The stage that loses the most, which is where attention belongs.
 *
 * Ties break toward the later stage: losing fifty deals after quoting them
 * costs the work of fifty quotes, while losing fifty at the top costs an hour
 * of somebody's morning.
 */
export function biggestLeak(funnel: FunnelStage[]): FunnelStage | null {
  const candidates = funnel.slice(1);
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, stage) =>
    stage.droppedFromPrevious >= worst.droppedFromPrevious ? stage : worst,
  );
}

export type OutcomeCounts = { won: number; lost: number; open: number };

/**
 * Win rate over decided business only. Counting open deals as losses makes a
 * healthy pipeline look like a failing one every time it grows.
 */
export function winRate(counts: OutcomeCounts): number {
  const decided = counts.won + counts.lost;
  return decided > 0 ? counts.won / decided : 0;
}

export type CycleInput = { openedAt: Date | string; closedAt: Date | string | null };

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/**
 * Median days from opening to closing, over closed business only.
 *
 * The median rather than the mean: one deal that took two years drags an
 * average into uselessness, and the question being asked is "how long does
 * this normally take".
 */
export function medianCycleDays(records: CycleInput[]): number | null {
  const durations = records
    .filter((record) => record.closedAt)
    .map((record) => {
      const opened = toDate(record.openedAt).getTime();
      const closed = toDate(record.closedAt!).getTime();
      return (closed - opened) / 86_400_000;
    })
    .filter((days) => Number.isFinite(days) && days >= 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) return null;
  const middle = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 0
      ? (durations[middle - 1] + durations[middle]) / 2
      : durations[middle];
  return Math.round(median * 10) / 10;
}

export type GroupedOutcome = {
  key: string;
  label: string;
  won: number;
  lost: number;
  open: number;
  wonValue: number;
  openValue: number;
};

export type GroupedPerformance = GroupedOutcome & {
  total: number;
  winRate: number;
  /** Average value of the deals actually won. */
  averageWonValue: number;
};

export function summarizeGroups(groups: GroupedOutcome[]): GroupedPerformance[] {
  return groups
    .map((group) => ({
      ...group,
      total: group.won + group.lost + group.open,
      winRate: winRate(group),
      averageWonValue: group.won > 0 ? group.wonValue / group.won : 0,
    }))
    .sort((a, b) => b.wonValue - a.wonValue);
}

/**
 * Weighted forecast: each open deal counted at its own probability.
 *
 * Deliberately reported alongside the unweighted total rather than instead of
 * it — one number is a commitment and the other is a ceiling, and hiding
 * either causes a different argument.
 */
export function forecast(
  open: { value: number | null; probability: number | null }[],
  defaultProbability = 50,
): { weighted: number; unweighted: number; count: number; estimated: number } {
  let weighted = 0;
  let unweighted = 0;
  let estimated = 0;

  for (const deal of open) {
    const value = deal.value ?? 0;
    const probability = deal.probability ?? defaultProbability;
    if (deal.probability === null) estimated += 1;
    unweighted += value;
    weighted += (value * Math.min(100, Math.max(0, probability))) / 100;
  }

  return {
    weighted: Math.round(weighted * 100) / 100,
    unweighted: Math.round(unweighted * 100) / 100,
    count: open.length,
    // How many of those probabilities nobody actually set. A weighted figure
    // where this equals `count` is the default probability wearing a suit, and
    // the reader deserves to know that before betting on it.
    estimated,
  };
}

export type ActivityBucket = { period: string; count: number };

export type SeriesPoint = { at: Date | string; value?: number | null };
export type SeriesBucket = { period: string; count: number; value: number };

/**
 * Roll timestamped points into day or week buckets, filling the gaps.
 *
 * Empty periods are emitted as zero rather than skipped: a chart that omits a
 * quiet week draws a straight line through it and hides exactly the thing
 * somebody opened the chart to see.
 *
 * Each bucket carries both a count and a summed value, because the two
 * questions asked of a trend — "how many" and "how much" — are the same walk
 * over the same rows, and computing them separately is how they end up
 * disagreeing.
 */
export function bucketSeries(
  points: SeriesPoint[],
  range: { from: Date; to: Date },
  granularity: "day" | "week" = "day",
): SeriesBucket[] {
  const step = granularity === "week" ? 7 : 1;
  const buckets = new Map<string, { count: number; value: number }>();

  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    buckets.set(cursor.toISOString().slice(0, 10), { count: 0, value: 0 });
    cursor.setDate(cursor.getDate() + step);
  }

  const keys = Array.from(buckets.keys());
  for (const point of points) {
    const date = toDate(point.at);
    if (Number.isNaN(date.getTime())) continue;
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const iso = day.toISOString().slice(0, 10);

    // Find the bucket this falls in — for weeks, the latest start on or
    // before it.
    let bucketKey: string | undefined;
    for (const key of keys) {
      if (key <= iso) bucketKey = key;
      else break;
    }
    if (!bucketKey) continue;
    const bucket = buckets.get(bucketKey)!;
    bucket.count += 1;
    bucket.value += point.value ?? 0;
  }

  return Array.from(buckets.entries()).map(([period, bucket]) => ({
    period,
    count: bucket.count,
    value: Math.round(bucket.value * 100) / 100,
  }));
}

/** Counts only, for callers that never had a value to sum. */
export function bucketByPeriod(
  timestamps: (Date | string)[],
  range: { from: Date; to: Date },
  granularity: "day" | "week" = "day",
): ActivityBucket[] {
  return bucketSeries(
    timestamps.map((at) => ({ at })),
    range,
    granularity,
  ).map(({ period, count }) => ({ period, count }));
}

export type StageChange = {
  dealId: string;
  /** Null when the metadata predates stage ids being recorded. */
  toStageId: string | null;
  fromStageId: string | null;
  at: Date | string;
};

export type DealLife = {
  id: string;
  createdAt: Date | string;
  /** Won or lost; null while it is still running. */
  closedAt: Date | string | null;
  currentStageId: string;
};

/**
 * How long a deal typically sits in each stage.
 *
 * A funnel says how many survive each step; it says nothing about the step
 * that everything survives and nothing leaves for five weeks. That stage is
 * usually the expensive one, and it is invisible until it is measured.
 *
 * Reconstructed from the stage-change trail rather than stored on the deal:
 * a `daysInStage` column would only ever describe the stage a deal is in now,
 * and the question is about the stages it has already been through.
 *
 * The stage a deal opened in is taken from the first change's `fromStageId`,
 * falling back to where it sits now for a deal that has never moved. The last
 * span runs to the close, or to now for a deal still in flight — a deal that
 * has been parked in Quoted for six weeks is precisely the thing worth
 * counting, so excluding open deals would hide it.
 *
 * The median, not the mean, for the same reason as the cycle time: one deal
 * that sat in a stage for a year should not redefine "normal".
 */
export function medianDaysInStage(
  deals: DealLife[],
  changes: StageChange[],
  now: Date = new Date(),
): Record<string, number> {
  const byDeal = new Map<string, StageChange[]>();
  for (const change of changes) {
    const list = byDeal.get(change.dealId);
    if (list) list.push(change);
    else byDeal.set(change.dealId, [change]);
  }

  const durations = new Map<string, number[]>();
  const push = (stageId: string, days: number) => {
    if (!Number.isFinite(days)) return;
    const list = durations.get(stageId);
    if (list) list.push(Math.max(0, days));
    else durations.set(stageId, [Math.max(0, days)]);
  };

  for (const deal of deals) {
    const moves = (byDeal.get(deal.id) ?? [])
      .filter((change) => change.toStageId)
      .sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime());

    let stageId = moves[0]?.fromStageId ?? deal.currentStageId;
    let enteredAt = toDate(deal.createdAt).getTime();

    for (const move of moves) {
      const at = toDate(move.at).getTime();
      push(stageId, (at - enteredAt) / 86_400_000);
      stageId = move.toStageId!;
      enteredAt = at;
    }

    const end = deal.closedAt ? toDate(deal.closedAt).getTime() : now.getTime();
    push(stageId, (end - enteredAt) / 86_400_000);
  }

  const result: Record<string, number> = {};
  for (const [stageId, days] of durations) {
    const sorted = days.sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    result[stageId] = Math.round(median * 10) / 10;
  }
  return result;
}

export type ShareSlice = { key: string; label: string; value: number; share: number };

/**
 * The top slices of a total, with everything else folded into one.
 *
 * A pie with nineteen slivers is a legend, not a chart. Past the limit the
 * remainder becomes a single "Other" so the shares still sum to one — dropping
 * the tail instead would draw a pie that quietly lies about the total.
 *
 * Zero and negative values are excluded: a slice of nothing has no angle, and
 * a negative one would eat somebody else's.
 */
export function shareSlices(
  rows: { key: string; label: string; value: number }[],
  limit = 5,
): ShareSlice[] {
  const positive = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = positive.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return [];

  const head = positive.slice(0, limit);
  const tail = positive.slice(limit);
  const slices = head.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    share: row.value / total,
  }));

  if (tail.length > 0) {
    const rest = tail.reduce((sum, row) => sum + row.value, 0);
    slices.push({
      key: "__other",
      label: `Other (${tail.length})`,
      value: rest,
      share: rest / total,
    });
  }

  return slices;
}

/** Percent for display, without pretending to precision the data lacks. */
export function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const REPORT_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export const REPORT_RANGE_LABELS: Record<ReportRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

export function rangeToDates(range: ReportRange, now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  else if (range === "90d") from.setDate(from.getDate() - 90);
  else from.setMonth(from.getMonth() - 12);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}
