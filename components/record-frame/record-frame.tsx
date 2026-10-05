"use client";

import "./record-frame.css";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { binAsk } from "@/lib/retail/asks";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import type { Grant, RailEdit, RecordAction, RecordKind } from "@/lib/retail/record-kinds/types";

import { BinBanner } from "./bin-banner";
import { ChartPanel } from "./chart-panel";
import { DetailsRail } from "./details-rail";
import { KpiStrip } from "./kpi-strip";
import { RecordActions } from "./record-header";
import { RecordStrip } from "./record-strip";
import { RecordTabs } from "./record-tabs";

/**
 * RecordFrame (00-foundations 5.6): every record drawn from one kind.
 *
 * The header (back, title, reference, the action group with ⋯, the primary)
 * goes into the shell's page header; under it the bin banner when the record
 * is in the bin, the strip, and the body: KPIs, the chart, the tabs and their
 * table, and the details rail edited in place. What the viewer's role cannot
 * do is not drawn; every request is checked again on the server.
 *
 * `onEvent` receives the kind's `{ event }` actions, for the dialogs a page
 * owns (a shift's count and close); `children` renders them.
 */
export function RecordFrame<R>({
  kind,
  id,
  onEvent,
  children,
}: {
  kind: RecordKind<R>;
  id: string;
  onEvent?: (event: string, record: R) => void;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [asking, setAsking] = React.useState(false);

  const query = useQuery({ queryKey: kind.queryKey(id), queryFn: () => kind.load(id), enabled: Boolean(id) });
  const record = query.data;

  const user = session?.user as { id?: string; role?: string; supportSessionId?: string | null } | undefined;
  const can = React.useCallback(
    (grant: Grant) => Boolean(user) && canRetailSessionDo({ user: { role: user?.role, supportSessionId: user?.supportSessionId } }, grant[0], grant[1]),
    [user],
  );
  const allowed = React.useCallback(
    (action: RecordAction) => action.requires.length === 0 || action.requires.some((grant) => can(grant)),
    [can],
  );

  const refresh = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: kind.queryKey(id) }),
      queryClient.invalidateQueries({ queryKey: ["record-activity"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ...(kind.invalidates ?? []).map((key) => queryClient.invalidateQueries({ queryKey: key })),
    ]);
  }, [queryClient, kind, id]);

  const run = React.useCallback(
    (action: RecordAction) => {
      if (!record) return;
      const target = action.do;
      if ("event" in target) onEvent?.(target.event, record);
      else if ("href" in target) router.push(target.href);
      else if ("sheet" in target) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("sheet", target.sheet);
        router.push(`${pathname}?${params.toString()}`);
      } else if ("open" in target) window.open(target.open, "_blank", "noopener");
      else if ("download" in target) window.location.assign(target.download);
      else if ("confirm" in target) setAsking(true);
    },
    [record, onEvent, router, searchParams, pathname],
  );

  const title = record ? kind.title(record) : "";
  const bin = record && kind.bin ? kind.bin.state(record) : null;
  const binned = Boolean(bin);

  const actions = record && !binned ? (kind.actions?.(record) ?? []).filter(allowed) : [];
  // A binned record keeps only its "Export as PDF" (5.6.3).
  const more = record ? (kind.more?.(record) ?? []).filter(allowed).filter((action) => !binned || action.key === "pdf") : [];
  const primaryAction = record && !binned ? (kind.primary?.(record) ?? null) : null;
  const primary: PagePrimary | null =
    primaryAction && allowed(primaryAction) ? { label: primaryAction.label, onClick: () => run(primaryAction) } : null;
  const canBin = Boolean(record && kind.bin && !binned && can(kind.bin.deleteRight));

  const saveField = React.useCallback(
    async (edit: RailEdit, value: unknown) => {
      if (!kind.endpoint) throw new Error("This record cannot be changed here.");
      try {
        await fetchJson(kind.endpoint(id), { method: "PATCH", body: JSON.stringify({ [edit.field]: value }) });
      } catch (error) {
        const details = error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> } | undefined) : undefined;
        throw new Error(details?.fieldErrors?.[edit.field] ?? getApiErrorMessage(error));
      }
      await refresh();
    },
    [kind, id, refresh],
  );

  const moveToBin = async () => {
    if (!kind.bin) return;
    await fetchJson("/api/v2/retail/bin", { method: "POST", body: JSON.stringify({ kind: kind.bin.kind, id }) });
    await refresh();
  };

  const restore = async () => {
    if (!kind.bin) return;
    try {
      await fetchJson("/api/v2/retail/bin/restore", { method: "POST", body: JSON.stringify({ kind: kind.bin.kind, id }) });
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    await refresh();
    toast({ title: "Restored. It is back in every list.", variant: "success" });
  };

  const chrome = (
    <PageChrome
      title={record ? title : ""}
      reference={record ? (kind.reference?.(record) ?? null) : null}
      backHref={kind.back.href}
      backLabel={kind.back.label}
      primary={primary}
    >
      {record ? (
        <RecordActions actions={actions} more={more} bin={canBin ? () => setAsking(true) : null} onAction={run} />
      ) : null}
    </PageChrome>
  );

  if (query.isPending) {
    return (
      <div className="cx-rf" aria-busy="true">
        {chrome}
        <span className="cx-rf-sr" role="status">
          Loading
        </span>
        <div className="cx-rf-strip" />
        <div className="cx-rf-body">
          <div className="cx-rf-main">
            <div className="cx-rf-skel" style={{ height: 82 }} />
            <div className="cx-rf-skel" style={{ height: 240 }} />
            <div className="cx-rf-skel" style={{ height: 200 }} />
          </div>
          <div className="cx-rf-rail">
            <div className="cx-rf-skel" style={{ height: 160 }} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !record) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    const refused = query.error instanceof ApiError && query.error.status === 403;
    return (
      <div className="cx-rf">
        {chrome}
        <div className="cx-rf-state" role={missing || refused ? undefined : "alert"}>
          <h2 className="cx-rf-state__title">
            {missing ? "There is nothing at this address" : refused ? "Your role cannot open this" : "This would not load"}
          </h2>
          <p style={{ margin: 0 }}>
            {missing
              ? `It may have been removed. ${kind.back.label} lists everything that is here.`
              : getApiErrorMessage(query.error)}
          </p>
          {missing || refused ? null : (
            <button type="button" className="cx-lf-btn" onClick={() => void query.refetch()}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const chart = kind.chart?.(record) ?? null;

  return (
    <div className={`cx-rf${binned ? " is-binned" : ""}`}>
      {chrome}
      {bin ? (
        <BinBanner state={bin} viewerId={user?.id ?? null} canRestore={can(["retail.bin", "update"])} onRestore={restore} />
      ) : null}
      <RecordStrip
        title={title}
        steps={kind.steps?.(record) ?? []}
        chips={kind.chips?.(record) ?? []}
        figure={kind.figure?.(record) ?? null}
      />
      <div className="cx-rf-body" aria-hidden={binned || undefined}>
        <div className="cx-rf-main">
          <KpiStrip kpis={kind.kpis?.(record) ?? []} />
          {chart ? <ChartPanel chart={chart} /> : null}
          <RecordTabs
            tabs={kind.tabs}
            record={record}
            recordId={id}
            type={kind.type}
            canReadActivity={can(["retail.activity", "view"])}
          />
        </div>
        <DetailsRail
          top={kind.railTop?.(record) ?? null}
          groups={kind.rail(record)}
          can={can}
          locked={binned}
          onSave={saveField}
        />
      </div>
      {kind.bin ? (
        <ConfirmDialog ask={binAsk({ title })} open={asking} onOpenChange={setAsking} onConfirm={moveToBin} />
      ) : null}
      {children}
    </div>
  );
}
