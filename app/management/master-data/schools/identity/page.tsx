"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { CrmFieldType } from "@prisma/client";

import { ManagementShell } from "@/components/settings/management-shell";
import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  type ListColumnState,
} from "@/components/management/ui";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  CRM_FIELD_ENTITY_LABELS,
  CRM_FIELD_TYPE_LABELS,
  CRM_FIELD_TYPES,
} from "@/lib/crm/custom-fields";
import { SCHOOL_RECORD_TYPES, type SchoolRecordType } from "@/lib/records/registry";
import {
  Archive,
  ArrowDownward,
  ArrowUpward,
  ListBullets,
  MedusaIdBadgeIcon,
  SlidersHorizontal,
  SortAscending,
} from "@/lib/icons";

/**
 * School records, as `SchoolRecords.dc.html` draws it.
 *
 * The board's left list is one register holding two kinds of thing, and that is
 * the point of the screen: how a pupil is numbered, and what else the school
 * asks about them, are the same question asked twice. So admission numbering is
 * the first row — the board's `#` mark — and every custom field follows it under
 * an `Aa`.
 *
 * Both halves keep the wiring they arrived with: `["schools","settings",
 * "identity"]` behind a `PUT`, `["schools","field-definitions"]` behind
 * `POST`/`PATCH`/`DELETE`, and the same `schools.students` / `configure` gate on
 * writing a field that `SchoolCustomFieldsPanel` applied.
 *
 * What the board draws and this cannot: the Choices column counts how many
 * pupils have each answer. Nothing counts values per option — `customFields` is
 * a JSON column on the record — so the choices list names its rows and leaves
 * the figures out rather than inventing them.
 *
 * The board's Reorder does write. It travels on the same `PATCH
 * /api/v2/schools/field-definitions/[id]` the rest of this record already
 * commits through, under the same `schools.students` / `configure` gate, and it
 * sends the stored option objects back in a new order and nothing else — so a
 * `colorToken`, and the `value` every answer is filed under, survive the move
 * untouched. A field whose options are still bare strings is not offered the
 * verb, because rewriting those as objects would re-key the answers.
 */

const IDENTITY_KEY = ["schools", "settings", "identity"] as const;
const FIELDS_KEY = ["schools", "field-definitions"] as const;

/** The row that is not a custom field. */
const NUMBERING_ID = "admission-numbering";

/**
 * `ListRow` gives a row carrying a mark 50px, which is right on `Main.dc.html`
 * where the mark is a person's photograph. A `#` or an `Aa` is a type sign, not
 * a face, and this board keeps those rows at the list's own 42px rung. A
 * utility wins over the module, which is in `@layer components`.
 */
const MARKED_ROW = "min-h-[42px]";

type IdentitySettings = {
  studentPrefix: string | null;
  studentSeparator: string | null;
  studentPadWidth: number | null;
  cardAccentColor: string;
  cardMotto: string | null;
  cardShowPhoto: boolean;
  cardShowGuardianPhone: boolean;
};

type IdentityResponse = {
  settings: IdentitySettings | null;
  preview: { nextStudentNo: string; inferredScheme: string; studentsOnBooks: number };
};

type FormState = {
  declared: boolean;
  prefix: string;
  separator: "" | "-" | "/";
  padWidth: string;
  cardAccentColor: string;
  cardMotto: string;
  cardShowPhoto: boolean;
  cardShowGuardianPhone: boolean;
};

const EMPTY_IDENTITY: FormState = {
  declared: false,
  prefix: "",
  separator: "-",
  padWidth: "4",
  cardAccentColor: "#1D4ED8",
  cardMotto: "",
  cardShowPhoto: true,
  cardShowGuardianPhone: true,
};

function toForm(data: IdentityResponse): FormState {
  const s = data.settings;
  return {
    declared: s?.studentPrefix != null,
    prefix: s?.studentPrefix ?? "",
    separator: (s?.studentSeparator ?? "-") as FormState["separator"],
    padWidth: String(s?.studentPadWidth ?? 4),
    cardAccentColor: s?.cardAccentColor ?? "#1D4ED8",
    cardMotto: s?.cardMotto ?? "",
    cardShowPhoto: s?.cardShowPhoto ?? true,
    cardShowGuardianPhone: s?.cardShowGuardianPhone ?? true,
  };
}

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
  options?: unknown;
  archivedAt: string | null;
};

type NewFieldValues = {
  entity: SchoolRecordType;
  label: string;
  description: string;
  type: CrmFieldType;
  section: string;
  isRequired: boolean;
  showInTable: boolean;
};

