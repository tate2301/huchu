"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus, Trash2 } from "@/lib/icons";
import { fetchCrmFieldDefinitions, type CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import {
  CRM_FIELD_ENTITIES,
  CRM_FIELD_ENTITY_LABELS,
  CRM_FIELD_TYPE_LABELS,
  CRM_FIELD_TYPES,
  normalizeFieldKey,
} from "@/lib/crm/custom-fields";
import type { CrmFieldEntity, CrmFieldType } from "@prisma/client";

import { Stack } from "@corelithzw/react";

type OptionDraft = { value: string; label: string };

const SELECT_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"]);

export function CustomFieldsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [entity, setEntity] = useState<CrmFieldEntity>("DEAL");
  const [createOpen, setCreateOpen] = useState(false);

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CrmFieldType>("SHORT_TEXT");
  const [section, setSection] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [showInTable, setShowInTable] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([{ value: "", label: "" }]);
  const [errors, setErrors] = useState<string[]>([]);

  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", entity],
    queryFn: () => fetchCrmFieldDefinitions(entity),
  });

  const definitions: CrmFieldDefinitionRecord[] = useMemo(
    () => fieldsQuery.data?.data ?? [],
    [fieldsQuery.data],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CrmFieldDefinitionRecord[]>();
    for (const definition of [...definitions].sort((a, b) => a.position - b.position)) {
      const key = definition.section?.trim() || "Additional details";
      const bucket = map.get(key);
      if (bucket) bucket.push(definition);
      else map.set(key, [definition]);
    }
    return Array.from(map.entries());
  }, [definitions]);

  const reset = () => {
    setLabel("");
    setDescription("");
    setType("SHORT_TEXT");
    setSection("");
    setIsRequired(false);
    setShowInTable(false);
    setOptions([{ value: "", label: "" }]);
    setErrors([]);
  };

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/field-definitions", {
        method: "POST",
        body: JSON.stringify({
          entity,
          label: label.trim(),
          description: description.trim() || null,
          type,
          isRequired,
          showInTable,
          section: section.trim() || null,
          options: SELECT_TYPES.has(type)
            ? options
                .filter((option) => option.label.trim())
                .map((option) => ({
                  // An unset value follows the label, so an admin only has to
                  // type the thing users will read.
                  value: option.value.trim() || normalizeFieldKey(option.label),
                  label: option.label.trim(),
                }))
            : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "field-definitions"] });
      setCreateOpen(false);
      reset();
      toast({ title: "Field added", description: "It appears on the form straight away." });
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const archive = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/field-definitions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "field-definitions"] });
      toast({
        title: "Field archived",
        description: "Existing values are kept, but it no longer appears on forms.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not archive the field",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    if (!label.trim()) found.push("Give the field a label.");
    if (SELECT_TYPES.has(type) && options.every((option) => !option.label.trim())) {
      found.push("A select field needs at least one choice.");
    }
    return found;
  };

  return (
    <Card>
      {/* The settings shell already names this section and describes it; see
          the note in `pipelines-panel.tsx`. */}
      <CardHeader className="flex flex-row items-center justify-end gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New field
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <SegmentedControl
          value={entity}
          onValueChange={(value) => setEntity(value as CrmFieldEntity)}
          size="sm"
          ariaLabel="Record type"
          options={CRM_FIELD_ENTITIES.map((value) => ({
            value,
            label: CRM_FIELD_ENTITY_LABELS[value],
          }))}
        />

        {fieldsQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : definitions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            No custom fields on {CRM_FIELD_ENTITY_LABELS[entity].toLowerCase()} yet. The built-in
            fields cover most businesses — add one when yours needs something they don&apos;t.
          </p>
        ) : (
          grouped.map(([sectionName, fields]) => (
            <section key={sectionName} className="space-y-1.5">
              <h4 className="text-sm font-semibold text-[var(--text-muted)]">
                {sectionName}
              </h4>
              <Stack as="ul" gap="xs">
                {fields.map((definition) => (
                  <li key={definition.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{definition.label}</span>
                        <Badge variant="outline" className="text-sm">
                          {CRM_FIELD_TYPE_LABELS[definition.type as CrmFieldType] ??
                            definition.type}
                        </Badge>
                        {definition.isRequired ? (
                          <Badge variant="secondary" className="text-sm">
                            Required
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-sm text-[var(--text-muted)]">
                        {definition.key}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      aria-label={`Archive ${definition.label}`}
                      onClick={() => archive.mutate(definition.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </Stack>
            </section>
          ))
        )}
      </CardContent>

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              New field on {CRM_FIELD_ENTITY_LABELS[entity].toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              The label is what people see. Its internal key is derived from the label and
              can&apos;t change afterwards.
            </DialogDescription>
          </DialogHeader>

          {errors.length > 0 ? (
            <ul className="list-disc space-y-1 rounded-[var(--card-radius)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 pl-6 text-sm text-[var(--status-error-text)]">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="field-label">Label *</Label>
              <Input
                id="field-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Roof area"
                maxLength={120}
                autoFocus
              />
              {label.trim() ? (
                <p className="font-mono text-sm text-[var(--text-muted)]">
                  key: {normalizeFieldKey(label)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="field-type">Type</Label>
                <Select value={type} onValueChange={(value) => setType(value as CrmFieldType)}>
                  <SelectTrigger id="field-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CRM_FIELD_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CRM_FIELD_TYPE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="field-section">Section</Label>
                <Input
                  id="field-section"
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                  placeholder="e.g. Qualification"
                  maxLength={80}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="field-description">Help text</Label>
              <Input
                id="field-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Shown under the field on the form"
                maxLength={500}
              />
            </div>

            {SELECT_TYPES.has(type) ? (
              <div className="space-y-2">
                <Label>Choices</Label>
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option.label}
                      onChange={(event) =>
                        setOptions((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder={`Choice ${index + 1}`}
                      maxLength={120}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 px-0"
                      aria-label={`Remove choice ${index + 1}`}
                      disabled={options.length === 1}
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setOptions((prev) => [...prev, { value: "", label: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add choice
                </Button>
              </div>
            ) : null}

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={isRequired}
                onCheckedChange={(checked) => setIsRequired(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Required
                <span className="block text-[var(--text-muted)]">
                  The record can&apos;t be saved without it.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={showInTable}
                onCheckedChange={(checked) => setShowInTable(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Offer as a table column
                <span className="block text-[var(--text-muted)]">
                  Available to add to list views.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const found = validate();
                setErrors(found);
                if (found.length === 0) create.mutate();
              }}
              disabled={create.isPending}
            >
              {create.isPending ? "Adding…" : "Add field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
