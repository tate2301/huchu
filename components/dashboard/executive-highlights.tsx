"use client";

import type { ExecutiveHighlight } from "@/lib/api";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type ExecutiveHighlightsProps = {
  items?: ExecutiveHighlight[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatHighlightValue(item: ExecutiveHighlight) {
  if (item.valueLabel) return item.valueLabel;
  if (typeof item.value !== "number" || Number.isNaN(item.value)) return null;
  const value = numberFormatter.format(item.value);
  return item.unit ? `${value} ${item.unit}` : value;
}

function getToneVariant(tone: ExecutiveHighlight["tone"]) {
  if (tone === "critical") return "destructive";
  if (tone === "warning") return "outline";
  if (tone === "positive") return "secondary";
  return "secondary";
}

export function ExecutiveHighlights({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveHighlightsProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Executive Highlights</h3>
        <p className="text-sm text-muted-foreground">
          Top exceptions and pressure points that need stakeholder attention.
        </p>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`highlight-skeleton-${index}`} className="rounded-lg border p-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && isError ? (
        <StatusState
          variant="error"
          title="Unable to load highlights"
          description={errorMessage || "Highlights are currently unavailable."}
        />
      ) : null}

      {!isLoading && !isError && (!items || items.length === 0) ? (
        <StatusState
          variant="empty"
          title="No highlights in this period"
          description="No notable risks or events were returned for this filter."
        />
      ) : null}

      {!isLoading && !isError && items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const value = formatHighlightValue(item);
            const tone = item.tone ?? "neutral";

            return (
              <div key={item.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Badge variant={getToneVariant(tone)}>{tone}</Badge>
                </div>
                {value ? (
                  <p className="mt-2 font-mono text-sm font-semibold tabular-nums">{value}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
