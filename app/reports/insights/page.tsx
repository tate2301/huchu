"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, ButtonLink, Empty, Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchReportsHome, REPORTS_HOME_KEY } from "@/components/layout/workspace-rail/reports-groups";
import { WeekInsightsView, type PinTarget } from "@/components/reports/week-insights-view";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { freeBlockId, freeBlockName, sourceStem, type CustomBlock, type CustomReport } from "@/lib/reports/custom/document";
import { sqlName } from "@/lib/reports/sql/schema";
import type { WeekInsight, WeekInsights } from "@/lib/reports/week-insights";
import { addDays, todayIn } from "@/lib/workspace/format";

const KEY = ["reports", "week-insights"] as const;

/** The Monday this week began on, which is what "Not useful" hides an insight until. */
function weekOf(today = todayIn()): string {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, -((weekday + 6) % 7));
}

const HIDDEN = "reports.insights.hidden";

/** Insights worked out from the rows (not Vane's) that this browser said were not useful, this week. */
function readHidden(): Set<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(HIDDEN) ?? "null") as { week?: string; ids?: string[] } | null;
    return new Set(stored && stored.week === weekOf() && Array.isArray(stored.ids) ? stored.ids : []);
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>) {
  try {
    window.localStorage.setItem(HIDDEN, JSON.stringify({ week: weekOf(), ids: [...ids] }));
  } catch {
    // A private window keeps it for this visit only.
  }
}

/** The insight's report as a block at the foot of the board: its rows, broken down as the insight read them. */
function pinnedBlock(insight: WeekInsight, blocks: readonly CustomBlock[]): CustomBlock {
  const pin = insight.pin!;
  return {
    id: freeBlockId("query", blocks),
    type: "query",
    name: freeBlockName(sourceStem(pin.reportKey), blocks),
    title: pin.title.slice(0, 120),
    query: `select *\nfrom ${sqlName(pin.reportKey)}\n`,
    display: pin.by ? { type: "breakdown", by: sqlName(pin.by) } : { type: "table" },
  };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug="reports-insights">
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </KitScreen>
    </Kit>
  );
}

function Loading() {
  return (
    <div className="page" style={{ maxWidth: 880 }} aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 28, width: "70%" }} />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 220, borderRadius: 12 }} />
      ))}
    </div>
  );
}

/**
 * Reports → Insights (ReportsInsights): the week's insights across the
 * workspace's modules. Each opens its report; Pin to the board adds the
 * report's rows to the board as a block, and Not useful mutes Vane's
 * insight (or hides a worked-out one in this browser for the week). Only
 * those presses change anything, and only a person makes them.
 */
export default function ReportsInsightsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => fetchJson<WeekInsights>("/api/v2/reports/insights") });
  const data = query.data;

  // Without a board chosen for the workspace, Pin offers the boards this person can change.
  const home = useQuery({ queryKey: REPORTS_HOME_KEY, queryFn: fetchReportsHome, enabled: Boolean(data && !data.board), staleTime: 60_000 });
  const boards: PinTarget[] = React.useMemo(
    () => (home.data?.custom ?? []).filter((report) => report.editable && report.kind === "board").map((report) => ({ id: report.id, title: report.title })),
    [home.data],
  );

  // Read once in the browser; the page shows nothing that depends on it until the insights arrive.
  const [hidden, setHidden] = React.useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readHidden()));

  const pin = useMutation({
    mutationFn: async ({ insight, board }: { insight: WeekInsight; board: PinTarget }) => {
      const { report } = await fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${board.id}`);
      const blocks = report.document.blocks;
      await fetchJson(`/api/v2/reports/custom/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({ document: { ...report.document, blocks: [...blocks, pinnedBlock(insight, blocks)] } }),
      });
      return board;
    },
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });
      toast({ title: `Pinned to ${board.title}`, description: "It is the last block on the board." });
    },
    onError: (error) => toast({ title: "Not pinned", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const mute = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/vane/items/${id}/mute`, { method: "POST", body: JSON.stringify({ reason: "Not useful" }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Moved to Muted", description: "Vane reads that as not useful." });
    },
    onError: (error) => toast({ title: "Not changed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const notUseful = (insight: WeekInsight) => {
    if (insight.vaneItemId) {
      mute.mutate(insight.vaneItemId);
      return;
    }
    const next = new Set(hidden).add(insight.id);
    setHidden(next);
    writeHidden(next);
    toast({ title: "Hidden for this week" });
  };

  const schedule = data?.schedule ?? "Every Monday, 06:00";
  const actions = React.useMemo(
    () => (
      <Kit contents>
        <ButtonLink href="/management/vane" icon="clock">
          {schedule}
        </ButtonLink>
      </Kit>
    ),
    [schedule],
  );

  return (
    <>
      <PageChrome title="Insights">{actions}</PageChrome>
      <Frame>
        {data ? (
          <WeekInsightsView
            data={data}
            insights={data.insights.filter((insight) => !hidden.has(insight.id))}
            boards={boards}
            pinning={pin.isPending ? (pin.variables?.insight.id ?? null) : null}
            onPin={(insight, board) => pin.mutate({ insight, board })}
            onNotUseful={notUseful}
          />
        ) : query.isError ? (
          <Empty
            icon="warn"
            title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "The insights did not load"}
            action={
              <Button icon="history" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          >
            {getApiErrorMessage(query.error, "Check the connection and try again.")}
          </Empty>
        ) : (
          <Loading />
        )}
      </Frame>
    </>
  );
}
