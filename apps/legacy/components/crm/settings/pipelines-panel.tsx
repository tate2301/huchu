"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import {
  ReportTable,
  badge,
  bar,
  node,
  num,
  txt,
  type ReportRow,
} from "@corelithzw/ui/components/report-table";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowDownward, ArrowUpward, ChevronRight, Lock, Plus, Trash2 } from "@corelithzw/ui/lib/icons";
import { fetchCrmPipelines, type CrmPipelineRecord } from "@/lib/crm/crm-v2";
import { STAGE_OUTCOME_TONE } from "@/lib/crm/tones";
import { validateStages, type StageInput } from "@/lib/crm/pipelines";
import { cn } from "@corelithzw/ui/lib/utils";

import { SetupNote, SetupPanel } from "./setup-chrome";

/**
 * The stage dot. Open is the brand, and the two outcomes are the tones that
 * mean won and lost everywhere else in the module.
 */
const STAGE_DOT: Record<string, string> = {
  OPEN: "bg-[var(--brand)]",
  WON: "bg-[var(--tone-success)]",
  LOST: "bg-[var(--tone-danger)]",
};

type StageDraft = StageInput & { dealCount?: number };

function toDraft(stage: CrmPipelineRecord["stages"][number]): StageDraft {
  return {
    id: stage.id,
    name: stage.name,
    status: stage.status,
    probability: stage.probability,
    colorToken: stage.colorToken,
    inactivityDays: stage.inactivityDays,
    requiredFields: stage.requiredFields,
    checklist: stage.checklist,
    requiresSiteVisit: stage.requiresSiteVisit,
    requiresQuotation: stage.requiresQuotation,
  };
}

/**
 * Editing one pipeline's stages.
 *
 * Won and Lost can be renamed but not removed or reordered out of the ends —
 * every pipeline has to be able to answer "did we win this?", and the server
 * enforces the same rule.
 */
