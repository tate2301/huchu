"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Switch } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  ACTION_LABELS,
  ACTION_TYPES,
  AUTOMATION_TRIGGERS,
  OPERATOR_LABELS,
  TRIGGER_LABELS,
  type ActionType,
  type AutomationAction,
  type AutomationCondition,
} from "@/lib/crm/automation";
import {
  LEAD_STAGE_OPTIONS,
  TASK_TYPE_OPTIONS,
  fieldsForTrigger,
  findField,
  operatorNeedsValue,
  operatorsForKind,
  triggerUsesIdle,
  triggerUsesStage,
  writableFieldsForTrigger,
} from "@/lib/crm/automation-fields";
import { Funnel, Rule } from "@corelithzw/ui/lib/icons";

import {
  SequenceCanvas,
  SequenceInsert,
  SequenceNode,
} from "./sequence-canvas";
import { ACTION_ICON, TRIGGER_ICON } from "./workflow-marks";
import { FieldValueInput, OptionSelect, defaultAction, type Owner } from "./step-fields";

type WorkflowRecord = {
  id: string;
  name: string;
  description: string | null;
  trigger: (typeof AUTOMATION_TRIGGERS)[number];
  triggerConfig: { stage?: string; idleDays?: number; entity?: "LEAD" | "DEAL" } | null;
  conditions: AutomationCondition[] | null;
  actions: AutomationAction[];
  isEnabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  runs: { id: string; status: string; createdAt: string }[];
};

/**
 * One workflow, drawn and edited as a sequence.
 *
 * Everything used to happen inside a modal: the rule you were editing covered
 * the list of rules, and a sequence with five steps had to fit a dialog. A
 * workflow is a thing you come back to and tune, so it gets a page — and the
 * page is the sequence itself, edited in place rather than through a form
 * whose shape has nothing to do with what runs.
 */
