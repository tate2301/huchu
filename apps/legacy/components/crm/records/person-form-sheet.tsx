"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
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
  type CrmFieldDefinitionRecord,
} from "@/lib/crm/crm-v2";
import type { LeadFilterOwner } from "@/components/crm/leads/leads-filters";

import { CustomFieldInputs } from "./custom-field-inputs";
import { RecordMarkField } from "@corelithzw/module-records/components/record-mark-field";
import { DuplicateWarningDialog, type DuplicateEntry } from "./duplicate-warning-dialog";

const CONTACT_TYPES = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "DECISION_MAKER", label: "Decision-maker" },
  { value: "SITE_CONTACT", label: "Site contact" },
  { value: "FINANCE_CONTACT", label: "Finance contact" },
  { value: "SUPPLIER_CONTACT", label: "Supplier contact" },
  { value: "REFERRAL_PARTNER", label: "Referral partner" },
  { value: "OTHER", label: "Other" },
];

const CHANNELS = [
  { value: "PHONE", label: "Phone" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "IN_PERSON", label: "In person" },
];

type FormState = {
  emoji: string;
  accent: string;
  avatarUrl: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phone: string;
  contactType: string;
  preferredChannel: string;
  addressLine: string;
  city: string;
  notes: string;
  clientId: string;
  assignedToId: string;
};

const EMPTY: FormState = {
  emoji: "",
  accent: "",
  avatarUrl: "",
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phone: "",
  contactType: "CUSTOMER",
  preferredChannel: "",
  addressLine: "",
  city: "",
  notes: "",
  clientId: "",
  assignedToId: "",
};

/** The subset of a person this form can edit, as the detail page holds it. */
export type PersonFormRecord = { id: string } & Partial<FormState>;

/** Only the keys the form owns; anything else on the record is ignored. */
function seedFrom(record: PersonFormRecord): Partial<FormState> {
  const seed: Partial<FormState> = {};
  for (const key of Object.keys(EMPTY) as (keyof FormState)[]) {
    const value = record[key];
    if (value !== undefined && value !== null) seed[key] = value as never;
  }
  return seed;
}

