"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BuilderBar, BuilderGrid } from "@/components/builder/grid";
import { Button, ButtonLink, Empty } from "@/components/core";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  customReportInputSchema,
  freeBlockName,
  periodParams,
  type CustomBlock,
  type CustomReport,
  type CustomReportInput,
  type QueryBlock,
} from "@/lib/reports/custom/document";
import { resolveParams } from "@/lib/reports/params";
import type { ReportSuggestion } from "@/lib/vane/status";
import { formatTime } from "@/lib/workspace/format";

import { problemOf, ReportBuilderView } from "./report-builder-view";
import { useCustomData, useReportSources } from "./use-custom-data";
import type { SuggestionState } from "./vane-suggestion";

/**
 * A custom report's builder at `/reports/c/[slug]/edit`: reads the report,
 * the sources this person can build on and Vane's suggestions for it, keeps
 * the draft, and saves it when they publish (Ctrl ↵, or Ctrl S). Leaving with
 * changes not saved asks first.
 */

function inputOf(report: CustomReport): CustomReportInput {
  return { title: report.title, description: report.description ?? null, audience: report.audience, document: report.document };
}

/** The same SQL, whatever its spacing and case: a suggestion already on the page is kept. */
const sameSql = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/** The id Vane's question runs under while it waits; it gets a block's own id when kept. */
const SUGGESTION_ID = "vane-suggestion";

function suggestionBlock(item: ReportSuggestion, blocks: readonly CustomBlock[]): QueryBlock {
  return { id: SUGGESTION_ID, type: "query", name: freeBlockName(item.name || "vane", blocks), query: item.sql, display: { type: "table" } };
}

/** The builder's grid while the report opens: its panels, empty. */
function Loading() {
  return (
    <BuilderGrid
      scope="report"
      bar={
        <BuilderBar mode="build" onMode={() => undefined} saved={{ state: "saved", at: null }} publish={{ onPublish: () => undefined, disabled: true }} />
      }
      outline={<div className="pm-body" aria-busy="true" style={{ paddingTop: 16 }}>{[0, 1, 2, 3].map((n) => <div key={n} className="skeleton" style={{ height: 28, marginBottom: 6 }} />)}</div>}
      canvas={
        <div className="rb-board" aria-busy="true" aria-label="Loading">
          <div className="skeleton" style={{ height: 28, width: 360 }} />
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      }
      canvasLabel="The board"
      inspector={<div className="rb-pan" aria-busy="true"><div className="skeleton" style={{ height: 200 }} /></div>}
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <BuilderGrid
      scope="report"
      mode="preview"
      bar={<ButtonLink href="/reports" variant="quiet" icon="back">All reports</ButtonLink>}
      canvas={<div className="rb-board">{children}</div>}
      canvasLabel="The board"
    />
  );
}

