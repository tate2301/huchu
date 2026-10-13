"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Drawer, Field, Input, Switch } from "@/components/core";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { describeCondition } from "@/lib/reports/format";
import type { LayoutBlock } from "@/lib/reports/layout";
import {
  AUDIENCE_LABELS,
  TEMPLATE_AUDIENCES,
  type ReportTemplateRecord,
  type TemplateAudience,
} from "@/lib/reports/template-access";
import type { ReportMeta, ReportParams, ReportView } from "@/lib/reports/types";
import { dayRangeWords, todayIn } from "@/lib/workspace/format";

import { RadioOptions } from "./radio-options";

/**
 * Save as a template (PageReportSave), and Change the template, as the kit's
 * drawer. Saving keeps what the report shows; changing renames, re-shares or
 * deletes one. The columns, filters and grouping are never edited here — the
 * report is where they are changed, so there is one place to learn.
 */

export type TemplateSheetMode =
  | { kind: "save"; meta: ReportMeta; view: ReportView; params: ReportParams; blocks: LayoutBlock[] }
  | { kind: "edit"; template: ReportTemplateRecord };

function templateHref(template: Pick<ReportTemplateRecord, "id" | "reportKey">) {
  return `/reports/${template.reportKey}?template=${template.id}`;
}

/** "Figures, 2 charts, the table": what the page keeps of its layout. */
export function describeBlocks(blocks: LayoutBlock[]): string {
  const charts = blocks.filter((block) => block.type === "chart").length;
  const parts = [
    blocks.some((block) => block.type === "figures") ? "figures" : null,
    charts ? (charts === 1 ? "a chart" : `${charts} charts`) : null,
    blocks.some((block) => block.type === "breakdown") ? "a breakdown" : null,
    blocks.some((block) => block.type === "table") ? "the table" : null,
  ].filter(Boolean);
  const words = parts.join(", ");
  return words ? words[0]!.toUpperCase() + words.slice(1) : "The table";
}

/** What a template made from this view would keep, in words. */
export function describeView(meta: ReportMeta, view: ReportView) {
  const byKey = new Map(meta.columns.map((column) => [column.key, column]));
  const shown = view.columns.filter((entry) => !entry.hidden && byKey.has(entry.key)).length;
  const filters = view.conditions.flatMap((condition) => {
    const column = byKey.get(condition.column);
    return column ? [describeCondition(condition, column)] : [];
  });
  if (view.search) filters.push(`Matching “${view.search}”`);
  const sort = view.sort[0];
  const sortColumn = sort ? byKey.get(sort.column) : undefined;
  const soonest = sortColumn?.kind === "date";
  return {
    narrowed: filters.length ? filters.join(", ") : "Nothing",
    grouped: view.groupBy ? (byKey.get(view.groupBy)?.label ?? "Not grouped") : "Not grouped",
    columns: `${shown} of ${meta.columns.length}`,
    sorted: sortColumn
      ? `${sortColumn.label}, ${sort!.dir === "asc" ? (soonest ? "soonest" : "lowest first") : soonest ? "latest" : "highest first"}`
      : "As the report sorts",
  };
}

const AUDIENCE_NOTES: Record<TemplateAudience, (title: string) => string> = {
  JUST_ME: () => "Only you see it, in Just yours.",
  MANAGERS: () => "The workspace's managers and you.",
  EVERYONE: (title) => `Everyone who can open ${title}.`,
};

