"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadStage } from "@corelithzw/db";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { X } from "@/lib/icons";
import { CRM_STAGE_DEFAULT_PROBABILITY } from "@/lib/crm/pipeline";

import type { LeadFilterOwner } from "./leads-filters";
import { CRM_CHANNEL_LABELS, CRM_LEAD_CHANNELS, CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "./stage-config";

const CURRENCIES = ["USD", "ZWL", "ZAR", "GBP", "EUR"];

export type LeadFormValues = {
  id?: string;
  title: string;
  clientId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  stage: CrmLeadStage;
  estimatedValue: string;
  currency: string;
  probability: string;
  services: string[];
  source: string;
  sourceChannel: string;
  assignedToId: string;
};

const EMPTY_FORM: LeadFormValues = {
  title: "",
  clientId: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  stage: "NEW",
  estimatedValue: "",
  currency: "USD",
  probability: "",
  services: [],
  source: "",
  sourceChannel: "MANUAL",
  assignedToId: "",
};

type ClientOption = { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
type LeadSourceOption = { id: string; name: string; channel: string; isActive: boolean };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-[var(--text-strong)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ServicesInput({
  services,
  onChange,
}: {
  services: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    if (!value || services.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...services, value]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder="Type a service and press Enter"
      />
      {services.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {services.map((service) => (
            <Badge key={service} variant="secondary" className="gap-1 pr-1">
              {service}
              <button
                type="button"
                onClick={() => onChange(services.filter((entry) => entry !== service))}
                aria-label={`Remove ${service}`}
                className="rounded-full p-0.5 hover:bg-[var(--surface-hover)]"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Create or edit a lead. Everything the pipeline reports on — value, owner,
 * source, services — is captured here rather than left to be backfilled, since
 * a lead with no owner and no value is invisible to every view that matters.
 */
export function LeadFormSheet({
  open,
  onOpenChange,
  initial,
  owners,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<LeadFormValues> & { id?: string };
  owners: LeadFilterOwner[];
  onSaved?: (leadId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState<LeadFormValues>({ ...EMPTY_FORM, ...initial });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initial });
      setErrors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const clientsQuery = useQuery({
    queryKey: ["crm", "clients", "options"],
    queryFn: () => fetchJson<{ data: ClientOption[] }>("/api/v2/crm/clients?limit=200"),
    enabled: open,
  });

  const sourcesQuery = useQuery({
    queryKey: ["crm", "lead-sources"],
    queryFn: () => fetchJson<{ data: LeadSourceOption[] }>("/api/v2/crm/lead-sources"),
    enabled: open,
  });

  const clients = useMemo(() => clientsQuery.data?.data ?? [], [clientsQuery.data]);
  const sources = useMemo(
    () => (sourcesQuery.data?.data ?? []).filter((source) => source.isActive),
    [sourcesQuery.data],
  );

  const clientOptions = useMemo<SearchableOption[]>(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        description: client.contactName ?? client.email ?? client.phone ?? undefined,
      })),
    [clients],
  );

  const createClient = useMutation({
    mutationFn: (name: string) =>
      fetchJson<ClientOption>("/api/v2/crm/clients", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "clients", "options"] });
      setForm((prev) => ({ ...prev, clientId: result.id }));
      toast({ title: "Client created", description: `${result.name} is now on file.` });
    },
    onError: (error) =>
      toast({
        title: "Could not create client",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title.trim() || null,
        clientId: form.clientId || null,
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        stage: form.stage,
        estimatedValue: form.estimatedValue.trim() ? Number(form.estimatedValue) : null,
        currency: form.currency,
        services: form.services,
        source: form.source.trim() || null,
        sourceChannel: form.sourceChannel || null,
        assignedToId: form.assignedToId || null,
      };
      if (isEdit) {
        return fetchJson<{ id: string }>(`/api/v2/crm/leads/${initial?.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...body,
            probability: form.probability.trim() ? Number(form.probability) : null,
          }),
        });
      }
      return fetchJson<{ id: string }>("/api/v2/crm/leads", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["crm-lead", initial?.id] });
      toast({ title: isEdit ? "Lead updated" : "Lead created" });
      onOpenChange(false);
      onSaved?.(result.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!form.title.trim() && !form.clientId && !form.contactName.trim()) {
      found.push("Give the lead a title, a client, or at least a contact name.");
    }
    if (form.estimatedValue.trim() && !Number.isFinite(Number(form.estimatedValue))) {
      found.push("Estimated value must be a number.");
    }
    if (form.estimatedValue.trim() && Number(form.estimatedValue) < 0) {
      found.push("Estimated value cannot be negative.");
    }
    if (form.contactEmail.trim() && !form.contactEmail.includes("@")) {
      found.push("Contact email doesn't look like an email address.");
    }
    const probability = Number(form.probability);
    if (form.probability.trim() && (!Number.isFinite(probability) || probability < 0 || probability > 100)) {
      found.push("Probability must be between 0 and 100.");
    }
    return found;
  };

  const patch = (next: Partial<LeadFormValues>) => setForm((prev) => ({ ...prev, ...next }));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit lead" : "New lead"}
      description={isEdit
        ? "Update what you know about this opportunity."
        : "Capture the opportunity now — you can fill in the rest as it develops."}
      size="xl"
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
          {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create lead"}
        </Button>
      </>}
    >
      <Section title="Opportunity">
        <div className="space-y-1.5">
          <Label htmlFor="lead-title">Title</Label>
          <Input
            id="lead-title"
            value={form.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="e.g. Warehouse roof replacement"
            maxLength={200}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lead-value">Estimated value</Label>
            <Input
              id="lead-value"
              inputMode="decimal"
              className="font-mono"
              value={form.estimatedValue}
              onChange={(event) => patch({ estimatedValue: event.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-currency">Currency</Label>
            <Select value={form.currency} onValueChange={(value) => patch({ currency: value })}>
              <SelectTrigger id="lead-currency">
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
            <Label htmlFor="lead-stage">Stage</Label>
            <Select
              value={form.stage}
              onValueChange={(value) => patch({ stage: value as CrmLeadStage })}
            >
              <SelectTrigger id="lead-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_LEAD_STAGES.map((stage: CrmLeadStage) => (
                  <SelectItem key={stage} value={stage}>
                    {CRM_STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="lead-probability">Probability (%)</Label>
              <Input
                id="lead-probability"
                inputMode="numeric"
                className="font-mono"
                value={form.probability}
                onChange={(event) => patch({ probability: event.target.value })}
                placeholder={String(CRM_STAGE_DEFAULT_PROBABILITY[form.stage])}
              />
              <p className="text-sm text-[var(--text-muted)]">
                Leave blank to use the {CRM_STAGE_LABELS[form.stage].toLowerCase()} default of{" "}
                {CRM_STAGE_DEFAULT_PROBABILITY[form.stage]}%.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Services</Label>
          <ServicesInput
            services={form.services}
            onChange={(services) => patch({ services })}
          />
        </div>
      </Section>

      <Section title="Contact">
        <div className="space-y-1.5">
          <SearchableSelect
            label="Client"
            value={form.clientId}
            options={clientOptions}
            placeholder={clientsQuery.isLoading ? "Loading clients…" : "Search clients"}
            searchPlaceholder="Search by name"
            onValueChange={(clientId) => {
              const client = clients.find((entry) => entry.id === clientId);
              patch({
                clientId,
                // Prefill from the client, but leave anything already
                // typed alone — the site contact often isn't the client.
                contactName: form.contactName || client?.contactName || "",
                contactEmail: form.contactEmail || client?.email || "",
                contactPhone: form.contactPhone || client?.phone || "",
              });
            }}
            onAddOption={(name) => createClient.mutate(name)}
            addLabel="Create client"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-contact-name">Contact name</Label>
            <Input
              id="lead-contact-name"
              value={form.contactName}
              onChange={(event) => patch({ contactName: event.target.value })}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-contact-email">Email</Label>
            <Input
              id="lead-contact-email"
              type="email"
              value={form.contactEmail}
              onChange={(event) => patch({ contactEmail: event.target.value })}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-contact-phone">Phone</Label>
            <Input
              id="lead-contact-phone"
              value={form.contactPhone}
              onChange={(event) => patch({ contactPhone: event.target.value })}
              maxLength={40}
            />
          </div>
        </div>
      </Section>

      <Section title="Attribution & ownership">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-source">Source</Label>
            <Input
              id="lead-source"
              list="crm-lead-source-options"
              value={form.source}
              onChange={(event) => {
                const value = event.target.value;
                const match = sources.find((source) => source.name === value);
                patch({
                  source: value,
                  sourceChannel: match?.channel ?? form.sourceChannel,
                });
              }}
              placeholder="e.g. Referral from Musa"
              maxLength={120}
            />
            <datalist id="crm-lead-source-options">
              {sources.map((source) => (
                <option key={source.id} value={source.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-channel">Channel</Label>
            <Select
              value={form.sourceChannel}
              onValueChange={(value) => patch({ sourceChannel: value })}
            >
              <SelectTrigger id="lead-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_LEAD_CHANNELS.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {CRM_CHANNEL_LABELS[channel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-owner">Owner</Label>
          <Select
            value={form.assignedToId || "__unassigned"}
            onValueChange={(value) =>
              patch({ assignedToId: value === "__unassigned" ? "" : value })
            }
          >
            <SelectTrigger id="lead-owner">
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
          <p className="text-sm text-[var(--text-muted)]">
            Unassigned leads are claimable by anyone on the team.
          </p>
        </div>
      </Section>
    </RecordDialog>
  );
}