export function ReportBuilder({ id }: { id: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const report = useQuery({
    queryKey: ["reports", "custom", id],
    queryFn: () => fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${encodeURIComponent(id)}`),
  });
  const sources = useReportSources();
  const suggestions = useQuery({
    queryKey: ["reports", "custom", id, "suggestions"],
    queryFn: () => fetchJson<{ suggestions: ReportSuggestion[] }>(`/api/v2/reports/custom/${encodeURIComponent(id)}/suggestions`),
    enabled: Boolean(report.data?.report.editable),
    staleTime: 60_000,
  });

  const saved = report.data ? inputOf(report.data.report) : null;
  const [draft, setDraft] = React.useState<CustomReportInput | null>(null);
  const current = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const [saving, setSaving] = React.useState(false);
  const blocks = React.useMemo(() => current?.document.blocks ?? [], [current?.document.blocks]);

  // Vane's newest suggestion that is not already on the page.
  const [states, setStates] = React.useState<Record<string, SuggestionState>>({});
  const [muting, setMuting] = React.useState(false);
  const item = (suggestions.data?.suggestions ?? []).find(
    (candidate) => states[candidate.id] !== "dismissed" && (states[candidate.id] === "kept" || !blocks.some((block) => block.type === "query" && sameSql(block.query, candidate.sql))),
  );
  const state: SuggestionState = item ? (states[item.id] ?? "waiting") : "dismissed";
  const pending = React.useMemo(() => (item && state === "waiting" ? suggestionBlock(item, blocks) : null), [item, state, blocks]);

  const period = current?.document.period;
  const params = React.useMemo(() => (period ? resolveParams(periodParams(period), {}) : {}), [period]);
  // Vane's question runs with the board's, so its rows show before it is kept.
  const running = React.useMemo(() => (pending ? [...blocks, pending] : blocks), [blocks, pending]);
  const data = useCustomData(running, sources.data?.sources, params);

  const parsed = current ? customReportInputSchema.safeParse(current) : null;
  const problems = [
    ...(parsed && !parsed.success ? parsed.error.issues.map((issue) => issue.message) : []),
    ...blocks.flatMap((block) => {
      if (block.type !== "query") return [];
      const problem = problemOf(data.checks.get(block.id), data.results.get(block.id));
      return problem ? [`${block.name}: ${problem.message}`] : [];
    }),
  ].filter((problem, index, all) => all.indexOf(problem) === index);

  const save = async () => {
    if (!current || !parsed?.success || saving) return;
    if (!dirty) {
      router.push(`/reports/c/${encodeURIComponent(id)}`);
      return;
    }
    setSaving(true);
    try {
      await fetchJson(`/api/v2/reports/custom/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setDraft(null);
      toast({ title: `${current.title} published`, variant: "success" });
    } catch (error) {
      toast({ title: "Not published", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Ctrl S saves as Publish does; leaving with changes not saved asks first.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && problems.length === 0) void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  });

  const back = async () => {
    if (dirty) {
      const leave = await dsConfirm({
        title: "Leave without publishing",
        description: "The changes since it was last published are lost.",
        confirmLabel: "Leave",
        variant: "danger",
      });
      if (!leave) return;
    }
    router.push("/reports");
  };

  const dismiss = async () => {
    if (!item) return;
    setMuting(true);
    try {
      await fetchJson(`/api/vane/items/${encodeURIComponent(item.id)}/mute`, { method: "POST", body: JSON.stringify({}) });
      setStates((current) => ({ ...current, [item.id]: "dismissed" }));
      await queryClient.invalidateQueries({ queryKey: ["vane"] });
    } catch (error) {
      toast({ title: "Not moved to Muted", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setMuting(false);
    }
  };

  // On the server React Query has not started, so no data and no error is still loading.
  if (report.isLoading || sources.isLoading || (!report.data && !report.isError) || (!sources.data && !sources.isError)) return <Loading />;

  if (report.isError || sources.isError || !current || !report.data) {
    return (
      <Frame>
        <Empty
          icon="warn"
          title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "This report did not open"}
          action={
            <Button icon="history" onClick={() => void Promise.all([report.refetch(), sources.refetch()])}>
              Try again
            </Button>
          }
        >
          {getApiErrorMessage(report.error ?? sources.error, "Check the connection and try again.")}
        </Empty>
      </Frame>
    );
  }

  if (!report.data.report.editable) {
    return (
      <Frame>
        <Empty icon="lock" title="You can open this report, not change it" action={<ButtonLink href={`/reports/c/${encodeURIComponent(id)}`} icon="reports">Open the report</ButtonLink>}>
          Only whoever made it, or the owner once it is shared, can change it. Make a copy to build on it.
        </Empty>
      </Frame>
    );
  }

  return (
    <ReportBuilderView
      report={report.data.report}
      draft={current}
      onDraft={setDraft}
      sources={sources.data?.sources ?? []}
      data={data}
      params={params}
      saved={saving ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: formatTime(new Date(report.data.report.updatedAt)) }}
      problems={problems}
      onPublish={() => void save()}
      publishing={saving}
      onDiscard={
        dirty
          ? () => {
              setDraft(null);
              // A suggestion kept into the thrown-away draft is waiting again.
              setStates((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== "kept")));
            }
          : undefined
      }
      onBack={() => void back()}
      onCopy={(text) =>
        void navigator.clipboard?.writeText(text).then(
          () => toast({ title: `Copied ${text}` }),
          () => undefined,
        )
      }
      suggestion={
        item && pending
          ? { item, block: pending, state, busy: muting, onKept: () => setStates((current) => ({ ...current, [item.id]: "kept" })), onDismiss: () => void dismiss() }
          : item && state === "kept"
            ? { item, block: suggestionBlock(item, blocks), state, onKept: () => undefined, onDismiss: () => undefined }
            : null
      }
    />
  );
}