// The reference types point at CRM records — a person, a company, a site — and
// none of them means anything on a pupil.
const OFFERED_TYPES = CRM_FIELD_TYPES.filter(
  (type) => !["USER", "PERSON", "COMPANY", "SITE"].includes(type),
);

const EMPTY_FIELD: NewFieldValues = {
  entity: "STUDENT",
  label: "",
  description: "",
  type: "SHORT_TEXT",
  section: "",
  isRequired: false,
  showInTable: false,
};

/**
 * A choice as the field definition stores it.
 *
 * `options` is a JSON column and older rows hold bare strings, so a list is
 * only *writable* when every entry already round-trips through
 * `fieldOptionSchema` — `{ value, label }`. Reordering rewrites the column, and
 * rewriting a list of strings as objects would silently re-key every answer
 * already filed under them.
 */
type FieldOption = { value: string; label: string; colorToken?: string };

function optionsOf(value: unknown): FieldOption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: FieldOption[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as { value?: unknown; label?: unknown; colorToken?: unknown };
    if (typeof record.value !== "string" || typeof record.label !== "string") return null;
    parsed.push({
      value: record.value,
      label: record.label,
      ...(typeof record.colorToken === "string"
        ? { colorToken: record.colorToken }
        : {}),
    });
  }
  return parsed;
}

/** `options` is a JSON column; anything that is not a list of choices is no list of choices. */
function choicesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => {
      if (typeof option === "string") return option;
      if (option && typeof option === "object") {
        const record = option as { label?: unknown; value?: unknown };
        if (typeof record.label === "string") return record.label;
        if (typeof record.value === "string") return record.value;
      }
      return null;
    })
    .filter((label): label is string => Boolean(label));
}

export default function SchoolsIdentityMasterDataPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const canConfigureFields = access.can("schools.students", "configure");

  const role = (session?.user as { role?: string } | undefined)?.role?.toUpperCase() ?? "";
  // Mirrors `isSchoolAdmin` server-side; the server remains the authority.
  const isAdmin = role === "SUPERADMIN" || role === "MANAGER" || role === "SCHOOL_ADMIN";

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(NUMBERING_ID);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<NewFieldValues>(EMPTY_FIELD);

  const identityQuery = useQuery({
    queryKey: IDENTITY_KEY,
    queryFn: () => fetchJson<IdentityResponse>("/api/v2/schools/settings/identity"),
  });

  const fieldsQuery = useQuery({
    queryKey: FIELDS_KEY,
    queryFn: () =>
      fetchJson<{ data: FieldDefinitionRecord[] }>("/api/v2/schools/field-definitions"),
  });

  const [form, setForm] = React.useState<FormState>(EMPTY_IDENTITY);
  /*
   * Adopt the saved settings during render, keyed on the object the query handed
   * back. An effect ran after the first paint, so the form showed its empty
   * defaults for a frame — and an administrator who typed immediately had their
   * first keystrokes overwritten when the fetch landed.
   */
  const [adopted, setAdopted] = React.useState<IdentityResponse | null>(null);
  if (identityQuery.data && identityQuery.data !== adopted) {
    setAdopted(identityQuery.data);
    setForm(toForm(identityQuery.data));
  }

  const definitions = React.useMemo(
    () => fieldsQuery.data?.data ?? [],
    [fieldsQuery.data],
  );

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return definitions;
    return definitions.filter(
      (row) =>
        row.label.toLowerCase().includes(needle) || row.key.toLowerCase().includes(needle),
    );
  }, [definitions, search]);

  const numberingMatches =
    !search.trim() || "admission numbering".includes(search.trim().toLowerCase());

  const selectedField = React.useMemo(
    () => definitions.find((row) => row.id === selectedId) ?? null,
    [definitions, selectedId],
  );

  const saveIdentity = useMutation({
    mutationFn: (next: FormState) =>
      fetchJson<IdentityResponse>("/api/v2/schools/settings/identity", {
        method: "PUT",
        body: JSON.stringify({
          studentPrefix: next.declared ? next.prefix.trim() || null : null,
          studentSeparator: next.declared ? next.separator : null,
          studentPadWidth: next.declared ? Number(next.padWidth) : null,
          cardAccentColor: next.cardAccentColor,
          cardMotto: next.cardMotto.trim() || null,
          cardShowPhoto: next.cardShowPhoto,
          cardShowGuardianPhone: next.cardShowGuardianPhone,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(IDENTITY_KEY, data);
    },
  });

  const commitIdentity = React.useCallback(
    (patch: Partial<FormState>) => {
      setForm((current) => {
        const next = { ...current, ...patch };
        saveIdentity.mutate(next);
        return next;
      });
    },
    [saveIdentity],
  );

  const invalidateFields = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: FIELDS_KEY });
  }, [queryClient]);

  const createField = useMutation({
    mutationFn: (input: NewFieldValues) =>
      fetchJson<{ id?: string }>("/api/v2/schools/field-definitions", {
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
      setCreating(false);
      setDraft(EMPTY_FIELD);
      invalidateFields();
    },
  });

  const patchField = useMutation({
    mutationFn: (input: {
      id: string;
      body: {
        label: string;
        description: string | null;
        section: string | null;
        isRequired: boolean;
        showInTable: boolean;
        /** Only ever sent by the Choices reorder, which rewrites the order alone. */
        options?: FieldOption[];
      };
    }) =>
      fetchJson(`/api/v2/schools/field-definitions/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.body),
      }),
    onSuccess: invalidateFields,
  });

  const retireField = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/field-definitions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedId(NUMBERING_ID);
      invalidateFields();
    },
  });

  const commitField = React.useCallback(
    (
      row: FieldDefinitionRecord,
      overrides: Partial<{
        label: string;
        description: string | null;
        section: string | null;
        isRequired: boolean;
        showInTable: boolean;
        options: FieldOption[];
      }>,
    ) => {
      patchField.mutate({
        id: row.id,
        body: {
          label: row.label,
          description: row.description,
          section: row.section,
          isRequired: row.isRequired,
          showInTable: row.showInTable,
          ...overrides,
        },
      });
    },
    [patchField],
  );

  const count = definitions.length + 1;
  const state: ListColumnState = fieldsQuery.isLoading || identityQuery.isLoading
    ? "loading"
    : fieldsQuery.isError || identityQuery.isError
      ? "failed"
      : rows.length === 0 && !numberingMatches
        ? "no-matches"
        : "ready";

  const preview = identityQuery.data?.preview;
  // What the next pupil would be called under the form as it stands, so the
  // office reads the consequence before it is a child's number for good.
  const liveNext = form.declared
    ? `${form.prefix.trim() || "?"}${form.separator}${String(
        Number(preview?.nextStudentNo.replace(/\D/g, "") ?? 1),
      ).padStart(Number(form.padWidth) || 0, "0")}`
    : (preview?.nextStudentNo ?? "—");

  const writeError = saveIdentity.error ?? patchField.error ?? retireField.error ?? null;

  return (
    <ManagementShell>
      <RegisterLayout
        list={
          <ListColumn
            title="School records"
            noun="field"
            count={count}
            state={state}
            search={{ value: search, onChange: setSearch, placeholder: "Search school records" }}
            onNew={canConfigureFields ? () => setCreating(true) : undefined}
            onRetry={() => {
              void fieldsQuery.refetch();
              void identityQuery.refetch();
            }}
          >
            {numberingMatches ? (
              <ListRow
                mark="#"
                name="Admission numbering"
                className={MARKED_ROW}
                selected={selectedId === NUMBERING_ID}
                onSelect={() => setSelectedId(NUMBERING_ID)}
              />
            ) : null}
            {rows.map((row) => (
              <ListRow
                key={row.id}
                mark="Aa"
                name={row.label}
                className={MARKED_ROW}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {selectedField ? (
          <FieldRecord
            key={selectedField.id}
            row={selectedField}
            canConfigure={canConfigureFields}
            writeError={writeError}
            onCommit={commitField}
            onRetire={async () => {
              const confirmed = await dsConfirm({
                title: `Retire ${selectedField.label}?`,
                description:
                  "What every record already has recorded under it stays. The field stops being asked for on new forms.",
                confirmLabel: "Retire the field",
                variant: "danger",
              });
              if (confirmed) retireField.mutate(selectedField.id);
            }}
          />
        ) : (
          <NumberingRecord
            form={form}
            isAdmin={isAdmin}
            liveNext={liveNext}
            scheme={preview?.inferredScheme ?? "—"}
            onBook={preview?.studentsOnBooks ?? 0}
            writeError={writeError}
            onCommit={commitIdentity}
          />
        )}
      </RegisterLayout>

      <NewFieldSheet
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) createField.reset();
        }}
        values={draft}
        onChange={setDraft}
        busy={createField.isPending}
        error={createField.error ? getApiErrorMessage(createField.error) : null}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.label.trim() && !createField.isPending) createField.mutate(draft);
        }}
      />
    </ManagementShell>
  );
}

/* ------------------------------------------------------------------ *
 * The two records
 * ------------------------------------------------------------------ */

function NumberingRecord({
  form,
  isAdmin,
  liveNext,
  scheme,
  onBook,
  writeError,
  onCommit,
}: {
  form: FormState;
  isAdmin: boolean;
  liveNext: string;
  scheme: string;
  onBook: number;
  writeError: unknown;
  onCommit: (patch: Partial<FormState>) => void;
}) {
  return (
    <>
      <RecordHeader title="Admission numbering" icon={MedusaIdBadgeIcon} />

      {writeError ? <WriteError error={writeError} /> : null}

      <SectionHeading icon={SlidersHorizontal} tone="brand">
        Details
      </SectionHeading>

      <DetailGrid>
        <DetailField label="Numbering" htmlFor="id-declared">
          {isAdmin ? (
            <DetailSelect
              id="id-declared"
              value={form.declared ? "declared" : "inferred"}
              onValueChange={(value) => onCommit({ declared: value === "declared" })}
            >
              <SelectItem value="inferred">Continue the school&apos;s own</SelectItem>
              <SelectItem value="declared">Follow a format</SelectItem>
            </DetailSelect>
          ) : (
            <DetailValue>
              {form.declared ? "Follow a format" : "Continue the school's own"}
            </DetailValue>
          )}
        </DetailField>

        {form.declared ? (
          <>
            <DetailField label="Prefix" htmlFor="id-prefix">
              {isAdmin ? (
                <CommitInput
                  id="id-prefix"
                  value={form.prefix}
                  onCommit={(next) =>
                    onCommit({ prefix: next.replace(/[^A-Za-z]/g, "").toUpperCase() })
                  }
                />
              ) : (
                <DetailValue>{form.prefix || "—"}</DetailValue>
              )}
            </DetailField>

            <DetailField label="Separator" htmlFor="id-separator">
              {isAdmin ? (
                <DetailSelect
                  id="id-separator"
                  value={form.separator === "" ? "none" : form.separator}
                  onValueChange={(value) =>
                    onCommit({
                      separator: (value === "none" ? "" : value) as FormState["separator"],
                    })
                  }
                >
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="-">Dash</SelectItem>
                  <SelectItem value="/">Slash</SelectItem>
                </DetailSelect>
              ) : (
                <DetailValue>{form.separator || "None"}</DetailValue>
              )}
            </DetailField>

            <DetailField label="Digits" htmlFor="id-digits">
              {isAdmin ? (
                <CommitInput
                  id="id-digits"
                  mono
                  inputMode="numeric"
                  value={form.padWidth}
                  onCommit={(next) => onCommit({ padWidth: next })}
                />
              ) : (
                <DetailValue mono>{form.padWidth}</DetailValue>
              )}
            </DetailField>
          </>
        ) : null}

        <DetailField label="Next number">
          <DetailValue mono>{liveNext}</DetailValue>
        </DetailField>

        <DetailField label="Current scheme">
          <DetailValue mono>{scheme}</DetailValue>
        </DetailField>

        <DetailField label="Pupils on the books">
          <DetailValue mono>{onBook}</DetailValue>
        </DetailField>
      </DetailGrid>

      <SectionHeading icon={MedusaIdBadgeIcon}>Pupil ID card</SectionHeading>

      <DetailGrid>
        <DetailField label="Card colour" htmlFor="card-accent">
          {isAdmin ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="card-accent"
                type="color"
                value={form.cardAccentColor}
                aria-label="Card colour"
                onChange={(event) => onCommit({ cardAccentColor: event.target.value })}
                style={{
                  width: 44,
                  height: 36,
                  padding: 2,
                  borderRadius: 8,
                  border: "1px solid #D2D7E0",
                  background: "#FFFFFF",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  font: "500 11px/1.5 var(--font-mono)",
                  color: "#5E6573",
                }}
              >
                {form.cardAccentColor.toUpperCase()}
              </span>
            </span>
          ) : (
            <DetailValue mono>{form.cardAccentColor.toUpperCase()}</DetailValue>
          )}
        </DetailField>

        <DetailField label="Motto line" htmlFor="card-motto">
          {isAdmin ? (
            <CommitInput
              id="card-motto"
              value={form.cardMotto}
              allowEmpty
              onCommit={(next) => onCommit({ cardMotto: next })}
            />
          ) : (
            <DetailValue>{form.cardMotto || "—"}</DetailValue>
          )}
        </DetailField>

        <DetailField label="Photograph" htmlFor="card-photo">
          {isAdmin ? (
            <DetailSelect
              id="card-photo"
              value={form.cardShowPhoto ? "shown" : "hidden"}
              onValueChange={(value) => onCommit({ cardShowPhoto: value === "shown" })}
            >
              <SelectItem value="shown">Shown</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </DetailSelect>
          ) : (
            <DetailValue>{form.cardShowPhoto ? "Shown" : "Hidden"}</DetailValue>
          )}
        </DetailField>

        <DetailField label="Guardian's phone" htmlFor="card-phone">
          {isAdmin ? (
            <DetailSelect
              id="card-phone"
              value={form.cardShowGuardianPhone ? "shown" : "hidden"}
              onValueChange={(value) =>
                onCommit({ cardShowGuardianPhone: value === "shown" })
              }
            >
              <SelectItem value="shown">Shown</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </DetailSelect>
          ) : (
            <DetailValue>{form.cardShowGuardianPhone ? "Shown" : "Hidden"}</DetailValue>
          )}
        </DetailField>
      </DetailGrid>

      <CardPreview form={form} nextNumber={liveNext} />

      <ActivityTrail events={[]} />
    </>
  );
}

function FieldRecord({
  row,
  canConfigure,
  writeError,
  onCommit,
  onRetire,
}: {
  row: FieldDefinitionRecord;
  canConfigure: boolean;
  writeError: unknown;
  onCommit: (
    row: FieldDefinitionRecord,
    overrides: Partial<{
      label: string;
      description: string | null;
      section: string | null;
      isRequired: boolean;
      showInTable: boolean;
      options: FieldOption[];
    }>,
  ) => void;
  onRetire: () => void;
}) {
  const stored = optionsOf(row.options);
  const choices = stored ? stored.map((option) => option.label) : choicesOf(row.options);

  /*
   * The order on screen while a rewrite is in flight. Without it the list
   * snaps back to the stored order for as long as the PATCH and the refetch
   * take, and a second click lands on rows that have already moved.
   */
  const [order, setOrder] = React.useState<FieldOption[] | null>(null);
  const [reordering, setReordering] = React.useState(false);
  const shown = order ?? stored;

  // A refused write means the order on screen is not the order that is stored.
  React.useEffect(() => {
    if (writeError) setOrder(null);
  }, [writeError]);

  function move(from: number, to: number) {
    if (!shown || to < 0 || to >= shown.length) return;
    const next = [...shown];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted);
    setOrder(next);
    onCommit(row, { options: next });
  }

  return (
    <>
      <RecordHeader
        title={row.label}
        icon={MedusaIdBadgeIcon}
        onRename={canConfigure ? (next) => onCommit(row, { label: next }) : undefined}
        renameLabel="Rename the field"
        action={
          canConfigure ? (
            <HeaderAction icon={Archive} onClick={onRetire}>
              Retire field
            </HeaderAction>
          ) : undefined
        }
      />

      {writeError ? <WriteError error={writeError} /> : null}

      <SectionHeading icon={SlidersHorizontal} tone="brand">
        Details
      </SectionHeading>

      <DetailGrid>
        <DetailField label="Label" htmlFor="sr-label">
          {canConfigure ? (
            <CommitInput
              id="sr-label"
              value={row.label}
              onCommit={(next) => onCommit(row, { label: next })}
            />
          ) : (
            <DetailValue>{row.label}</DetailValue>
          )}
        </DetailField>

        {/* The kind of answer and the record it sits on are settled at
            creation: everything already stored was filed as that type, under
            that entity. No control, rather than a control that is refused. */}
        <DetailField label="Type">
          <DetailValue>{CRM_FIELD_TYPE_LABELS[row.type]}</DetailValue>
        </DetailField>

        <DetailField label="Appears on">
          <DetailValue>{CRM_FIELD_ENTITY_LABELS[row.entity]}</DetailValue>
        </DetailField>

        <DetailField label="Required" htmlFor="sr-required">
          {canConfigure ? (
            <DetailSelect
              id="sr-required"
              value={row.isRequired ? "required" : "optional"}
              onValueChange={(value) => onCommit(row, { isRequired: value === "required" })}
            >
              <SelectItem value="optional">Optional</SelectItem>
              <SelectItem value="required">Required</SelectItem>
            </DetailSelect>
          ) : (
            <DetailValue>{row.isRequired ? "Required" : "Optional"}</DetailValue>
          )}
        </DetailField>

        <DetailField label="On lists" htmlFor="sr-lists">
          {canConfigure ? (
            <DetailSelect
              id="sr-lists"
              value={row.showInTable ? "shown" : "hidden"}
              onValueChange={(value) => onCommit(row, { showInTable: value === "shown" })}
            >
              <SelectItem value="shown">Shown</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </DetailSelect>
          ) : (
            <DetailValue>{row.showInTable ? "Shown" : "Hidden"}</DetailValue>
          )}
        </DetailField>

        <DetailField label="Section" htmlFor="sr-section">
          {canConfigure ? (
            <CommitInput
              id="sr-section"
              value={row.section ?? ""}
              allowEmpty
              onCommit={(next) => onCommit(row, { section: next || null })}
            />
          ) : (
            <DetailValue>{row.section ?? "—"}</DetailValue>
          )}
        </DetailField>

        <DetailField label="Help text" htmlFor="sr-help">
          {canConfigure ? (
            <CommitInput
              id="sr-help"
              value={row.description ?? ""}
              allowEmpty
              onCommit={(next) => onCommit(row, { description: next || null })}
            />
          ) : (
            <DetailValue>{row.description ?? "—"}</DetailValue>
          )}
        </DetailField>

        {/* The JSON key every answer already stored is filed under. It never
            changes, which is why the field can be relabelled at all. */}
        <DetailField label="Filed under">
          <DetailValue mono>{row.key}</DetailValue>
        </DetailField>
      </DetailGrid>

      {choices.length > 0 ? (
        <>
          <SectionHeading
            icon={ListBullets}
            count={choices.length}
            action={
              /* Rule 2: the list's own verb, on the list's own heading. It is
                 offered only where the order can actually be written back —
                 a field whose choices are still bare strings is not one. */
              canConfigure && shown && shown.length > 1 ? (
                <SectionAction
                  icon={SortAscending}
                  aria-pressed={reordering}
                  onClick={() => setReordering((open) => !open)}
                >
                  {reordering ? "Done" : "Reorder"}
                </SectionAction>
              ) : undefined
            }
          >
            Choices
          </SectionHeading>

          {reordering && shown ? (
            <ChoiceReorderList rows={shown} onMove={move} />
          ) : (
            <RecordList
              columns={{ row: "Choice" }}
              rows={(shown ? shown.map((option) => option.label) : choices).map(
                (label, index) => ({
                  id: `${row.id}-${index}`,
                  code: String(index + 1),
                  name: label,
                }),
              )}
            />
          )}
        </>
      ) : null}

      <RecordActivityTrail entityType="CrmFieldDefinition" entityId={row.id} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The card, and the sheet that makes a field
 * ------------------------------------------------------------------ */

/**
 * What a child carries in their pocket, at CR80 proportions (85.6 × 54).
 *
 * The accent colour is printed ink — data, not theme — so it is the one
 * deliberate inline colour on this screen.
 */
function CardPreview({ form, nextNumber }: { form: FormState; nextNumber: string }) {
  return (
    <div
      role="img"
      aria-label="ID card preview"
      style={{
        width: 300,
        height: 189,
        marginTop: 20,
        overflow: "hidden",
        borderRadius: 10,
        border: "1px solid #E5E8EE",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 36,
          padding: "0 12px",
          background: form.cardAccentColor,
          font: "600 11px/1 var(--font-sans)",
          color: "#FFFFFF",
        }}
      >
        <span>STUDENT IDENTITY CARD</span>
        <span>{new Date().getFullYear()}</span>
      </div>
      <div style={{ display: "flex", gap: 12, padding: 12, background: "#FFFFFF" }}>
        {form.cardShowPhoto ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 68,
              height: 84,
              flexShrink: 0,
              borderRadius: 4,
              border: "1px solid #D2D7E0",
              background: "#F1F3F6",
              font: "500 11px/1 var(--font-sans)",
              color: "#5E6573",
            }}
          >
            PHOTO
          </div>
        ) : null}
        <div style={{ minWidth: 0, font: "400 11px/1.45 var(--font-sans)", color: "#262A33" }}>
          <p style={{ margin: 0, font: "600 13px/1.3 var(--font-sans)", color: "#16181D" }}>
            Tendai Moyo
          </p>
          <p style={{ margin: 0, font: "400 11px/1.5 var(--font-mono)" }}>{nextNumber}</p>
          <p style={{ margin: 0 }}>Form 2 Blue</p>
          {form.cardShowGuardianPhone ? (
            <p style={{ margin: 0 }}>Guardian: 0772 000 111</p>
          ) : null}
          {form.cardMotto.trim() ? (
            <p style={{ margin: "4px 0 0", fontStyle: "italic", color: "#5E6573" }}>
              {form.cardMotto}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The sheet the `+ New` verb opens.
 *
 * No board draws creation, so this follows the contract's form page instead: a
 * label-over-control stack at `gap 7 / margin-bottom 22`, and Submit/Cancel at
 * the bottom above a `#EEF0F4` rule — the one place rule 2 lets a button sit at
 * the bottom of anything.
 */
function NewFieldSheet({
  open,
  onOpenChange,
  values,
  onChange,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: NewFieldValues;
  onChange: (next: NewFieldValues) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="w-full p-6">
        <SheetHeader>
          <SheetTitle className="text-[17px] font-semibold leading-[1.25] tracking-[-0.012em] text-[#16181D]">
            New field
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6">
          {error ? <WriteErrorText>{error}</WriteErrorText> : null}

          <SheetField label="Appears on" htmlFor="new-entity">
            <Select
              value={values.entity}
              onValueChange={(value) =>
                onChange({ ...values, entity: value as SchoolRecordType })
              }
            >
              <SelectTrigger id="new-entity" className="h-9 w-full text-[13px] leading-[1.5]">
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
          </SheetField>

          <SheetField label="Type" htmlFor="new-type">
            <Select
              value={values.type}
              onValueChange={(value) =>
                onChange({ ...values, type: value as CrmFieldType })
              }
            >
              <SelectTrigger id="new-type" className="h-9 w-full text-[13px] leading-[1.5]">
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
          </SheetField>

          <SheetField label="Label" htmlFor="new-label">
            <Input
              id="new-label"
              value={values.label}
              maxLength={120}
              className="h-9 w-full text-[13px] leading-[1.5]"
              onChange={(event) => onChange({ ...values, label: event.target.value })}
            />
          </SheetField>

          <SheetField label="Help text" htmlFor="new-help">
            <Textarea
              id="new-help"
              rows={2}
              maxLength={500}
              value={values.description}
              className="w-full text-[13px] leading-[1.5]"
              onChange={(event) =>
                onChange({ ...values, description: event.target.value })
              }
            />
          </SheetField>

          <SheetField label="Section" htmlFor="new-section">
            <Input
              id="new-section"
              value={values.section}
              maxLength={80}
              className="h-9 w-full text-[13px] leading-[1.5]"
              onChange={(event) => onChange({ ...values, section: event.target.value })}
            />
          </SheetField>

          <SheetField label="Required" htmlFor="new-required">
            <Select
              value={values.isRequired ? "required" : "optional"}
              onValueChange={(value) =>
                onChange({ ...values, isRequired: value === "required" })
              }
            >
              <SelectTrigger id="new-required" className="h-9 w-full text-[13px] leading-[1.5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optional">Optional</SelectItem>
                <SelectItem value="required">Required</SelectItem>
              </SelectContent>
            </Select>
          </SheetField>

          <SheetField label="On lists" htmlFor="new-lists">
            <Select
              value={values.showInTable ? "shown" : "hidden"}
              onValueChange={(value) =>
                onChange({ ...values, showInTable: value === "shown" })
              }
            >
              <SelectTrigger id="new-lists" className="h-9 w-full text-[13px] leading-[1.5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shown">Shown</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </SheetField>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 36,
              paddingTop: 22,
              borderTop: "1px solid #EEF0F4",
            }}
          >
            <button
              type="submit"
              disabled={busy || !values.label.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 34,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid #0B5DF0",
                background: "#0B5DF0",
                font: "500 13px/1.4 var(--font-sans)",
                color: "#FFFFFF",
                cursor: "pointer",
                opacity: busy || !values.label.trim() ? 0.6 : 1,
              }}
            >
              Create field
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 34,
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid transparent",
                background: "transparent",
                font: "500 13px/1.4 var(--font-sans)",
                color: "#565C69",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * Local pieces
 * ------------------------------------------------------------------ */

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "132px minmax(0, 320px)",
        alignItems: "center",
        gap: "12px 16px",
      }}
    >
      {children}
    </div>
  );
}