export function TemplateSheet({
  mode,
  open,
  onOpenChange,
}: {
  mode: TemplateSheetMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const manager = isOrgAdminRole(role);

  const editing = mode.kind === "edit" ? mode.template : null;
  const [name, setName] = useState(editing?.name ?? (mode.kind === "save" ? `${mode.meta.title}, my view` : ""));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [audience, setAudience] = useState<TemplateAudience>(editing?.audience ?? "JUST_ME");
  const [keepDates, setKeepDates] = useState(false);
  const [busy, setBusy] = useState(false);

  const reportTitle = mode.kind === "save" ? mode.meta.title : mode.template.reportTitle;
  const dates = mode.kind === "save" ? mode.meta.params.filter((param) => param.type === "date") : [];
  const range =
    mode.kind === "save" && dates.length
      ? dayRangeWords({ from: mode.params.from || null, to: mode.params.to || null }, todayIn())
      : "";
  const kept = mode.kind === "save" ? describeView(mode.meta, mode.view) : null;
  const audiences = TEMPLATE_AUDIENCES.filter((value) => manager || value === "JUST_ME" || value === editing?.audience);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    onOpenChange(false);
  };

  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      if (mode.kind === "edit") {
        const { template } = await fetchJson<{ template: ReportTemplateRecord }>(`/api/v2/reports/templates/${mode.template.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, description: description || null, audience }),
        });
        toast({ title: `${template.name} saved`, variant: "success" });
        await done();
        return;
      }
      const { template } = await fetchJson<{ template: ReportTemplateRecord }>("/api/v2/reports/templates", {
        method: "POST",
        body: JSON.stringify({
          reportKey: mode.meta.key,
          name,
          description: description || null,
          audience,
          view: mode.view,
          params: mode.params,
          keepDates,
        }),
      });
      toast({ title: `${template.name} is under ${template.area}`, variant: "success" });
      await done();
      router.push(templateHref(template));
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (mode.kind !== "edit") return;
    const sure = await dsConfirm({
      title: `Delete ${mode.template.name}?`,
      description: "Only the template goes. Every row stays, and the report it was built on is untouched.",
      confirmLabel: "Delete the template",
      variant: "danger",
    });
    if (!sure) return;
    try {
      await fetchJson(`/api/v2/reports/templates/${mode.template.id}`, { method: "DELETE" });
      toast({ title: `${mode.template.name} deleted`, variant: "success" });
      await done();
      router.push("/reports");
    } catch (error) {
      toast({ title: "Not deleted", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const title = mode.kind === "edit" ? mode.template.name : "Save as a template";
  const sub =
    mode.kind === "edit"
      ? `${mode.template.mine ? "Yours" : `Made by ${mode.template.madeBy}`}, on ${mode.template.reportTitle}.`
      : `A saved way of reading ${reportTitle}. ${reportTitle} itself does not change.`;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub={sub}
      width={440}
      footer={
        <>
          {mode.kind === "edit" && mode.template.canChange ? (
            <Button variant="quiet" className="rp-foot-start" onClick={() => void remove()}>
              Delete the template
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" shortcut="Ctrl ↵" busy={busy} disabled={busy || !name.trim()} onClick={() => void submit()}>
            {mode.kind === "edit" ? "Save" : "Save the template"}
          </Button>
        </>
      }
    >
      <form
        className="rp-drawer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Name" htmlFor="template-name">
          <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        </Field>
        <Field label="What it shows" htmlFor="template-description" help="Shown under the name in All reports.">
          <Input
            id="template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={240}
          />
        </Field>

        <RadioOptions
          label="Seen by"
          name="template-audience"
          value={audience}
          onChange={setAudience}
          options={audiences.map((value) => ({ value, label: AUDIENCE_LABELS[value], note: AUDIENCE_NOTES[value](reportTitle) }))}
          help={manager ? undefined : "Ask a manager to share it once it is right."}
        />

        {range ? (
          <div className="rp-switch">
            <span>
              <b>Keep the dates</b>
              <span className="muted">Opens on {range}. Off: it opens on the report’s own period, whatever the day.</span>
            </span>
            <Switch checked={keepDates} onCheckedChange={setKeepDates} />
          </div>
        ) : null}

        {kept && mode.kind === "save" ? (
          <div className="rp-kept">
            <span className="sec-title">It keeps</span>
            <dl className="attrs">
              <dt>Narrowed by</dt>
              <dd>{kept.narrowed}</dd>
              <dt>Grouped by</dt>
              <dd>{kept.grouped}</dd>
              <dt>Columns</dt>
              <dd>{kept.columns}</dd>
              <dt>Sorted by</dt>
              <dd>{kept.sorted}</dd>
              <dt>Page</dt>
              <dd>{describeBlocks(mode.blocks)}</dd>
            </dl>
          </div>
        ) : null}
      </form>
    </Drawer>
  );
}
