"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { SearchableSelect, type SearchableOption } from "@corelithzw/ui/components/searchable-select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchCrmCompanies,
  fetchCrmFieldDefinitions,
  fetchCrmPeople,
  fetchCrmPipelines,
  fetchCrmSites,
  type CrmFieldDefinitionRecord,
} from "../../crm-v2";
import type { LeadFilterOwner } from "../leads/leads-filters";

import { CustomFieldInputs } from "./custom-field-inputs";
import { RecordMarkField } from "@corelithzw/module-records/components/record-mark-field";

const CURRENCIES = ["USD", "ZWL", "ZAR", "GBP", "EUR"];

const FORECAST_CATEGORIES = [
  { value: "PIPELINE", label: "Pipeline", hint: "Early — might not land" },
  { value: "BEST_CASE", label: "Best case", hint: "Going well, not certain" },
  { value: "COMMIT", label: "Commit", hint: "You're standing behind this one" },
  { value: "CLOSED", label: "Closed", hint: "Decided either way" },
];

type FormState = {
  emoji: string;
  accent: string;
  avatarUrl: string;
  title: string;
  clientId: string;
  primaryContactId: string;
  siteId: string;
  pipelineId: string;
  stageId: string;
  value: string;
  currency: string;
  forecastCategory: string;
  expectedCloseDate: string;
  assignedToId: string;
};

const EMPTY: FormState = {
  emoji: "",
  accent: "",
  avatarUrl: "",
  title: "",
  clientId: "",
  primaryContactId: "",
  siteId: "",
  pipelineId: "",
  stageId: "",
  value: "",
  currency: "USD",
  forecastCategory: "PIPELINE",
  expectedCloseDate: "",
  assignedToId: "",
};