function DetailField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label
        htmlFor={htmlFor}
        style={{
          alignSelf: "center",
          font: "400 12px/1.45 var(--font-sans)",
          color: "#5E6573",
        }}
      >
        {label}
      </label>
      <div style={{ minWidth: 0 }}>{children}</div>
    </>
  );
}

function DetailValue({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      style={{
        display: "block",
        font: mono ? "400 13px/1.5 var(--font-mono)" : "400 13px/1.5 var(--font-sans)",
        fontVariantNumeric: mono ? "tabular-nums" : undefined,
        color: "#262A33",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function DetailSelect({
  id,
  value,
  onValueChange,
  children,
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="h-9 w-full text-[13px] leading-[1.5]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/** Commits on blur or Enter, abandons on Escape. The record is the form. */
function CommitInput({
  id,
  value,
  onCommit,
  mono,
  inputMode,
  allowEmpty,
}: {
  id?: string;
  value: string;
  onCommit: (next: string) => void;
  mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <Input
      id={id}
      value={draft}
      inputMode={inputMode}
      className={`h-9 w-full text-[13px] leading-[1.5]${mono ? " font-mono" : ""}`}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next === value.trim()) return;
        if (!next && !allowEmpty) {
          setDraft(value);
          return;
        }
        onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SheetField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 7, marginBottom: 22 }}>
      <label
        htmlFor={htmlFor}
        style={{ font: "500 12px/1.4 var(--font-sans)", color: "#565C69" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The Choices list while Reorder is on.
 *
 * Same geometry as `RecordList` — 470px, 38px rows, a 12px gap, the `#EEF0F4`
 * rule — with the position column still counting from one and a pair of 24px
 * moves on the right. Buttons rather than drag: a drag handle on a settings
 * list is a target that cannot be reached from a keyboard, and the list is
 * four rows long.
 */
function ChoiceReorderList({
  rows,
  onMove,
}: {
  rows: FieldOption[];
  onMove: (from: number, to: number) => void;
}) {
  return (
    <>
      {/* Rule 6: the list keeps naming its columns while it is being moved. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: 470,
          padding: "0 0 7px",
          borderBottom: "1px solid #E5E8EE",
        }}
      >
        <span
          style={{
            flexGrow: 1,
            minWidth: 0,
            font: "500 11px/1.5 var(--font-sans)",
            color: "#5E6573",
          }}
        >
          Choice
        </span>
        <span
          style={{
            flexShrink: 0,
            minWidth: 60,
            textAlign: "right",
            font: "500 11px/1.5 var(--font-sans)",
            color: "#5E6573",
          }}
        >
          Order
        </span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", maxWidth: 470 }}>
      {rows.map((option, index) => (
        <li
          key={option.value}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minHeight: 38,
            borderBottom: index === rows.length - 1 ? "none" : "1px solid #EEF0F4",
          }}
        >
          <span
            style={{
              font: "500 11px/1.5 var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "#5E6573",
            }}
          >
            {index + 1}
          </span>
          <span
            style={{
              flexGrow: 1,
              minWidth: 0,
              font: "400 13px/1.5 var(--font-sans)",
              color: "#262A33",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </span>
          {/* Rule 9: an invalid action is absent, not greyed out. The top row
              has nothing above it and the bottom row nothing below it, so
              neither position is drawn at all. */}
          {index > 0 ? (
            <MoveButton
              label={`Move ${option.label} up`}
              onClick={() => onMove(index, index - 1)}
            >
              <ArrowUpward className="size-[13px]" />
            </MoveButton>
          ) : null}
          {index < rows.length - 1 ? (
            <MoveButton
              label={`Move ${option.label} down`}
              onClick={() => onMove(index, index + 1)}
            >
              <ArrowDownward className="size-[13px]" />
            </MoveButton>
          ) : null}
        </li>
      ))}
      </ul>
    </>
  );
}

function MoveButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        flexShrink: 0,
        borderRadius: 6,
        border: "1px solid #E5E8EE",
        background: "#FFFFFF",
        color: "#565C69",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function WriteErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 34,
        margin: "0 0 22px",
        padding: "0 12px",
        borderRadius: 8,
        background: "#F6E2DD",
        font: "500 12px/1.4 var(--font-sans)",
        color: "#7A2419",
      }}
    >
      {children}
    </p>
  );
}

function WriteError({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 34,
        margin: "16px 0 0",
        padding: "0 12px",
        maxWidth: 470,
        borderRadius: 8,
        background: "#F6E2DD",
        font: "500 12px/1.4 var(--font-sans)",
        color: "#7A2419",
      }}
    >
      {getApiErrorMessage(error)}
    </p>
  );
}
