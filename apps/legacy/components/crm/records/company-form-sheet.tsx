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
import { RecordDialog } from "@/components/crm/records/record-dialog";
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

const COMPANY_TYPES = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "SUPPLIER", label: "Supplier" },
  { value: "PARTNER", label: "Partner" },
  { value: "OTHER", label: "Other" },
];

const ACCOUNT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "BLACKLISTED", label: "Blacklisted" },
];

const PARENT_RELATIONS = [
  { value: "HEAD_OFFICE", label: "Head office" },
  { value: "BRANCH", label: "Branch" },
  { value: "SUBSIDIARY", label: "Subsidiary" },
  { value: "DEPARTMENT", label: "Department" },
];

type FormState = {
  emoji: string;
  accent: string;
  avatarUrl: string;
  name: string;
  tradingName: string;
  companyType: string;
  registrationNumber: string;
  taxNumber: string;
  website: string;
  industry: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  billingAddress: string;
  accountStatus: string;
  parentClientId: string;
  parentRelation: string;
  notes: string;
  assignedToId: string;
};

const EMPTY: FormState = {
  emoji: "",
  accent: "",
  avatarUrl: "",
  name: "",
  tradingName: "",
  companyType: "CUSTOMER",
  registrationNumber: "",
  taxNumber: "",
  website: "",
  industry: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  country: "",
  billingAddress: "",
  accountStatus: "ACTIVE",
  parentClientId: "",
  parentRelation: "",
  notes: "",
  assignedToId: "",
};

/** Only the keys the form owns; anything else on the record is ignored. */
function seedFrom(record: CompanyFormRecord): Partial<FormState> {
  const seed: Partial<FormState> = {};
  for (const key of Object.keys(EMPTY) as (keyof FormState)[]) {
    const value = record[key];
    if (value !== undefined && value !== null) seed[key] = value as never;
  }
  return seed;
}

type SaveResult =
  | { duplicates: DuplicateEntry[] }
  | { company: { id: string; name: string } };

/** The subset of a company this form can edit, as the detail page holds it. */
export type CompanyFormRecord = { id: string } & Partial<FormState>;