export function DealFormSheet({
  open,
  onOpenChange,
  defaultClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  onCreated?: (dealId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const pipelinesQuery = useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
    enabled: open,
  });
  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "options"],
    queryFn: () => fetchCrmCompanies({ limit: 200 }),
    enabled: open,
  });
  const peopleQuery = useQuery({
    queryKey: ["crm", "people", "options", form.clientId],
    queryFn: () =>
      fetchCrmPeople({ filters: form.clientId ? { clientId: form.clientId } : {}, limit: 200 }),
    enabled: open,
  });
  const sitesQuery = useQuery({
    queryKey: ["crm", "sites", "options", form.clientId],
    queryFn: () =>
      fetchCrmSites({ filters: form.clientId ? { clientIds: [form.clientId] } : {}, limit: 200 }),
    enabled: open,
  });
  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
    enabled: open,
  });
  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "DEAL"],
    queryFn: () => fetchCrmFieldDefinitions("DEAL"),
    enabled: open,
  });

  const pipelines = useMemo(() => pipelinesQuery.data?.data ?? [], [pipelinesQuery.data]);
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);
  const openStages = useMemo(
    () => (selectedPipeline?.stages ?? []).filter((stage) => stage.status === "OPEN"),
    [selectedPipeline],
  );

  // Reset as the sheet opens, adjusting state during render rather than in an
  // effect so there is no flash of the previous deal's details.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({ ...EMPTY, clientId: defaultClientId ?? "" });
      setCustomValues({});
      setErrors([]);
    }
  }

  // Default to the company's default pipeline and its first open stage, so the
  // common case needs no pipeline decision at all. Derived at render time —
  // once the pipelines have loaded there is nothing to wait for.
  if (open && !form.pipelineId && pipelines.length > 0) {
    const preferred = pipelines.find((pipeline) => pipeline.isDefault) ?? pipelines[0];
    const firstOpen = preferred.stages.filter((stage) => stage.status === "OPEN")[0];
    setForm((prev) => ({ ...prev, pipelineId: preferred.id, stageId: firstOpen?.id ?? "" }));
  }

  const companyOptions = useMemo<SearchableOption[]>(
    () =>
      (companiesQuery.data?.data ?? []).map((company) => ({
        value: company.id,
        label: company.name,
        description: company.city ?? undefined,
      })),
    [companiesQuery.data],
  );
  const personOptions = useMemo<SearchableOption[]>(
    () =>
      (peopleQuery.data?.data ?? []).map((person) => ({
        value: person.id,
        label: person.fullName,
        description: person.jobTitle ?? person.email ?? undefined,
      })),
    [peopleQuery.data],
  );
  const siteOptions = useMemo<SearchableOption[]>(
    () =>
      (sitesQuery.data?.data ?? []).map((site) => ({
        value: site.id,
        label: site.name,
        description: [site.addressLine, site.city].filter(Boolean).join(", ") || undefined,
      })),
    [sitesQuery.data],
  );
  const owners = teamQuery.data?.data ?? [];
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];

  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string; dealNo: string }>("/api/v2/crm/deals", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          clientId: form.clientId || null,
          primaryContactId: form.primaryContactId || null,
          siteId: form.siteId || null,
          pipelineId: form.pipelineId || undefined,
          stageId: form.stageId || undefined,
          value: form.value.trim() ? Number(form.value) : null,
          currency: form.currency,
          forecastCategory: form.forecastCategory,
          expectedCloseDate: form.expectedCloseDate
            ? new Date(form.expectedCloseDate).toISOString()
            : null,
          assignedToId: form.assignedToId || null,
          emoji: form.emoji.trim() || null,
          accent: form.accent.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          customFields: customValues,
        }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
      toast({ title: "Deal created", description: result.dealNo });
      onOpenChange(false);
      onCreated?.(result.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!form.title.trim()) found.push("Give the deal a title.");
    if (form.value.trim() && !Number.isFinite(Number(form.value))) {
      found.push("Value must be a number.");
    }
    if (!form.stageId) found.push("Pick a stage to start in.");
    return found;
  };

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New deal"
      description="A live opportunity — this is what carries the quote, the visit and the payment."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const found = validate();
        setErrors(found);
        if (found.length === 0) save.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Create deal"}
        </Button>
      </>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="deal-title">Title *</Label>
        <Input
          id="deal-title"
          value={form.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="e.g. Warehouse roof replacement"
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <SearchableSelect
          label="Company"
          value={form.clientId}
          options={companyOptions}
          placeholder={companiesQuery.isLoading ? "Loading companies…" : "Search companies"}
          onValueChange={(clientId) =>
            // Contacts and sites are scoped to the company, so a change
            // here invalidates whatever was picked under the old one.
            patch({ clientId, primaryContactId: "", siteId: "" })
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          label="Primary contact"
          value={form.primaryContactId}
          options={personOptions}
          placeholder="Search people"
          onValueChange={(primaryContactId) => patch({ primaryContactId })}
        />
        <SearchableSelect
          label="Site"
          value={form.siteId}
          options={siteOptions}
          placeholder="Search sites"
          onValueChange={(siteId) => patch({ siteId })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deal-pipeline">Pipeline</Label>
          <Select
            value={form.pipelineId}
            onValueChange={(pipelineId) => {
              const pipeline = pipelines.find((entry) => entry.id === pipelineId);
              const firstOpen = pipeline?.stages.filter((stage) => stage.status === "OPEN")[0];
              patch({ pipelineId, stageId: firstOpen?.id ?? "" });
            }}
          >
            <SelectTrigger id="deal-pipeline">
              <SelectValue placeholder="Choose a pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-stage">Starting stage *</Label>
          <Select value={form.stageId} onValueChange={(stageId) => patch({ stageId })}>
            <SelectTrigger id="deal-stage">
              <SelectValue placeholder="Choose a stage" />
            </SelectTrigger>
            <SelectContent>
              {openStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="deal-value">Value</Label>
          <Input
            id="deal-value"
            inputMode="decimal"
            className="font-mono"
            value={form.value}
            onChange={(event) => patch({ value: event.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-currency">Currency</Label>
          <Select value={form.currency} onValueChange={(currency) => patch({ currency })}>
            <SelectTrigger id="deal-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deal-close">Expected close</Label>
          <Input
            id="deal-close"
            type="date"
            value={form.expectedCloseDate}
            onChange={(event) => patch({ expectedCloseDate: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-forecast">Forecast</Label>
          <Select
            value={form.forecastCategory}
            onValueChange={(forecastCategory) => patch({ forecastCategory })}
          >
            <SelectTrigger id="deal-forecast">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORECAST_CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-[var(--text-muted)]">
            {FORECAST_CATEGORIES.find((entry) => entry.value === form.forecastCategory)?.hint}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deal-owner">Owner</Label>
        <Select
          value={form.assignedToId || "__unassigned"}
          onValueChange={(value) =>
            patch({ assignedToId: value === "__unassigned" ? "" : value })
          }
        >
          <SelectTrigger id="deal-owner">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned">Unassigned</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name ?? "Unnamed"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <RecordMarkField

        kind="deal"

        name={form.title}

        emoji={form.emoji}

        avatarUrl={form.avatarUrl}

        onChange={(next) => setForm((previous) => ({ ...previous, ...next }))}

      />


      <CustomFieldInputs
        definitions={definitions}
        values={customValues}
        onChange={setCustomValues}
      />
    </RecordDialog>
  );
}
