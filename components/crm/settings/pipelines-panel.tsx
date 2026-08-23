"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ReportTable,
  badge,
  nm,
  num,
  txt,
} from "@/components/accounting/report-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowDownward, ArrowUpward, Plus, Trash2 } from "@/lib/icons";
import { fetchCrmPipelines, type CrmPipelineRecord } from "@/lib/crm/crm-v2";
import { STAGE_OUTCOME_TONE } from "@/lib/crm/tones";
import { validateStages, type StageInput } from "@/lib/crm/pipelines";

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

export function PipelinesPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CrmPipelineRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [template, setTemplate] = useState<"DEFAULT" | "BLANK">("DEFAULT");

  const pipelinesQuery = useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
  });

  const pipelines = pipelinesQuery.data?.data ?? [];

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), template }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      setCreateOpen(false);
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

  if (pipelinesQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      {/* No title here. The settings shell draws "Pipelines" and its
          description immediately above this card, and the panel repeating both
          in slightly different words spent the whole first screen of a phone
          saying the same thing twice before a single pipeline appeared. */}
      <CardHeader className="flex flex-row items-center justify-end gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New pipeline
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="space-y-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{pipeline.name}</span>
                  {pipeline.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                  <span className="text-sm text-[var(--text-muted)]">
                    {pipeline._count?.deals ?? 0} deal
                    {(pipeline._count?.deals ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                {pipeline.description ? (
                  <p className="text-sm text-[var(--text-muted)]">{pipeline.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {!pipeline.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => makeDefault.mutate(pipeline.id)}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setEditing(pipeline)}>
                  Edit stages
                </Button>
                {!pipeline.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    aria-label={`Delete ${pipeline.name}`}
                    onClick={() => remove.mutate(pipeline.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {/*
              The stages, with what each one actually does.

              This was a row of name-only badges. A stage is not just a name —
              it carries the probability the forecast is weighted by, the idle
              period after which a deal goes stale, and the fields and checks
              that gate leaving it. None of that was visible without opening
              the editor, so the one screen somebody comes to this page to
              audit was the one screen that showed the least.

              Read-only here, on purpose: this is the audit view, and "Edit
              stages" directly above is the door to changing any of it.
            */}
            <ReportTable
              label={`Stages in ${pipeline.name}`}
              tracks="minmax(0,1fr) 110px 90px 90px 110px"
              columns={[
                { label: "Stage" },
                { label: "Status" },
                { label: "Win %", align: "right" },
                { label: "Stale after", align: "right" },
                { label: "Gates", align: "right" },
              ]}
              rows={pipeline.stages.map((stage) => {
                const gates =
                  (stage.requiredFields?.length ?? 0) + (stage.checklist?.length ?? 0);
                return {
                  id: stage.id,
                  cells: [
                    nm(stage.name),
                    badge(
                      stage.status === "OPEN"
                        ? "Open"
                        : stage.status === "WON"
                          ? "Won"
                          : "Lost",
                      stage.status === "WON" ? "ok" : stage.status === "LOST" ? "bad" : "mute",
                    ),
                    num(`${stage.probability ?? 0}%`),
                    // A stage with no idle rule never goes stale, which is a
                    // real setting rather than a missing one — so it reads as
                    // "never" rather than as an empty cell.
                    stage.inactivityDays
                      ? num(`${stage.inactivityDays}d`)
                      : txt("never", { align: "right", tone: "dim" }),
                    gates === 0
                      ? txt("none", { align: "right", tone: "dim" })
                      : num(`${gates}`, { tone: "warn" }),
                  ],
                };
              })}
              emptyLabel="This pipeline has no stages yet."
            />
          </div>
        ))}
      </CardContent>

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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
            >
              {create.isPending ? "Creating…" : "Create pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
