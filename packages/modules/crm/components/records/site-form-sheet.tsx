"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { SearchableSelect, type SearchableOption } from "@corelithzw/ui/components/searchable-select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchCrmCompanies,
  fetchCrmFieldDefinitions,
  fetchCrmPeople,
  type CrmFieldDefinitionRecord,
} from "../../crm-v2";

import { CustomFieldInputs } from "./custom-field-inputs";
import { RecordMarkField } from "@corelithzw/module-records/components/record-mark-field";

type FormState = {
  emoji: string;
  accent: string;
  avatarUrl: string;
  name: string;
  clientId: string;
  addressLine: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  primaryContactId: string;
  accessInstructions: string;
  siteConditions: string;
  notes: string;
};

const EMPTY: FormState = {
  emoji: "",
  accent: "",
  avatarUrl: "",
  name: "",
  clientId: "",
  addressLine: "",
  city: "",
  country: "",
  latitude: "",
  longitude: "",
  primaryContactId: "",
  accessInstructions: "",
  siteConditions: "",
  notes: "",
};

/** The subset of a site this form can edit, as the detail page holds it. */
export type SiteFormRecord = { id: string } & Partial<FormState>;

/** Only the keys the form owns; anything else on the record is ignored. */
function seedFrom(record: SiteFormRecord): Partial<FormState> {
  const seed: Partial<FormState> = {};
  for (const key of Object.keys(EMPTY) as (keyof FormState)[]) {
    const value = record[key];
    if (value !== undefined && value !== null) seed[key] = value as never;
  }
  return seed;
}

export function SiteFormSheet({
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
  onCreated?: (siteId: string) => void;
  /** Pass a record to edit it. Omit to create a new one. */
  record?: SiteFormRecord | null;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(record?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);

  // Reset as the sheet opens, adjusting state during render rather than in an
  // effect so there is no flash of the previous record's details.
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
    }
  }

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

  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "SITE"],
    queryFn: () => fetchCrmFieldDefinitions("SITE"),
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
  const personOptions = useMemo<SearchableOption[]>(
    () =>
      (peopleQuery.data?.data ?? []).map((person) => ({
        value: person.id,
        label: person.fullName,
        description: person.jobTitle ?? person.phone ?? undefined,
      })),
    [peopleQuery.data],
  );
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];

  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string; name: string }>(
        isEdit ? `/api/v2/crm/sites/${record?.id}` : "/api/v2/crm/sites",
        {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          clientId: form.clientId || null,
          addressLine: form.addressLine.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          latitude: form.latitude.trim() ? Number(form.latitude) : null,
          longitude: form.longitude.trim() ? Number(form.longitude) : null,
          primaryContactId: form.primaryContactId || null,
          accessInstructions: form.accessInstructions.trim() || null,
          siteConditions: form.siteConditions.trim() || null,
          notes: form.notes.trim() || null,
          emoji: form.emoji.trim() || null,
          accent: form.accent.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          customFields: customValues,
        }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "sites"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["crm", "site", record?.id] });
      toast({ title: isEdit ? "Site saved" : "Site created", description: result.name });
      onOpenChange(false);
      onSaved?.();
      if (!isEdit) onCreated?.(result.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!form.name.trim()) found.push("Give the site a name.");
    if (form.latitude.trim()) {
      const latitude = Number(form.latitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        found.push("Latitude has to be a number between -90 and 90.");
      }
    }
    if (form.longitude.trim()) {
      const longitude = Number(form.longitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        found.push("Longitude has to be a number between -180 and 180.");
      }
    }
    return found;
  };

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit site" : "New site"}
      description="A place your crew actually goes to. Whatever you record here is what they&apos;ll read on the way there."
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
          {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create site"}
        </Button>
      </>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="site-name">Site name *</Label>
        <Input
          id="site-name"
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="e.g. Msasa depot — back yard"
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
            // Contacts are drawn from the chosen company, so switching it
            // invalidates whoever was picked under the old one.
            patch({ clientId, primaryContactId: "" })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="site-address">Street address</Label>
        <Input
          id="site-address"
          value={form.addressLine}
          onChange={(event) => patch({ addressLine: event.target.value })}
          maxLength={300}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="site-city">City</Label>
          <Input
            id="site-city"
            value={form.city}
            onChange={(event) => patch({ city: event.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-country">Country</Label>
          <Input
            id="site-country"
            value={form.country}
            onChange={(event) => patch({ country: event.target.value })}
            maxLength={120}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="site-latitude">Latitude</Label>
          <Input
            id="site-latitude"
            inputMode="decimal"
            className="font-mono"
            value={form.latitude}
            onChange={(event) => patch({ latitude: event.target.value })}
            placeholder="-17.8252"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-longitude">Longitude</Label>
          <Input
            id="site-longitude"
            inputMode="decimal"
            className="font-mono"
            value={form.longitude}
            onChange={(event) => patch({ longitude: event.target.value })}
            placeholder="31.0335"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <SearchableSelect
          label="Contact on site"
          value={form.primaryContactId}
          options={personOptions}
          placeholder={peopleQuery.isLoading ? "Loading people…" : "Search people"}
          onValueChange={(primaryContactId) => patch({ primaryContactId })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="site-access">Getting in</Label>
        <Textarea
          id="site-access"
          value={form.accessInstructions}
          onChange={(event) => patch({ accessInstructions: event.target.value })}
          placeholder="Which gate, who to ask for, where the keys live, what hours it's open."
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="site-conditions">What it&apos;s like on the ground</Label>
        <Textarea
          id="site-conditions"
          value={form.siteConditions}
          onChange={(event) => patch({ siteConditions: event.target.value })}
          placeholder="Terrain, power, safety gear needed, anything that changes how long the job takes."
          rows={3}
          maxLength={4000}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="site-notes">Notes</Label>
        <Textarea
          id="site-notes"
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
        />
      </div>

      <RecordMarkField

        kind="site"

        name={form.name}

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