function StageEditor({
  pipeline,
  onClose,
}: {
  pipeline: CrmPipelineRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? "");
  const [stages, setStages] = useState<StageDraft[]>(pipeline.stages.map(toDraft));
  const [errors, setErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          // dealCount is display-only; the server owns it.
          stages: stages.map((stage) => ({ ...stage, dealCount: undefined })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      toast({ title: "Pipeline saved" });
      onClose();
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const patch = (index: number, next: Partial<StageDraft>) =>
    setStages((prev) => prev.map((stage, i) => (i === index ? { ...stage, ...next } : stage)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    setStages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const openStages = stages.filter((stage) => stage.status === "OPEN");

  return (
    <div className="space-y-4">
      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Can&apos;t save this pipeline yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-name">Name</Label>
          <Input
            id="pipeline-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-description">Description</Label>
          <Input
            id="pipeline-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What kind of work goes through this pipeline?"
            maxLength={500}
          />
        </div>
      </div>

      <div className="space-y-2">
        {stages.map((stage, index) => {
          const isOutcome = stage.status !== "OPEN";
          return (
            <div
              key={stage.id ?? `new-${index}`}
              className="space-y-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={stage.name}
                  onChange={(event) => patch(index, { name: event.target.value })}
                  className="h-8 max-w-56"
                  aria-label={`Stage ${index + 1} name`}
                  maxLength={60}
                />
                {isOutcome ? (
                  <Badge tone={STAGE_OUTCOME_TONE[stage.status] ?? "neutral"} size="sm">
                    {stage.status === "WON" ? "Won outcome" : "Lost outcome"}
                  </Badge>
                ) : null}
                {stage.dealCount ? (
                  <span className="text-sm text-[var(--text-muted)]">
                    {stage.dealCount} deal{stage.dealCount === 1 ? "" : "s"}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-1">
                  {!isOutcome ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        aria-label="Move earlier"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpward className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        aria-label="Move later"
                        disabled={index >= openStages.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownward className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        aria-label={`Remove ${stage.name}`}
                        disabled={openStages.length <= 1}
                        onClick={() => setStages((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-sm">Probability %</Label>
                  <Input
                    value={stage.probability}
                    onChange={(event) =>
                      patch(index, { probability: Number(event.target.value) || 0 })
                    }
                    inputMode="numeric"
                    className="h-8 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Goes stale after</Label>
                  <Input
                    value={stage.inactivityDays ?? ""}
                    onChange={(event) =>
                      patch(index, {
                        inactivityDays: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    inputMode="numeric"
                    className="h-8 font-mono"
                    placeholder="days"
                    disabled={isOutcome}
                  />
                </div>
                {!isOutcome ? (
                  <>
                    <label className="flex items-end gap-2 pb-1.5 text-sm">
                      <Checkbox
                        checked={Boolean(stage.requiresSiteVisit)}
                        onCheckedChange={(checked) =>
                          patch(index, { requiresSiteVisit: checked === true })
                        }
                      />
                      Expects a visit
                    </label>
                    <label className="flex items-end gap-2 pb-1.5 text-sm">
                      <Checkbox
                        checked={Boolean(stage.requiresQuotation)}
                        onCheckedChange={(checked) =>
                          patch(index, { requiresQuotation: checked === true })
                        }
                      />
                      Expects a quote
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() =>
          setStages((prev) => {
            // New stages land before the outcomes, which stay at the end.
            const lastOpen = prev.map((stage) => stage.status === "OPEN").lastIndexOf(true);
            const next = [...prev];
            next.splice(lastOpen + 1, 0, {
              name: "New stage",
              status: "OPEN",
              probability: 50,
              requiredFields: [],
            });
            return next;
          })
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add stage
      </Button>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => {
            const found = validateStages(stages);
            setErrors(found);
            if (found.length === 0) save.mutate();
          }}
        >
          {save.isPending ? "Saving…" : "Save pipeline"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The pipelines, and what each stage in the selected one actually does.
 *
 * The artboard makes two changes to what was a stack of pipelines each with
 * its own table.
 *
 * The pipelines become a row of cards you pick from, so the page shows one
 * pipeline properly rather than every pipeline partially. With two or three
 * pipelines the old shape was two or three tables down the page, and no way to
 * compare a stage in one against the same stage in another.
 *
 * And a stage opens. A stage is a name, the probability the forecast is
 * weighted by, the idle period after which a deal goes stale, what it gates,
 * how many deals are sitting in it, and the checklist that has to be cleared
 * before a deal may leave. All of that was behind the editor dialog, so the one
 * screen somebody comes here to audit was the screen that showed the least.
 *
 * Read-only, deliberately: this is the audit view, and "Edit stages" is the
 * door to changing any of it. Reordering lives there too, which is why no drag
 * handle is drawn here — a handle that does not drag is worse than none.
 */
export function PipelinesPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CrmPipelineRecord | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [template, setTemplate] = useState<"DEFAULT" | "BLANK">("DEFAULT");

  const pipelinesQuery = useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
  });

  const pipelines = useMemo(() => pipelinesQuery.data?.data ?? [], [pipelinesQuery.data]);
  const selected = pipelines.find((entry) => entry.id === selectedId) ?? pipelines[0] ?? null;

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), template }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      onCreateOpenChange(false);
      setNewName("");
      toast({ title: "Pipeline created" });
    },
    onError: (error) =>
      toast({
        title: "Could not create the pipeline",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/crm/pipelines/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      setSelectedId(null);
      toast({ title: "Pipeline deleted" });
    },
    onError: (error) =>
      toast({
        title: "Could not delete the pipeline",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/pipelines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      toast({ title: "Default pipeline changed" });
    },
  });

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pipeline</DialogTitle>
          <DialogDescription>
            Start from the standard sales path, or from a bare pipeline you shape yourself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-pipeline-name">Name</Label>
            <Input
              id="new-pipeline-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Commercial installations"
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pipeline-template">Starting point</Label>
            <Select
              value={template}
              onValueChange={(value) => setTemplate(value as "DEFAULT" | "BLANK")}
            >
              <SelectTrigger id="new-pipeline-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEFAULT">Standard sales and site visits</SelectItem>
                <SelectItem value="BLANK">Open, won, lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (pipelinesQuery.isLoading) return <Skeleton className="h-96 w-full" />;

  if (!selected) {
    return (
      <>
        <SetupPanel title="Stages">
          <p className="text-sm text-[var(--text-muted)]">
            No pipelines yet. Create one to give deals a path to move along.
          </p>
        </SetupPanel>
        {createDialog}
      </>
    );
  }

  /** The busiest stage sets the scale every bar in the column is drawn to. */
  const busiest = Math.max(1, ...selected.stages.map((stage) => stage._count?.deals ?? 0));

  const rows: ReportRow[] = selected.stages.map((stage) => {
    const deals = stage._count?.deals ?? 0;
    const checks = stage.checklist?.length ?? 0;
    const gates = [
      stage.requiresSiteVisit ? "Site visit" : null,
      stage.requiresQuotation ? "Quotation" : null,
    ].filter((gate): gate is string => gate !== null);
    const isOpen = openStage === stage.id;

    return {
      id: stage.id,
      expanded: isOpen,
      onSelect: () => setOpenStage(isOpen ? null : stage.id),
      cells: [
        node(
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-[2px]",
                STAGE_DOT[stage.status] ?? STAGE_DOT.OPEN,
              )}
            />
            <span className="truncate text-sm font-semibold text-[var(--text-strong)]">
              {stage.name}
            </span>
            {/* Won and Lost can be renamed but not removed or moved off the
                ends. The lock says so where the rule applies, rather than only
                in the note underneath the table. */}
            {stage.status === "OPEN" ? null : (
              <Lock aria-hidden="true" className="size-3 shrink-0 text-[var(--text-subtle)]" />
            )}
          </span>,
        ),
        badge(
          stage.status === "OPEN" ? "Open" : stage.status === "WON" ? "Won" : "Lost",
          stage.status === "WON" ? "ok" : stage.status === "LOST" ? "bad" : "mute",
        ),
        num(`${stage.probability ?? 0}%`, { tone: "strong", bold: true }),
        // A stage with no idle rule never goes stale. That is a real setting
        // rather than a missing one, so it reads as a word, not an empty cell.
        stage.inactivityDays
          ? txt(`${stage.inactivityDays} days`, { mono: true })
          : txt("never", { mono: true, tone: "dim" }),
        gates.length > 0 ? badge(gates.join(" + "), "warn") : txt("—", { tone: "dim" }),
        checks > 0 ? txt(`${checks} check${checks === 1 ? "" : "s"}`) : txt("none", { tone: "dim" }),
        bar(String(deals), (deals / busiest) * 100, {
          tone: stage.status === "WON" ? "ok" : stage.status === "LOST" ? "bad" : "body",
        }),
        node(
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 text-[var(--text-disabled)] transition-transform",
              isOpen && "rotate-90",
            )}
          />,
          { align: "right" },
        ),
      ],
      detail: (
        <div>
          <p className="acct-rail-heading mb-1.5">Checklist before leaving this stage</p>
          {checks === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">No checklist on this stage.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(stage.checklist ?? []).map((item) => (
                <li key={item.key} className="flex items-center gap-2.5">
                  <span className="size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-[var(--border-strong)] bg-[var(--surface-base)]" />
                  <span className="text-sm text-[var(--text-body)]">{item.label}</span>
                  <span className="acct-rail-sub">{item.key}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="min-w-0">
      {/* Pick a pipeline. A card each, carrying the two things that decide
          which one you want: whether it is the default, and how much is in it. */}
      <div className="mb-2.5 flex flex-wrap gap-2">
        {pipelines.map((pipeline) => {
          const active = pipeline.id === selected.id;
          const deals = pipeline._count?.deals ?? 0;
          return (
            <button
              key={pipeline.id}
              type="button"
              aria-current={active}
              onClick={() => {
                setSelectedId(pipeline.id);
                setOpenStage(null);
              }}
              className={cn(
                "min-w-[210px] rounded-[var(--card-radius)] border px-3 py-2.5 text-left",
                active
                  ? "border-[var(--action-primary-bg)] bg-[var(--surface-base)]"
                  : "border-[var(--border)] bg-[var(--canvas)] hover:bg-[var(--surface-base)]",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-[var(--text-strong)]">
                  {pipeline.name}
                </span>
                {pipeline.isDefault ? (
                  <span className="acct-badge shrink-0" data-tone="info">
                    Default
                  </span>
                ) : null}
              </span>
              <span className="acct-caption mt-0.5 block">
                {pipeline.stages.length} stage{pipeline.stages.length === 1 ? "" : "s"} · {deals}{" "}
                open deal{deals === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      <SetupPanel title="Stages" hint="click a stage to see its checklist" flush>
        <ReportTable
          label={`Stages in ${selected.name}`}
          tracks="150px 86px 70px 92px 132px minmax(0,1fr) 150px 34px"
          columns={[
            { label: "Stage" },
            { label: "Outcome" },
            { label: "Win %", align: "right" },
            { label: "Idle after" },
            { label: "Requires" },
            { label: "Checklist" },
            { label: "In it now" },
            { label: "" },
          ]}
          rows={rows}
          emptyLabel="This pipeline has no stages yet."
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] px-[13px] py-2.5">
          <Button size="sm" variant="outline" onClick={() => setEditing(selected)}>
            Edit stages
          </Button>
          {selected.isDefault ? null : (
            <>
              <Button size="sm" variant="ghost" onClick={() => makeDefault.mutate(selected.id)}>
                Make default
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto size-8 px-0"
                aria-label={`Delete ${selected.name}`}
                onClick={() => remove.mutate(selected.id)}
              >
                <Trash2 aria-hidden="true" className="size-4 text-[var(--text-subtle)]" />
              </Button>
            </>
          )}
        </div>
      </SetupPanel>

      <SetupNote icon={Lock} tone="info">
        Won and Lost can be renamed but not removed, and not moved off the ends — every pipeline has
        to be able to answer &ldquo;did we win this?&rdquo;. The server enforces the same rule.
      </SetupNote>

      <Dialog open={Boolean(editing)} onOpenChange={(next) => (!next ? setEditing(null) : undefined)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              Rename, reorder and add stages. A stage that still has deals in it is archived rather
              than removed, so those deals keep a stage to point at.
            </DialogDescription>
          </DialogHeader>
          {editing ? <StageEditor pipeline={editing} onClose={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      {createDialog}
    </div>
  );
}
