"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Card } from "@corelithzw/react";
import type { CrmFieldType } from "@prisma/client";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  CRM_FIELD_ENTITY_LABELS,
  CRM_FIELD_TYPE_LABELS,
  CRM_FIELD_TYPES,
  normalizeFieldKey,
} from "@/lib/crm/custom-fields";
import { SCHOOL_RECORD_TYPES, type SchoolRecordType } from "@/lib/records/registry";

/**
 * The extra questions a school asks about its own records.
 *
 * The engine is the CRM's — definitions in `CrmFieldDefinition`, values in a
 * `customFields` JSON column, every rule about keys and types in
 * `lib/crm/custom-fields.ts`. What the school gets is its own door onto it,
 * gated on `schools.students` / `configure`: adding a field changes what every
 * record of that type is asked for, so it is an administrator's act and not a
 * registrar's daily work.
 *
 * The key is derived from the label and immutable afterwards, which is why a
 * field can be relabelled and never re-keyed: the key is what every value
 * already stored is filed under.
 */

type FieldDefinitionRecord = {
  id: string;
  entity: SchoolRecordType;
  key: string;
  label: string;
  description: string | null;
  type: CrmFieldType;
  isRequired: boolean;
  showInTable: boolean;
  section: string | null;
  position: number;
  archivedAt: string | null;
};

type FieldFormValues = {
  entity: SchoolRecordType;
  label: string;
  description: string;
  type: CrmFieldType;
  section: string;
  isRequired: boolean;
  showInTable: boolean;
};

// The reference types point at CRM records — a person, a company, a site — and
// none of them means anything on a pupil. Left off the list rather than offered
// and refused.
const OFFERED_TYPES = CRM_FIELD_TYPES.filter(
  (type) => !["USER", "PERSON", "COMPANY", "SITE"].includes(type),
);

const EMPTY: FieldFormValues = {
  entity: "STUDENT",
  label: "",
  description: "",
  type: "SHORT_TEXT",
  section: "",
  isRequired: false,
  showInTable: false,
};

