"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import type { CatalogArea } from "@/lib/reports/catalog";
import { describeCondition } from "@/lib/reports/format";
import {
  AUDIENCE_LABELS,
  TEMPLATE_AUDIENCES,
  type ReportTemplateRecord,
  type TemplateAudience,
} from "@/lib/reports/template-access";
import type { ReportMeta, ReportParams, ReportView } from "@/lib/reports/types";

/**
 * Making, saving and changing a report template, in one side sheet.
 *
 * Three ways in: "Save as a template" from a report on screen keeps what it
 * shows; "New template" from the catalogue starts from a report's own view,
 * to be shaped on the report itself; "Change the template" renames, re-shares
 * or deletes one. The columns, filters and grouping are never edited here —
 * the report is where they are changed, so there is one place to learn.
 */

export type TemplateSheetMode =
  | { kind: "save"; meta: ReportMeta; view: ReportView; params: ReportParams }
  | { kind: "new"; areas: CatalogArea[] }
  | { kind: "edit"; template: ReportTemplateRecord };

function templateHref(template: Pick<ReportTemplateRecord, "id" | "reportKey">) {
  return `/reports/${template.reportKey}?template=${template.id}`;
}

function Field({ id, label, optional, hint, children }: { id: string; label: string; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-[var(--text-muted)]">optional</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[12.5px] leading-[1.4] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function Kept({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[12.5px] text-[var(--text-muted)]">{label}</dt>
      <dd className="text-[13px] font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

/** What a template made from this view would keep, in words. */
function describeView(meta: ReportMeta, view: ReportView) {
  const byKey = new Map(meta.columns.map((column) => [column.key, column]));
  const shown = view.columns.filter((entry) => !entry.hidden).map((entry) => byKey.get(entry.key)?.label).filter(Boolean);
  const filters = view.conditions.flatMap((condition) => {
    const column = byKey.get(condition.column);
    return column ? [describeCondition(condition, column)] : [];
  });
  if (view.search) filters.push(`Matching “${view.search}”`);
  const sort = view.sort[0];
  const sortColumn = sort ? byKey.get(sort.column) : undefined;
  return {
    columns: shown.join(", "),
    filters: filters.length ? filters.join(" · ") : "None",
    sorted: sortColumn ? `${sortColumn.label}, ${sort!.dir === "asc" ? "lowest first" : "highest first"}` : "As the report sorts",
    grouped: view.groupBy ? (byKey.get(view.groupBy)?.label ?? "Not grouped") : "Not grouped",
  };
}

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
  const firstReport = mode.kind === "new" ? mode.areas[0]?.reports[0]?.key ?? "" : "";
  const [reportKey, setReportKey] = useState(firstReport);
  const [name, setName] = useState(editing?.name ?? (mode.kind === "save" ? `${mode.meta.title}, my view` : ""));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [audience, setAudience] = useState<TemplateAudience>(editing?.audience ?? "JUST_ME");
  const [keepDates, setKeepDates] = useState(false);
  const [busy, setBusy] = useState(false);

  const dates = mode.kind === "save" ? mode.meta.params.filter((param) => param.type === "date") : [];
  const shownDates = dates.map((param) => (mode.kind === "save" ? mode.params[param.key] : "")).filter(Boolean);
  const kept = mode.kind === "save" ? describeView(mode.meta, mode.view) : null;
  const audiences = TEMPLATE_AUDIENCES.filter((value) => manager || value === "JUST_ME" || value === editing?.audience);

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    onOpenChange(false);
  };

  const submit = async () => {
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
      const body =
        mode.kind === "save"
          ? { reportKey: mode.meta.key, name, description: description || null, audience, view: mode.view, params: mode.params, keepDates }
          : { reportKey, name, description: description || null, audience };
      const { template } = await fetchJson<{ template: ReportTemplateRecord }>("/api/v2/reports/templates", {
        method: "POST",
        body: JSON.stringify(body),
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

  const title = mode.kind === "edit" ? mode.template.name : mode.kind === "save" ? "Save as a template" : "New template";
  const subtitle =
    mode.kind === "edit"
      ? `${mode.template.mine ? "Yours" : `Made by ${mode.template.madeBy}`}, on ${mode.template.reportTitle}`
      : mode.kind === "save"
        ? `From ${mode.meta.title}, as it is on screen`
        : "Pick the report it reads. Shape its columns and filters on the report, then save.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex w-full flex-col p-0">
        <SheetHeader className="border-b border-[var(--border)] px-6 py-5">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        <form
          id="template-form"
          className="grid flex-1 content-start gap-6 overflow-y-auto px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode.kind === "new" ? (
            <Field id="template-report" label="Starts from" hint="The area it lists under comes from here.">
              <Select value={reportKey} onValueChange={setReportKey}>
                <SelectTrigger id="template-report" aria-label="Starts from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mode.areas.map((area) => (
                    <SelectGroup key={area.area}>
                      <SelectLabel>{area.area}</SelectLabel>
                      {area.reports.map((report) => (
                        <SelectItem key={report.key} value={report.key}>
                          {report.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4">
            <Field id="template-name" label="Name">
              <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
            </Field>
            <Field id="template-description" label="What it shows" optional hint="One line, shown under the name in the list.">
              <Textarea
                id="template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                maxLength={240}
              />
            </Field>
          </div>

          {kept ? (
            <section className="grid gap-3 border-t border-[var(--border)] pt-5" aria-labelledby="template-keeps">
              <h3 id="template-keeps" className="text-[14px] font-semibold text-[var(--text-strong)]">
                What it keeps
              </h3>
              <dl className="grid gap-3">
                <Kept label="Columns" value={kept.columns} />
                <Kept label="Filters" value={kept.filters} />
                <div className="grid grid-cols-2 gap-3">
                  <Kept label="Sorted" value={kept.sorted} />
                  <Kept label="Grouped" value={kept.grouped} />
                </div>
              </dl>
              {shownDates.length ? (
                <Field
                  id="template-period"
                  label="Dates"
                  hint={keepDates ? "It always opens on these dates." : "It opens on the report’s own period, so “this month” is this month whenever it is opened."}
                >
                  <SegmentedControl
                    ariaLabel="Dates"
                    variant="border"
                    fullWidth
                    value={keepDates ? "keep" : "move"}
                    onValueChange={(value) => setKeepDates(value === "keep")}
                    options={[
                      { value: "move", label: "Move with today" },
                      { value: "keep", label: `Keep ${shownDates.join(" to ")}` },
                    ]}
                  />
                </Field>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-3 border-t border-[var(--border)] pt-5" aria-labelledby="template-who">
            <h3 id="template-who" className="text-[14px] font-semibold text-[var(--text-strong)]">
              Who sees it
            </h3>
            <Field
              id="template-audience"
              label="Seen by"
              hint={
                manager
                  ? "People only ever see the rows their own role lets them see, whoever made the template."
                  : "Ask a manager to share it once it is right."
              }
            >
              <SegmentedControl
                ariaLabel="Seen by"
                variant="border"
                fullWidth
                value={audience}
                onValueChange={setAudience}
                options={audiences.map((value) => ({ value, label: AUDIENCE_LABELS[value] }))}
              />
            </Field>
          </section>
        </form>

        <SheetFooter className="items-center gap-2 border-t border-[var(--border)] px-6 py-4 sm:justify-between">
          {mode.kind === "edit" && mode.template.canChange ? (
            <Button type="button" variant="ghost" className="text-[var(--tone-danger)]" onClick={() => void remove()}>
              Delete the template
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="template-form" disabled={busy || !name.trim() || (mode.kind === "new" && !reportKey)}>
              {mode.kind === "edit" ? "Save" : mode.kind === "save" ? "Save the template" : "Make the template"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
