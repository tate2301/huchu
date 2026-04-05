export type TimeBucket = {
  start: number;
  end: number;
  label: string;
  tooltipLabel: string;
};

function formatBucketLabel(date: Date, mode: "hour" | "day" | "month") {
  if (mode === "hour") {
    return date.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  if (mode === "month") {
    return date.toLocaleDateString("en-US", { month: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBucketTooltip(date: Date, mode: "hour" | "day" | "month") {
  if (mode === "hour") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (mode === "month") {
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function resolveTimestamp(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return null;
}

export function buildRecentHourBuckets(windowHours = 24, stepHours = 2) {
  const count = Math.max(Math.floor(windowHours / stepHours), 1);
  const endAnchor = new Date();
  endAnchor.setMinutes(0, 0, 0);

  const startAnchor = new Date(endAnchor);
  startAnchor.setHours(endAnchor.getHours() - (count - 1) * stepHours);

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(startAnchor);
    start.setHours(startAnchor.getHours() + index * stepHours);
    const end = new Date(start);
    end.setHours(start.getHours() + stepHours);

    return {
      start: start.getTime(),
      end: end.getTime(),
      label: formatBucketLabel(start, "hour"),
      tooltipLabel: formatBucketTooltip(start, "hour"),
    } satisfies TimeBucket;
  });
}

export function buildRecentDayBuckets(windowDays = 84, stepDays = 7) {
  const count = Math.max(Math.floor(windowDays / stepDays), 1);
  const endAnchor = new Date();
  endAnchor.setHours(0, 0, 0, 0);

  const startAnchor = new Date(endAnchor);
  startAnchor.setDate(endAnchor.getDate() - (count - 1) * stepDays);

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(startAnchor);
    start.setDate(startAnchor.getDate() + index * stepDays);
    const end = new Date(start);
    end.setDate(start.getDate() + stepDays);

    return {
      start: start.getTime(),
      end: end.getTime(),
      label: formatBucketLabel(start, "day"),
      tooltipLabel: formatBucketTooltip(start, "day"),
    } satisfies TimeBucket;
  });
}

export function buildFutureDayBuckets(windowDays = 84, stepDays = 7) {
  const count = Math.max(Math.floor(windowDays / stepDays), 1);
  const startAnchor = new Date();
  startAnchor.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(startAnchor);
    start.setDate(startAnchor.getDate() + index * stepDays);
    const end = new Date(start);
    end.setDate(start.getDate() + stepDays);

    return {
      start: start.getTime(),
      end: end.getTime(),
      label: formatBucketLabel(start, "day"),
      tooltipLabel: formatBucketTooltip(start, "day"),
    } satisfies TimeBucket;
  });
}

export function buildMonthBucketsFromDates(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => resolveTimestamp(value))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return [] as TimeBucket[];

  const first = new Date(timestamps[0]);
  first.setDate(1);
  first.setHours(0, 0, 0, 0);

  const last = new Date(timestamps[timestamps.length - 1]);
  last.setDate(1);
  last.setHours(0, 0, 0, 0);

  const buckets: TimeBucket[] = [];
  const cursor = new Date(first);

  while (cursor.getTime() <= last.getTime()) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 1);

    buckets.push({
      start: start.getTime(),
      end: end.getTime(),
      label: formatBucketLabel(start, "month"),
      tooltipLabel: formatBucketTooltip(start, "month"),
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets;
}

export function countInBuckets(
  timestamps: number[],
  buckets: TimeBucket[],
  predicate?: (timestamp: number) => boolean,
) {
  return buckets.map((bucket) => {
    let total = 0;
    for (const timestamp of timestamps) {
      if (timestamp >= bucket.start && timestamp < bucket.end) {
        if (!predicate || predicate(timestamp)) {
          total += 1;
        }
      }
    }
    return total;
  });
}