export function CompanyFormSheet({
  open,
  onOpenChange,
  onCreated,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (companyId: string) => void;
  /** Pass a record to edit it. Omit to create a new one. */
  record?: CompanyFormRecord | null;
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
  // effect so there is no flash of the previous record's details.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(record ? { ...EMPTY, ...seedFrom(record) } : EMPTY);
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
    queryKey: ["crm", "field-definitions", "COMPANY"],
    queryFn: () => fetchCrmFieldDefinitions("COMPANY"),
    enabled: open,
  });

  const parentOptions = useMemo<SearchableOption[]>(
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
    name: form.name.trim(),
    tradingName: form.tradingName.trim() || null,
    companyType: form.companyType,
    registrationNumber: form.registrationNumber.trim() || null,
    taxNumber: form.taxNumber.trim() || null,
    website: form.website.trim() || null,
    industry: form.industry.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    addressLine: form.addressLine.trim() || null,
    city: form.city.trim() || null,
    country: form.country.trim() || null,
    billingAddress: form.billingAddress.trim() || null,
    accountStatus: form.accountStatus,
    parentClientId: form.parentClientId || null,
    // The relation only means anything alongside a parent, so drop it if the
    // parent was cleared after being picked.
    parentRelation: form.parentClientId ? form.parentRelation || null : null,
    notes: form.notes.trim() || null,
    assignedToId: form.assignedToId || null,
    emoji: form.emoji.trim() || null,
    accent: form.accent.trim() || null,
    avatarUrl: form.avatarUrl.trim() || null,
    customFields: customValues,
    force,
  });

  const save = useMutation({
    mutationFn: async (force: boolean): Promise<SaveResult> => {
      const response = await fetch(
        isEdit ? `/api/v2/crm/companies/${record?.id}` : "/api/v2/crm/companies",
        {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(force)),
        },
      );
      const payload = await response.json();
      if (response.status === 409 && payload?.code === "DUPLICATE_CANDIDATES") {
        return { duplicates: (payload.duplicates ?? []) as DuplicateEntry[] };
      }
      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to ${isEdit ? "save" : "create"} company`);
      }
      return { company: payload as { id: string; name: string } };
    },
    onSuccess: (result) => {
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["crm", "companies"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["crm", "company", record?.id] });
      toast({
        title: isEdit ? "Company saved" : "Company created",
        description: result.company.name,
      });
      setDuplicates(null);
      onOpenChange(false);
      onSaved?.();
      if (!isEdit) onCreated?.(result.company.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!form.name.trim()) found.push("A company name is required.");
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
        title={isEdit ? "Edit company" : "New company"}
        description="The account everything else hangs off — people, sites, deals and invoices."
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
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create company"}
          </Button>
        </>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Registered name *</Label>
            <Input
              id="company-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-trading">Trading as</Label>
            <Input
              id="company-trading"
              value={form.tradingName}
              onChange={(event) => patch({ tradingName: event.target.value })}
              placeholder="Only if it differs from the registered name"
              maxLength={200}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-type">Relationship</Label>
            <Select
              value={form.companyType}
              onValueChange={(companyType) => patch({ companyType })}
            >
              <SelectTrigger id="company-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-status">Account status</Label>
            <Select
              value={form.accountStatus}
              onValueChange={(accountStatus) => patch({ accountStatus })}
            >
              <SelectTrigger id="company-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-reg">Company registration number</Label>
            <Input
              id="company-reg"
              value={form.registrationNumber}
              onChange={(event) => patch({ registrationNumber: event.target.value })}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-tax">Tax number</Label>
            <Input
              id="company-tax"
              value={form.taxNumber}
              onChange={(event) => patch({ taxNumber: event.target.value })}
              maxLength={80}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-website">Website</Label>
            <Input
              id="company-website"
              value={form.website}
              onChange={(event) => patch({ website: event.target.value })}
              placeholder="example.co.zw"
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-industry">Industry</Label>
            <Input
              id="company-industry"
              value={form.industry}
              onChange={(event) => patch({ industry: event.target.value })}
              placeholder="e.g. Mining, Retail, Logistics"
              maxLength={120}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-email">Main email</Label>
            <Input
              id="company-email"
              type="email"
              value={form.email}
              onChange={(event) => patch({ email: event.target.value })}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-phone">Main phone</Label>
            <Input
              id="company-phone"
              value={form.phone}
              onChange={(event) => patch({ phone: event.target.value })}
              maxLength={40}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-address">Street address</Label>
          <Input
            id="company-address"
            value={form.addressLine}
            onChange={(event) => patch({ addressLine: event.target.value })}
            maxLength={300}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-city">City</Label>
            <Input
              id="company-city"
              value={form.city}
              onChange={(event) => patch({ city: event.target.value })}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-country">Country</Label>
            <Input
              id="company-country"
              value={form.country}
              onChange={(event) => patch({ country: event.target.value })}
              maxLength={120}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-billing">Billing address</Label>
          <Textarea
            id="company-billing"
            value={form.billingAddress}
            onChange={(event) => patch({ billingAddress: event.target.value })}
            placeholder="Leave blank if invoices go to the street address above"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <SearchableSelect
            label="Part of a larger group?"
            value={form.parentClientId}
            options={parentOptions}
            placeholder={
              companiesQuery.isLoading ? "Loading companies…" : "Search for the parent company"
            }
            onValueChange={(parentClientId) => patch({ parentClientId })}
          />
        </div>

        {form.parentClientId ? (
          <div className="space-y-1.5">
            <Label htmlFor="company-relation">This company is the parent&apos;s…</Label>
            <Select
              value={form.parentRelation || "__none"}
              onValueChange={(value) =>
                patch({ parentRelation: value === "__none" ? "" : value })
              }
            >
              <SelectTrigger id="company-relation">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not specified</SelectItem>
                {PARENT_RELATIONS.map((relation) => (
                  <SelectItem key={relation.value} value={relation.value}>
                    {relation.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="company-owner">Owner</Label>
          <Select
            value={form.assignedToId || "__unassigned"}
            onValueChange={(value) =>
              patch({ assignedToId: value === "__unassigned" ? "" : value })
            }
          >
            <SelectTrigger id="company-owner">
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

        <div className="space-y-1.5">
          <Label htmlFor="company-notes">Notes</Label>
          <Textarea
            id="company-notes"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            rows={3}
          />
        </div>

        <RecordMarkField

          kind="company"

          name={form.name}

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
        entityLabel="company"
        isPending={save.isPending}
        renderRecord={(record) => ({
          title: String(record.name ?? "Unnamed"),
          subtitle:
            [record.city, record.registrationNumber, record.website].filter(Boolean).join(" · ") ||
            null,
        })}
        onUseExisting={(id) => {
          setDuplicates(null);
          onOpenChange(false);
          router.push(`/crm/companies/${id}`);
        }}
        onCreateAnyway={() => save.mutate(true)}
      />
    </>
  );
}
