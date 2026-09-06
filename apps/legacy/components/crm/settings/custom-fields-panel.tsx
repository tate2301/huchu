"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ReportTable, node, txt, type ReportRow } from "@/components/accounting/report-table";
import { Button } from "@corelithzw/ui/components/button";
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
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Check, ChevronDown, Plus, Trash2 } from "@corelithzw/ui/lib/icons";
import { fetchCrmFieldDefinitions, type CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import {
  CRM_FIELD_ENTITY_LABELS,
  CRM_FIELD_TYPE_LABELS,
  CRM_FIELD_TYPES,
  normalizeFieldKey,
} from "@corelithzw/module-records/custom-fields";
import type { CrmFieldEntity, CrmFieldType } from "@corelithzw/db";
import { cn } from "@corelithzw/ui/lib/utils";

import { SetupPanel } from "./setup-chrome";

type OptionDraft = { value: string; label: string };

const SELECT_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"]);

/**
 * The CRM record types, in the order the artboard draws them.
 *
 * `CRM_FIELD_ENTITIES` also carries the six school entities — Student,
 * Guardian, Teacher, Class, Subject, Hostel. Those are configured in the
 * schools module against the records they belong to, and listing them here
 * would put twelve segments in a strip on a page about the CRM.
 */
const CRM_RECORD_ENTITIES = [
  "DEAL",
  "LEAD",
  "PERSON",
  "COMPANY",
  "SITE",
  "WORK_ORDER",
] as const satisfies ReadonlyArray<CrmFieldEntity>;

/** Where a field with no section of its own is filed. */
const DEFAULT_SECTION = "Additional details";

/** What the preview puts in an empty field, so a type reads as itself. */
const TYPE_PLACEHOLDER: Partial<Record<CrmFieldType, string>> = {
  CURRENCY: "0.00",
  NUMBER: "0",
  PERCENT: "0%",
  DATE: "dd/mm/yyyy",
  CHECKBOX: "No",
  EMAIL: "name@example.com",
  PHONE: "+263 …",
  URL: "https://",
};

export function CustomFieldsPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [entity, setEntity] = useState<CrmFieldEntity>("DEAL");

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CrmFieldType>("SHORT_TEXT");
  const [section, setSection] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [showInTable, setShowInTable] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([{ value: "", label: "" }]);
  const [errors, setErrors] = useState<string[]>([]);

  /*
    Every entity's fields, not just the open one.

    The strip carries a count per record type, which is the reason to draw it as
    a strip rather than a dropdown: you can see that Deal has eight and Work
    order has three without visiting either. Six requests to render six numbers
    would be worse than one that returns a few dozen rows.
  */
  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions"],
    queryFn: () => fetchCrmFieldDefinitions(),
  });

  const all: CrmFieldDefinitionRecord[] = useMemo(
    () => fieldsQuery.data?.data ?? [],
    [fieldsQuery.data],
  );

  const countFor = (value: CrmFieldEntity) =>
    all.filter((definition) => definition.entity === value).length;

  const definitions = useMemo(
    () =>
      all
        .filter((definition) => definition.entity === entity)
        .sort((a, b) => a.position - b.position),
    [all, entity],
  );

  /** The sections, in the order the record page will draw them. */
  const grouped = useMemo(() => {
    const map = new Map<string, CrmFieldDefinitionRecord[]>();
    for (const definition of definitions) {
      const key = definition.section?.trim() || DEFAULT_SECTION;
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
      queryClient.invalidateQueries({ queryKey: ["crm-setup-counts"] });
      onCreateOpenChange(false);
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
      queryClient.invalidateQueries({ queryKey: ["crm-setup-counts"] });
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

  /** The ticked / unticked box the Required and In-table columns are drawn as. */
  const tick = (on: boolean, description: string) =>
    node(
      <span className="flex justify-center">
        <span
          role="img"
          aria-label={description}
          className={cn(
            "flex size-3.5 items-center justify-center rounded-[3px] border-[1.5px]",
            on
              ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)]"
              : "border-[var(--border-strong)] bg-[var(--surface-base)]",
          )}
        >
          {on ? <Check aria-hidden="true" className="size-2.5 text-[var(--on-brand)]" /> : null}
        </span>
      </span>,
    );

  const rowsFor = (fields: CrmFieldDefinitionRecord[]): ReportRow[] =>
    fields.map((definition) => ({
      id: definition.id,
      cells: [
        node(
          <span className="block min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
              {definition.label}
            </span>
            {/* The key is what the value is stored under and cannot change
                afterwards, so it belongs beside the label rather than behind
                an edit dialog. */}
            <span className="acct-rail-sub block truncate">{definition.key}</span>
          </span>,
        ),
        txt(CRM_FIELD_TYPE_LABELS[definition.type as CrmFieldType] ?? definition.type, {
          tone: "subtle",
        }),
        tick(definition.isRequired, definition.isRequired ? "Required" : "Optional"),
        tick(
          definition.showInTable,
          definition.showInTable ? "Offered as a column" : "Not offered as a column",
        ),
        node(
          <Button
            size="sm"
            variant="ghost"
            className="size-6 px-0"
            aria-label={`Archive ${definition.label}`}
            onClick={() => archive.mutate(definition.id)}
          >
            <Trash2 aria-hidden="true" className="size-3.5 text-[var(--text-subtle)]" />
          </Button>,
          { align: "right" },
        ),
      ],
    }));

  const tracks = "minmax(0,1fr) 150px 78px 78px 34px";
  const columns = [
    { label: "Field" },
    { label: "Type" },
    { label: "Required" },
    { label: "In table" },
    { label: "" },
  ];

  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="acct-caption">Fields on</span>
        <SegmentedControl
          value={entity}
          onValueChange={(value) => setEntity(value as CrmFieldEntity)}
          size="sm"
          ariaLabel="Record type"
          options={CRM_RECORD_ENTITIES.map((value) => ({
            value,
            label: CRM_FIELD_ENTITY_LABELS[value],
            count: countFor(value),
          }))}
        />
        <span className="acct-caption ml-auto hidden lg:inline">
          values live in a <code className="font-mono text-[var(--text-muted)]">customFields</code>{" "}
          column on the record
        </span>
      </div>

      {fieldsQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="grid min-w-0 gap-2.5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-2.5">
            {grouped.length === 0 ? (
              <SetupPanel title={DEFAULT_SECTION}>
                <p className="text-sm text-[var(--text-muted)]">
                  No custom fields on {CRM_FIELD_ENTITY_LABELS[entity].toLowerCase()} yet. The
                  built-in fields cover most businesses — add one when yours needs something they
                  don&apos;t.
                </p>
              </SetupPanel>
            ) : (
              grouped.map(([sectionName, fields]) => (
                <SetupPanel
                  key={sectionName}
                  title={sectionName}
                  hint="section on the record page"
                  flush
                >
                  <ReportTable
                    label={`${sectionName} fields`}
                    tracks={tracks}
                    columns={columns}
                    rows={rowsFor(fields)}
                  />
                </SetupPanel>
              ))
            )}
          </div>

          {/*
            What the reader is actually deciding.

            A field is a row in a table here and a labelled control on a record
            there, and the gap between those two pictures is where "should this
            be required" gets answered wrong. Drawing the form beside the table
            closes it: the sections become headings, the order becomes the
            order, and a required field shows its asterisk before anybody has to
            save a record to find out.
          */}
          <SetupPanel title="How it lands on the record" className="xl:sticky xl:top-3">
            {grouped.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">Nothing to preview yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {grouped.map(([sectionName, fields]) => (
                  <div key={sectionName}>
                    <p className="acct-rail-heading pt-1">{sectionName}</p>
                    {fields.map((definition) => (
                      <div key={definition.id} className="mt-2">
                        <span className="mb-1 flex items-baseline gap-1">
                          <span className="text-sm font-semibold text-[var(--text-muted)]">
                            {definition.label}
                          </span>
                          {definition.isRequired ? (
                            <span
                              aria-label="Required"
                              className="text-sm text-[var(--status-error-text)]"
                            >
                              *
                            </span>
                          ) : null}
                        </span>
                        <span className="flex h-[30px] items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-base)] px-2.5">
                          <span className="truncate text-sm text-[var(--text-disabled)]">
                            {TYPE_PLACEHOLDER[definition.type as CrmFieldType] ?? ""}
                          </span>
                          {SELECT_TYPES.has(definition.type) ? (
                            <ChevronDown
                              aria-hidden="true"
                              className="size-3.5 shrink-0 text-[var(--text-subtle)]"
                            />
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Deliberately not supported: formula fields, rollups and custom code. Those turn a CRM
              into a programming environment.
            </p>
          </SetupPanel>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          onCreateOpenChange(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New field on {CRM_FIELD_ENTITY_LABELS[entity].toLowerCase()}</DialogTitle>
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
            <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
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
    </div>
  );
}
