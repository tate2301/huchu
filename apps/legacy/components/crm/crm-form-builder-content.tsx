"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { CRM_INTAKE_FIELD_TYPES, type CrmIntakeFieldType } from "@/lib/crm/intake-schema";

type FieldDraft = {
  key: string;
  label: string;
  type: CrmIntakeFieldType;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
};
type ServiceDraft = { id: string; label: string };

type FormRecord = {
  id: string;
  name: string;
  headline: string | null;
  publicToken: string;
  fields: FieldDraft[];
  services: ServiceDraft[];
};

export function CrmFormBuilderContent({ formId }: { formId: string }) {
  const form = useQuery({
    queryKey: ["crm-form", formId],
    queryFn: () => fetchJson<FormRecord>(`/api/v2/crm/intake-forms/${formId}`),
  });

  if (form.isLoading || !form.data) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;
  }

  // Keyed inner editor: local state is seeded from props via useState, so a
  // refetch for the same form never clobbers in-progress edits and there is no
  // setState-in-effect cascade.
  return <FormBuilderEditor key={form.data.id} formId={formId} initial={form.data} />;
}

function FormBuilderEditor({ formId, initial }: { formId: string; initial: FormRecord }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [fields, setFields] = useState<FieldDraft[]>(initial.fields ?? []);
  const [services, setServices] = useState<ServiceDraft[]>(initial.services ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = { data: initial };

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/intake-forms/${formId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, headline: headline || undefined, fields, services }),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["crm-form", formId] });
      setTimeout(() => setSaved(false), 1500);
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  function addField() {
    const n = fields.length + 1;
    setFields([...fields, { key: `field_${n}`, label: `Field ${n}`, type: "text", required: false }]);
  }
  function addService() {
    const n = services.length + 1;
    setServices([...services, { id: `service-${n}`, label: `Service ${n}` }]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/crm/forms" className="text-sm text-[var(--text-muted)] underline">
          ← All forms
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {saved ? <span className="text-sm text-green-600">Saved</span> : null}
          {form.data ? (
            <button
              className="text-sm text-[var(--text-muted)] underline"
              onClick={() =>
                navigator.clipboard?.writeText(`${window.location.origin}/f/${form.data?.publicToken}`)
              }
            >
              Copy public link
            </button>
          ) : null}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="f-name">Name</Label>
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-headline">Headline (shown to the client)</Label>
            <Input id="f-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Services offered</CardTitle>
          <Button size="sm" variant="outline" onClick={addService}>
            Add service
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.map((service, index) => (
            <div key={index} className="grid grid-cols-6 gap-2 sm:grid-cols-12">
              <Input
                className="col-span-2 sm:col-span-4"
                value={service.id}
                onChange={(e) => {
                  const next = [...services];
                  next[index] = { ...service, id: e.target.value };
                  setServices(next);
                }}
              />
              <Input
                className="col-span-3 sm:col-span-7"
                value={service.label}
                onChange={(e) => {
                  const next = [...services];
                  next[index] = { ...service, label: e.target.value };
                  setServices(next);
                }}
              />
              <Button
                className="col-span-1"
                variant="ghost"
                size="sm"
                onClick={() => setServices(services.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Custom fields</CardTitle>
          <Button size="sm" variant="outline" onClick={addField}>
            Add field
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, index) => (
            <div key={index} className="grid grid-cols-6 items-center gap-2 sm:grid-cols-12">
              <Input
                className="col-span-3 sm:col-span-3"
                placeholder="key"
                value={field.key}
                onChange={(e) => {
                  const next = [...fields];
                  next[index] = { ...field, key: e.target.value };
                  setFields(next);
                }}
              />
              <Input
                className="col-span-3 sm:col-span-4"
                placeholder="Label"
                value={field.label}
                onChange={(e) => {
                  const next = [...fields];
                  next[index] = { ...field, label: e.target.value };
                  setFields(next);
                }}
              />
              <Select
                value={field.type}
                onValueChange={(value) => {
                  const next = [...fields];
                  next[index] = { ...field, type: value as CrmIntakeFieldType };
                  setFields(next);
                }}
              >
                <SelectTrigger className="col-span-3 sm:col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRM_INTAKE_FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="col-span-2 flex items-center gap-1 text-sm sm:col-span-1">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => {
                    const next = [...fields];
                    next[index] = { ...field, required: e.target.checked };
                    setFields(next);
                  }}
                />
                req
              </label>
              <Button
                className="col-span-1 justify-self-end sm:justify-self-auto"
                variant="ghost"
                size="sm"
                onClick={() => setFields(fields.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
          ))}
          <p className="text-sm text-[var(--text-muted)]">
            Name, email, phone (with country code), and photos are always included.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