export function PersonFormSheet({
  open,
  onOpenChange,
  defaultClientId,
  onCreated,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  onCreated?: (personId: string) => void;
  /** Pass a record to edit it. Omit to create a new one. */
  record?: PersonFormRecord | null;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(record?.id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateEntry[] | null>(null);

  // Reset as the sheet opens, adjusting state during render rather than in an
  // effect so there is no flash of the previous person's details.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(
        record
          ? { ...EMPTY, ...seedFrom(record) }
          : { ...EMPTY, clientId: defaultClientId ?? "" },
      );
      setCustomValues({});
      setErrors([]);
      setDuplicates(null);
    }
  }

  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "options"],
    queryFn: () => fetchCrmCompanies({ limit: 200 }),
    enabled: open,
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
    enabled: open,
  });

  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "PERSON"],
    queryFn: () => fetchCrmFieldDefinitions("PERSON"),
    enabled: open,
  });

  const companyOptions = useMemo<SearchableOption[]>(
    () =>
      (companiesQuery.data?.data ?? []).map((company) => ({
        value: company.id,
        label: company.name,
        description: company.city ?? undefined,
      })),
    [companiesQuery.data],
  );
  const owners = teamQuery.data?.data ?? [];
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];

  const buildBody = (force: boolean) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim() || null,
    jobTitle: form.jobTitle.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    contactType: form.contactType,
    preferredChannel: form.preferredChannel || null,
    addressLine: form.addressLine.trim() || null,
    city: form.city.trim() || null,
    notes: form.notes.trim() || null,
    clientId: form.clientId || null,
    assignedToId: form.assignedToId || null,
    emoji: form.emoji.trim() || null,
    accent: form.accent.trim() || null,
    avatarUrl: form.avatarUrl.trim() || null,
    customFields: customValues,
    force,
  });

  const save = useMutation({
    mutationFn: async (force: boolean) => {
      const response = await fetch(
        isEdit ? `/api/v2/crm/people/${record?.id}` : "/api/v2/crm/people",
        {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(force)),
        },
      );
      const payload = await response.json();
      if (response.status === 409 && payload?.code === "DUPLICATE_CANDIDATES") {
        return { kind: "duplicates" as const, duplicates: (payload.duplicates ?? []) as DuplicateEntry[] };
      }
      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to ${isEdit ? "save" : "create"} person`);
      }
      return { kind: "created" as const, record: payload as { id: string; fullName: string } };
    },
    onSuccess: (result) => {
      if (result.kind === "duplicates") {
        setDuplicates(result.duplicates);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["crm", "people"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["crm", "person", record?.id] });
      toast({
        title: isEdit ? "Person saved" : "Person created",
        description: result.record.fullName,
      });
      setDuplicates(null);
      onOpenChange(false);
      onSaved?.();
      if (!isEdit) onCreated?.(result.record.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!form.firstName.trim()) found.push("A first name is required.");
    if (form.email.trim() && !form.email.includes("@")) {
      found.push("That email doesn't look like an email address.");
    }
    return found;
  };

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  return (
    <>
      <RecordDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "Edit person" : "New person"}
        description="A contact you can attach to any number of deals and sites without re-typing them."
        errors={errors}
        onSubmit={(event) => {
          event.preventDefault();
          const found = validate();
          setErrors(found);
          if (found.length === 0) save.mutate(false);
        }}
        footer={<>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create person"}
          </Button>
        </>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-first">First name *</Label>
            <Input
              id="person-first"
              value={form.firstName}
              onChange={(event) => patch({ firstName: event.target.value })}
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-last">Last name</Label>
            <Input
              id="person-last"
              value={form.lastName}
              onChange={(event) => patch({ lastName: event.target.value })}
              maxLength={120}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-email">Email</Label>
            <Input
              id="person-email"
              type="email"
              value={form.email}
              onChange={(event) => patch({ email: event.target.value })}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-phone">Phone</Label>
            <Input
              id="person-phone"
              value={form.phone}
              onChange={(event) => patch({ phone: event.target.value })}
              maxLength={40}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <SearchableSelect
            label="Company"
            value={form.clientId}
            options={companyOptions}
            placeholder={companiesQuery.isLoading ? "Loading companies…" : "Search companies"}
            onValueChange={(clientId) => patch({ clientId })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-title">Job title</Label>
            <Input
              id="person-title"
              value={form.jobTitle}
              onChange={(event) => patch({ jobTitle: event.target.value })}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-type">Contact type</Label>
            <Select
              value={form.contactType}
              onValueChange={(value) => patch({ contactType: value })}
            >
              <SelectTrigger id="person-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-channel">Preferred channel</Label>
            <Select
              value={form.preferredChannel || "__none"}
              onValueChange={(value) =>
                patch({ preferredChannel: value === "__none" ? "" : value })
              }
            >
              <SelectTrigger id="person-channel">
                <SelectValue placeholder="No preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No preference</SelectItem>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-owner">Owner</Label>
            <Select
              value={form.assignedToId || "__unassigned"}
              onValueChange={(value) =>
                patch({ assignedToId: value === "__unassigned" ? "" : value })
              }
            >
              <SelectTrigger id="person-owner">
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="person-notes">Notes</Label>
          <Textarea
            id="person-notes"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            rows={3}
          />
        </div>

        <RecordMarkField

          kind="person"

          name={[form.firstName, form.lastName].filter(Boolean).join(" ")}

          emoji={form.emoji}

          accent={form.accent}

          avatarUrl={form.avatarUrl}

          onChange={(next) => setForm((previous) => ({ ...previous, ...next }))}

        />


        <CustomFieldInputs
          definitions={definitions}
          values={customValues}
          onChange={setCustomValues}
        />
      </RecordDialog>

      <DuplicateWarningDialog
        open={Boolean(duplicates)}
        onOpenChange={(next) => (!next ? setDuplicates(null) : undefined)}
        duplicates={duplicates ?? []}
        entityLabel="person"
        isPending={save.isPending}
        renderRecord={(record) => ({
          title: String(record.fullName ?? "Unnamed"),
          subtitle:
            [record.jobTitle, (record.client as { name?: string } | null)?.name, record.email]
              .filter(Boolean)
              .join(" · ") || null,
        })}
        onUseExisting={(id) => {
          setDuplicates(null);
          onOpenChange(false);
          router.push(`/crm/people/${id}`);
        }}
        onCreateAnyway={() => save.mutate(true)}
      />
    </>
  );
}