export function WorkflowEditor({ workflowId }: { workflowId: string | null }) {
  const isNew = workflowId === null;
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [trigger, setTrigger] =
    useState<(typeof AUTOMATION_TRIGGERS)[number]>("LEAD_CREATED");
  const [stage, setStage] = useState("");
  const [idleDays, setIdleDays] = useState(7);
  const [idleEntity, setIdleEntity] = useState<"LEAD" | "DEAL">("LEAD");
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([defaultAction("CREATE_TASK")]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const workflowQuery = useQuery({
    queryKey: ["crm-workflow", workflowId],
    queryFn: () => fetchJson<WorkflowRecord>(`/api/v2/crm/automations/${workflowId}`),
    enabled: !isNew,
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: Owner[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });
  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);

  const fields = useMemo(() => fieldsForTrigger(trigger), [trigger]);
  const writableFields = useMemo(() => writableFieldsForTrigger(trigger), [trigger]);

  // Seeded during render rather than in an effect, so the canvas never shows
  // the empty default for a frame before the saved workflow lands.
  const loaded = workflowQuery.data;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = loaded?.id ?? null;
  if (loaded && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setName(loaded.name);
    setTrigger(loaded.trigger);
    setStage(loaded.triggerConfig?.stage ?? "");
    setIdleDays(loaded.triggerConfig?.idleDays ?? 7);
    setIdleEntity(loaded.triggerConfig?.entity ?? "LEAD");
    setConditions(loaded.conditions ?? []);
    setActions(loaded.actions.length ? loaded.actions : [defaultAction("CREATE_TASK")]);
    setIsEnabled(loaded.isEnabled);
    setErrors([]);
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson<WorkflowRecord>(
        isNew ? "/api/v2/crm/automations" : `/api/v2/crm/automations/${workflowId}`,
        {
          method: isNew ? "POST" : "PATCH",
          body: JSON.stringify({
            name,
            trigger,
            // Only the bits this trigger uses. A stray `stage` on a
            // LEAD_CREATED rule reads as a condition somebody set and the
            // engine then ignored.
            triggerConfig: triggerUsesStage(trigger)
              ? { stage: stage || undefined }
              : triggerUsesIdle(trigger)
                ? { idleDays, entity: idleEntity }
                : {},
            conditions,
            actions,
            isEnabled,
          }),
        },
      ),
    onSuccess: (saved) => {
      toast({ title: isNew ? "Workflow created" : "Workflow saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["crm-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["crm-workflow", workflowId] });
      if (isNew) router.replace(`/crm/workflows/${saved.id}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  function validate(): string[] {
    const found: string[] = [];
    if (!name.trim()) found.push("Give the workflow a name.");
    if (actions.length === 0) found.push("A workflow that does nothing is not a workflow — add a step.");
    if (actions.some((action) => action.type === "ADD_TAG" && !action.tag.trim())) {
      found.push("A tag step needs a tag.");
    }
    if (actions.some((action) => action.type === "CREATE_TASK" && !action.title.trim())) {
      found.push("A task step needs a title.");
    }
    if (actions.some((action) => action.type === "NOTIFY" && !action.message.trim())) {
      found.push("A notification needs something to say.");
    }
    if (actions.some((action) => action.type === "SET_FIELD" && !action.field)) {
      found.push("Pick the field a step should set.");
    }
    if (conditions.some((condition) => !condition.field)) {
      found.push("Every filter needs a field.");
    }
    return found;
  }

  const patchCondition = (index: number, next: Partial<AutomationCondition>) =>
    setConditions((previous) =>
      previous.map((item, position) => (position === index ? { ...item, ...next } : item)),
    );

  const patchAction = (index: number, next: Record<string, unknown>) =>
    setActions((previous) =>
      previous.map((item, position) =>
        position === index ? ({ ...item, ...next } as AutomationAction) : item,
      ),
    );

  const insertAction = (at: number, type: ActionType) =>
    setActions((previous) => [
      ...previous.slice(0, at),
      defaultAction(type),
      ...previous.slice(at),
    ]);

  const insertOptions = ACTION_TYPES.map((value) => ({
    value,
    label: ACTION_LABELS[value],
  }));

  if (!isNew && workflowQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isNew && (workflowQuery.error || !loaded)) {
    return (
      <Alert tone="danger" title="Workflow not found">
        {workflowQuery.error
          ? getApiErrorMessage(workflowQuery.error)
          : "It may have been deleted."}
      </Alert>
    );
  }

  const TriggerIcon = TRIGGER_ICON[trigger] ?? Rule;

  return (
    <div className="space-y-5">
      <PageChrome
        title={name || (isNew ? "New workflow" : "Workflow")}
        backHref="/crm/workflows"
        backLabel="All workflows"
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={isEnabled}
              onChange={(event) => setIsEnabled(event.target.checked)}
              aria-label="Workflow is live"
            />
            <span className="text-[var(--text-muted)]">{isEnabled ? "Live" : "Paused"}</span>
          </label>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              const found = validate();
              setErrors(found);
              if (found.length === 0) save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : isNew ? "Create workflow" : "Save"}
          </Button>
        </div>
      </PageChrome>

      {errors.length > 0 ? (
        <Alert tone="danger" title="Not saved yet">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="workflow-name">Name</Label>
        <Input
          id="workflow-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Chase big new leads the same day"
        />
      </div>

      {loaded ? (
        <p className="text-sm text-[var(--text-muted)]">
          Run {loaded.runCount} time{loaded.runCount === 1 ? "" : "s"}
          {loaded.lastRunAt ? (
            <>
              {" · last "}
              <ClientDate value={loaded.lastRunAt} mode="datetime" />
            </>
          ) : null}
        </p>
      ) : null}

      <SequenceCanvas>
        <SequenceNode
          tone="trigger"
          icon={TriggerIcon}
          title={TRIGGER_LABELS[trigger]}
          summary="What starts this off. Everything below runs when it happens."
        >
          <OptionSelect
            value={trigger}
            onValueChange={(value) => {
              setTrigger(value as (typeof AUTOMATION_TRIGGERS)[number]);
              // Which fields a filter can name depends on the record the
              // trigger hands over, so filters written against the old one
              // would quietly stop matching. Clearing them is honest.
              setConditions([]);
            }}
            options={AUTOMATION_TRIGGERS.map((value) => ({
              value,
              label: TRIGGER_LABELS[value],
            }))}
            ariaLabel="Trigger"
          />

          {triggerUsesStage(trigger) ? (
            <div className="space-y-1.5">
              <Label>Only when it lands on</Label>
              <OptionSelect
                value={stage}
                onValueChange={setStage}
                options={[{ value: "", label: "Any stage" }, ...LEAD_STAGE_OPTIONS]}
                placeholder="Any stage"
                ariaLabel="Landing stage"
              />
            </div>
          ) : null}

          {triggerUsesIdle(trigger) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="workflow-idle-days">Days of silence</Label>
                <Input
                  id="workflow-idle-days"
                  type="number"
                  min={1}
                  value={idleDays}
                  onChange={(event) => setIdleDays(Number(event.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>On</Label>
                <OptionSelect
                  value={idleEntity}
                  onValueChange={(value) => setIdleEntity(value as "LEAD" | "DEAL")}
                  options={[
                    { value: "LEAD", label: "Leads" },
                    { value: "DEAL", label: "Deals" },
                  ]}
                  ariaLabel="Record type"
                />
              </div>
            </div>
          ) : null}
        </SequenceNode>

        <SequenceInsert
          label="Add a filter"
          options={[{ value: "filter", label: "Add a filter", description: "Only carry on when this holds" }]}
          onSelect={() =>
            setConditions((previous) => [
              ...previous,
              { field: fields[0]?.path ?? "", operator: "equals", value: "" },
            ])
          }
        />

        {conditions.map((condition, index) => {
          const field = findField(trigger, condition.field);
          const operators = operatorsForKind(field?.kind ?? "text");
          return (
            <SequenceNode
              key={`condition-${index}`}
              tone="filter"
              icon={Funnel}
              title={field?.label ?? "Filter"}
              summary={
                operatorNeedsValue(condition.operator)
                  ? `Carry on when ${field?.label ?? condition.field} ${OPERATOR_LABELS[condition.operator]} ${condition.value ?? ""}`
                  : `Carry on when ${field?.label ?? condition.field} ${OPERATOR_LABELS[condition.operator]}`
              }
              onRemove={() =>
                setConditions((previous) =>
                  previous.filter((_item, position) => position !== index),
                )
              }
              removeLabel="Remove filter"
            >
              <div className="flex flex-wrap gap-2">
                <OptionSelect
                  className="min-w-40 flex-1"
                  value={condition.field}
                  onValueChange={(value) => {
                    const next = findField(trigger, value);
                    // Widened to string: each kind returns its own narrow
                    // tuple, so `includes` refuses an operator from another
                    // kind — which is exactly the case being tested for.
                    const allowed: readonly string[] = operatorsForKind(next?.kind ?? "text");
                    patchCondition(index, {
                      field: value,
                      operator: allowed.includes(condition.operator)
                        ? condition.operator
                        : (allowed[0] as AutomationCondition["operator"]),
                      value: "",
                    });
                  }}
                  options={fields.map((option) => ({
                    value: option.path,
                    label: option.label,
                  }))}
                  placeholder="Field"
                  ariaLabel="Filter field"
                />

                <OptionSelect
                  className="w-36"
                  value={condition.operator}
                  onValueChange={(value) =>
                    patchCondition(index, {
                      operator: value as AutomationCondition["operator"],
                    })
                  }
                  options={operators.map((value) => ({
                    value,
                    label: OPERATOR_LABELS[value],
                  }))}
                  ariaLabel="Filter operator"
                />

                {operatorNeedsValue(condition.operator) ? (
                  <FieldValueInput
                    className="min-w-32 flex-1"
                    field={field}
                    value={condition.value}
                    owners={owners}
                    onChange={(value) => patchCondition(index, { value })}
                  />
                ) : null}
              </div>
            </SequenceNode>
          );
        })}

        {actions.map((action, index) => (
          <Fragment key={`step-${index}`}>
            <SequenceInsert
              options={insertOptions}
              onSelect={(value) => insertAction(index, value as ActionType)}
            />

            <SequenceNode
              tone="action"
              icon={ACTION_ICON[action.type]}
              title={ACTION_LABELS[action.type]}
              step={index + 1}
              last={index === actions.length - 1}
              onRemove={() =>
                setActions((previous) =>
                  previous.filter((_item, position) => position !== index),
                )
              }
              removeLabel={`Remove step ${index + 1}`}
            >
              {action.type === "CREATE_TASK" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="flex-1"
                      value={action.title}
                      placeholder="Task title"
                      aria-label="Task title"
                      onChange={(event) => patchAction(index, { title: event.target.value })}
                    />
                    <Input
                      className="w-20 sm:w-28"
                      type="number"
                      min={0}
                      value={action.dueInDays}
                      aria-label="Days from now"
                      onChange={(event) =>
                        patchAction(index, { dueInDays: Number(event.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <OptionSelect
                      className="flex-1"
                      value={action.taskType ?? "GENERAL"}
                      onValueChange={(value) => patchAction(index, { taskType: value })}
                      options={TASK_TYPE_OPTIONS}
                      ariaLabel="Task type"
                    />
                    <OptionSelect
                      className="flex-1"
                      value={action.assignedToId ?? ""}
                      onValueChange={(value) =>
                        patchAction(index, { assignedToId: value || null })
                      }
                      options={[
                        { value: "", label: "Whoever owns the record" },
                        ...owners.map((owner) => ({
                          value: owner.id,
                          label: owner.name ?? "Unnamed",
                        })),
                      ]}
                      ariaLabel="Task assignee"
                    />
                  </div>
                </div>
              ) : null}

              {action.type === "ADD_TAG" ? (
                <Input
                  value={action.tag}
                  placeholder="Tag"
                  aria-label="Tag"
                  onChange={(event) => patchAction(index, { tag: event.target.value })}
                />
              ) : null}

              {action.type === "NOTIFY" ? (
                <div className="space-y-2">
                  <Input
                    value={action.message}
                    placeholder="What the notification says"
                    aria-label="Notification message"
                    onChange={(event) => patchAction(index, { message: event.target.value })}
                  />
                  <OptionSelect
                    value={action.recipientIds[0] ?? ""}
                    onValueChange={(value) =>
                      patchAction(index, { recipientIds: value ? [value] : [] })
                    }
                    options={[
                      { value: "", label: "The record's owner" },
                      ...owners.map((owner) => ({
                        value: owner.id,
                        label: owner.name ?? "Unnamed",
                      })),
                    ]}
                    ariaLabel="Notify"
                  />
                </div>
              ) : null}

              {action.type === "SET_FIELD" ? (
                <div className="flex flex-wrap gap-2">
                  <OptionSelect
                    className="flex-1"
                    value={action.field}
                    onValueChange={(value) => patchAction(index, { field: value, value: "" })}
                    options={writableFields.map((option) => ({
                      value: option.path,
                      label: option.label,
                    }))}
                    placeholder="Field"
                    ariaLabel="Field to set"
                  />
                  <FieldValueInput
                    className="flex-1"
                    field={findField(trigger, action.field)}
                    value={action.value}
                    owners={owners}
                    onChange={(value) => patchAction(index, { value })}
                  />
                </div>
              ) : null}

              {action.type === "ASSIGN_OWNER" ? (
                <OptionSelect
                  value={action.assignedToId ?? ""}
                  onValueChange={(value) => patchAction(index, { assignedToId: value || null })}
                  options={[
                    { value: "", label: "Whoever the assignment rule picks" },
                    ...owners.map((owner) => ({
                      value: owner.id,
                      label: owner.name ?? "Unnamed",
                    })),
                  ]}
                  ariaLabel="Owner"
                />
              ) : null}
            </SequenceNode>
          </Fragment>
        ))}

        <SequenceInsert
          options={insertOptions}
          onSelect={(value) => insertAction(actions.length, value as ActionType)}
        />
      </SequenceCanvas>
    </div>
  );
}