export function SchoolCustomFieldsPanel() {
  const queryClient = useQueryClient();
  const [entityFilter, setEntityFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FieldDefinitionRecord | null>(null);
  const [values, setValues] = useState<FieldFormValues>(EMPTY);

  const fieldsQuery = useQuery({
    queryKey: ["schools", "field-definitions"],
    queryFn: () =>
      fetchJson<{ data: FieldDefinitionRecord[] }>("/api/v2/schools/field-definitions"),
  });

  const definitions = useMemo(
    () => fieldsQuery.data?.data ?? [],
    [fieldsQuery.data],
  );

  const visible = useMemo(
    () =>
      entityFilter
        ? definitions.filter((row) => row.entity === entityFilter)
        : definitions,
    [definitions, entityFilter],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "field-definitions"] });
  }

  const save = useMutation({
    mutationFn: (input: FieldFormValues) =>
      editing
        ? fetchJson(`/api/v2/schools/field-definitions/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              label: input.label.trim(),
              description: input.description.trim() || null,
              section: input.section.trim() || null,
              isRequired: input.isRequired,
              showInTable: input.showInTable,
            }),
          })
        : fetchJson("/api/v2/schools/field-definitions", {
            method: "POST",
            body: JSON.stringify({
              entity: input.entity,
              label: input.label.trim(),
              description: input.description.trim() || null,
              type: input.type,
              section: input.section.trim() || null,
              isRequired: input.isRequired,
              showInTable: input.showInTable,
            }),
          }),
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/field-definitions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditing(null);
    setValues({
      ...EMPTY,
      entity: (entityFilter as SchoolRecordType) || "STUDENT",
    });
    setDialogOpen(true);
  };

  const openEdit = (row: FieldDefinitionRecord) => {
    setEditing(row);
    setValues({
      entity: row.entity,
      label: row.label,
      description: row.description ?? "",
      type: row.type,
      section: row.section ?? "",
      isRequired: row.isRequired,
      showInTable: row.showInTable,
    });
    setDialogOpen(true);
  };

  const derivedKey = normalizeFieldKey(values.label);
  const canSubmit = values.label.trim().length > 0 && derivedKey.length > 0;

  return (
    <Card
      title="Extra fields"
      subtitle="The questions this school asks about a record that the system does not ask everybody."
      actions={
        <CreateButton
          resource="schools.students"
          action="configure"
          label="New field"
          onSelect={openCreate}
        />
      }
    >
      <div className="space-y-4">
        {fieldsQuery.error ? (
          <LoadError
            what="the extra fields"
            error={fieldsQuery.error}
            onRetry={() => void fieldsQuery.refetch()}
          />
        ) : null}

        {/* Retiring is refused while the field is the only thing a form asks
            for, so the failure names the field rather than the panel. */}
        {archive.error ? <SaveError what="The field" error={archive.error} /> : null}

        <FilterBar>
          <FilterSelect
            label="Record type"
            allLabel="Every record type"
            value={entityFilter}
            options={SCHOOL_RECORD_TYPES.map((type) => ({
              value: type,
              label: CRM_FIELD_ENTITY_LABELS[type],
            }))}
            onChange={setEntityFilter}
          />
        </FilterBar>

        {fieldsQuery.isPending ? (
          <TableRowsSkeleton
            headers={["Field", "On lists", ""]}
            columns={[{ twoLine: true }, { width: 90, badge: true }, { width: 60 }]}
            rows={4}
          />
        ) : definitions.length === 0 ? (
          <NothingYet
            title="No extra fields"
            body="Every pupil and parent record carries what the system asks for and nothing more. Add a field when the school needs an answer this does not have a box for."
          />
        ) : visible.length === 0 ? (
          <NothingMatched
            what="fields"
            filters={[CRM_FIELD_ENTITY_LABELS[entityFilter as SchoolRecordType]]}
            onClear={() => setEntityFilter("")}
          />
        ) : (
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {visible.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[color:var(--text-strong)]">
                    {row.label}
                    {row.isRequired ? (
                      <span className="text-[color:var(--tone-danger)]"> *</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-[color:var(--text-muted)]">
                    {CRM_FIELD_ENTITY_LABELS[row.entity]} ·{" "}
                    {CRM_FIELD_TYPE_LABELS[row.type]} ·{" "}
                    <span className="font-[family-name:var(--font-mono)]">{row.key}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.showInTable ? <Badge tone="neutral">On lists</Badge> : null}
                  <RecordActions
                    resource="schools.students"
                    verbs={[
                      {
                        label: "Edit",
                        action: "configure",
                        onSelect: () => openEdit(row),
                      },
                      {
                        label: "Retire",
                        action: "configure",
                        tone: "danger",
                        loading: archive.isPending,
                        confirm: {
                          title: `Retire ${row.label}?`,
                          description:
                            "What every record already has recorded under it stays. The field stops being asked for on new forms.",
                          confirmLabel: "Retire the field",
                        },
                        onSelect: () => archive.mutate(row.id),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecordDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            save.reset();
          }
        }}
        title={editing ? `Edit ${editing.label}` : "New field"}
        description="Every record of the chosen type gains this question."
        size="md"
        errors={save.error ? [getApiErrorMessage(save.error)] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !save.isPending) save.mutate(values);
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save the field" : "Create field"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="field-entity">Record type</Label>
            <Select
              value={values.entity}
              disabled={Boolean(editing)}
              onValueChange={(value) =>
                setValues((current) => ({
                  ...current,
                  entity: value as SchoolRecordType,
                }))
              }
            >
              <SelectTrigger id="field-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_RECORD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CRM_FIELD_ENTITY_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="field-type">Answer</Label>
            <Select
              value={values.type}
              disabled={Boolean(editing)}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, type: value as CrmFieldType }))
              }
            >
              <SelectTrigger id="field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFERED_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CRM_FIELD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editing ? (
              <p className="text-sm text-muted-foreground">
                The kind of answer cannot change — everything already recorded was
                stored as this type.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="field-label">Label</Label>
            <Input
              id="field-label"
              value={values.label}
              placeholder="Bus route"
              maxLength={120}
              onChange={(event) =>
                setValues((current) => ({ ...current, label: event.target.value }))
              }
            />
            {!editing && derivedKey ? (
              <p className="text-sm text-muted-foreground">
                Filed under{" "}
                <span className="font-[family-name:var(--font-mono)]">{derivedKey}</span>,
                which never changes afterwards.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="field-description">Help text</Label>
            <Textarea
              id="field-description"
              rows={2}
              maxLength={500}
              value={values.description}
              placeholder="Shown under the field on the record form."
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="field-section">Section</Label>
            <Input
              id="field-section"
              value={values.section}
              placeholder="Additional details"
              maxLength={80}
              onChange={(event) =>
                setValues((current) => ({ ...current, section: event.target.value }))
              }
            />
          </div>
          <div>
            <Label className="flex items-start gap-2">
              <Checkbox
                checked={values.isRequired}
                onCheckedChange={(checked) =>
                  setValues((current) => ({ ...current, isRequired: checked === true }))
                }
              />
              <span>
                An answer is required
                <span className="block text-muted-foreground">
                  Records already saved without one are not affected.
                </span>
              </span>
            </Label>
          </div>
          <div>
            <Label className="flex items-start gap-2">
              <Checkbox
                checked={values.showInTable}
                onCheckedChange={(checked) =>
                  setValues((current) => ({ ...current, showInTable: checked === true }))
                }
              />
              <span>Show it as a column on lists</span>
            </Label>
          </div>
        </div>
      </RecordDialog>
    </Card>
  );
}
