"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ManagementShell } from "@/components/settings/management-shell";
import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import {
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
  type RecordListRow,
  type StatusTone,
} from "@/components/management/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  DetailValue,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";
import {
  DEFAULT_TEMPLATE_CATALOG,
  resolveCatalogTemplateEntry,
} from "@/lib/documents/default-template-catalog";
import {
  defaultTemplateSchema,
  type DocumentTemplateSchema,
  templateSchema,
} from "@/lib/documents/template-schema";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  FileText,
  Info,
  ListBullets,
  SlidersHorizontal,
  Warning,
} from "@/lib/icons";

import styles from "./templates.module.css";

type DocumentType =
  | "REPORT_TABLE"
  | "DASHBOARD_PACK"
  | "SALES_INVOICE"
  | "SALES_QUOTATION"
  | "SALES_RECEIPT"
  | "GENERIC_RECORD";

type ExportTargetType = "LIST" | "RECORD" | "DASHBOARD";
type TemplateScope = "SYSTEM" | "COMPANY";

type TemplateVersionSummary = {
  id: string;
  version: number;
  isPublished: boolean;
  createdAt?: string;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  sourceKey: string;
  documentType: DocumentType;
  targetType: ExportTargetType;
  scope: TemplateScope;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
  versions: TemplateVersionSummary[];
};

type TemplateVersion = {
  id: string;
  version: number;
  schemaJson: string;
  isPublished: boolean;
  createdAt: string;
  /**
   * `DocumentTemplateVersion.publishedAt`. Already on every row the versions
   * route returns — it selects the whole record — and it is the date the
   * board's "Published 11 Sep 2026" is stating. `createdAt` is when the
   * version was *saved*, which for a version published weeks later is a
   * different day.
   */
  publishedAt?: string | null;
};

type SourceOption = {
  id: string;
  label: string;
  description: string;
  sourceKey: string;
  documentType: DocumentType;
  targetType: ExportTargetType;
};

function buildSourceOptionId(
  sourceKey: string,
  documentType: DocumentType,
  targetType: ExportTargetType,
) {
  return `${sourceKey}|${documentType}|${targetType}`;
}

function toSourceLabel(sourceKey: string) {
  return sourceKey
    .split(".")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toDocumentTypeLabel(value: DocumentType) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toTargetTypeLabel(value: ExportTargetType) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * `6 Jan 2026`, fixed to en-GB.
 *
 * Not `toLocaleString()`: this renders inside a client component whose data
 * arrives from a query, but a locale read off the browser still gives two
 * machines two different strings for the same row, and the board's date column
 * is a fixed-width mono column that assumes one.
 */
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDay(value: string | Date | undefined | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DAY_FORMAT.format(date);
}

/** `Employment contract` → `EC`. The list's 30px mark. */
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function tryParseSchemaStrict(value: string): DocumentTemplateSchema | null {
  try {
    const parsed = JSON.parse(value);
    const result = templateSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * The status a template's header states, and the tone it states it in.
 *
 * Rule 5: a badge marks an exception. `Published` is the healthy norm here, so
 * it is passed as `success` and `StatusBadge` in `context="header"` renders it
 * as nothing. Retired and Draft are the two exceptions and both draw.
 */
function headerStatus(template: TemplateRow): { tone: StatusTone; label: string } {
  if (!template.isActive) return { tone: "neutral", label: "Retired" };
  if (!template.versions.some((version) => version.isPublished)) {
    return { tone: "warn", label: "Draft" };
  }
  return { tone: "success", label: "Published" };
}

/**
 * Document templates — the library, a template's record, and the document it
 * renders.
 *
 * Boards: `Templates.dc.html` (the register) and `TemplateRender.dc.html` (the
 * rendered document over the stage, with the version history beside it).
 *
 * Presentation only. Every endpoint, query key and invalidation below is the
 * one that was here before; the surface around them is the design's.
 */
export default function TemplateSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    name: "",
    sourceOptionId: "",
    setDefault: true,
  });
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  /**
   * The unsaved schema, tagged with the template it belongs to.
   *
   * Carrying the id means the draft cannot outlive its template: when the
   * selection moves, `schemaJsonDraft` below reads back as empty without
   * anything having to remember to clear it.
   */
  const [schemaDraft, setSchemaDraft] = useState<{ templateId: string | null; json: string }>({
    templateId: null,
    json: "",
  });

  const templatesQuery = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const response = await fetch("/api/document-templates");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load templates");
      return payload as TemplateRow[];
    },
  });

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      `${template.name} ${template.sourceKey}`.toLowerCase().includes(needle),
    );
  }, [templates, query]);

  /**
   * A register opens on a record. Above 900px both columns are on screen and an
   * empty right-hand column is half a screen spent on nothing, so the first row
   * is picked for the reader; below it the two columns stack and picking one
   * would drop them straight into a record they never asked for.
   *
   * Read during render rather than written from an effect: the list and the
   * record it opens on come from the same pass, so there is no frame where the
   * rows are there and the right-hand column is still empty.
   */
  const wide = useWideViewport();
  const activeId =
    wide && !(selectedId && rows.some((row) => row.id === selectedId))
      ? (rows[0]?.id ?? null)
      : selectedId;

  const selected = useMemo(
    () => templates.find((template) => template.id === activeId) ?? null,
    [templates, activeId],
  );

  const schemaJsonDraft = schemaDraft.templateId === activeId ? schemaDraft.json : "";
  const setSchemaJsonDraft = (json: string) => setSchemaDraft({ templateId: activeId, json });

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const map = new Map<string, SourceOption>();

    for (const entry of DEFAULT_TEMPLATE_CATALOG) {
      const id = buildSourceOptionId(entry.sourceKey, entry.documentType, entry.targetType);
      map.set(id, {
        id,
        label: entry.name,
        description: `${entry.sourceKey} | ${toDocumentTypeLabel(entry.documentType)} | ${toTargetTypeLabel(entry.targetType)}`,
        sourceKey: entry.sourceKey,
        documentType: entry.documentType,
        targetType: entry.targetType,
      });
    }

    for (const row of templates) {
      const id = buildSourceOptionId(row.sourceKey, row.documentType, row.targetType);
      if (map.has(id)) continue;
      map.set(id, {
        id,
        label: toSourceLabel(row.sourceKey),
        description: `${row.sourceKey} | ${toDocumentTypeLabel(row.documentType)} | ${toTargetTypeLabel(row.targetType)}`,
        sourceKey: row.sourceKey,
        documentType: row.documentType,
        targetType: row.targetType,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [templates]);

  const sourceOptionById = useMemo(
    () => new Map(sourceOptions.map((option) => [option.id, option])),
    [sourceOptions],
  );

  const createSourceOption = createDraft.sourceOptionId
    ? (sourceOptionById.get(createDraft.sourceOptionId) ?? null)
    : null;

  const versionsQuery = useQuery({
    queryKey: ["document-template-versions", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const response = await fetch(`/api/document-templates/${activeId!}/versions`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load template versions");
      return payload as TemplateVersion[];
    },
  });

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);

  const resolvedSelectedVersionId =
    selectedVersionId && versions.some((version) => version.id === selectedVersionId)
      ? selectedVersionId
      : (versions.find((version) => version.isPublished)?.id ?? versions[0]?.id ?? null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === resolvedSelectedVersionId) ?? null,
    [resolvedSelectedVersionId, versions],
  );

  const effectiveSchemaJson =
    schemaJsonDraft ||
    selectedVersion?.schemaJson ||
    JSON.stringify(defaultTemplateSchema, null, 2);

  const parsedSchema = useMemo(
    () => tryParseSchemaStrict(effectiveSchemaJson),
    [effectiveSchemaJson],
  );

  /**
   * The rendered document behind `TemplateRender.dc.html`'s stage.
   *
   * `/api/document-templates/preview` already exists for exactly this — it
   * renders the schema against the caller's real branding and a sample payload
   * — but nothing called it, because the old editor was a JSON textarea. It is
   * a POST, so the HTML is fetched and handed to the frame as `srcDoc` rather
   * than pointed at.
   */
  const previewQuery = useQuery({
    // The schema is part of the key, not just the body: the stage has to show
    // the blocks as they stand, and an edited draft under the published
    // version's id would otherwise be served the cached render of the old one.
    // Only the render dialog reads this, and the block editor closes it, so
    // keying on the draft cannot turn typing into requests.
    queryKey: [
      "document-template-preview",
      activeId,
      resolvedSelectedVersionId,
      effectiveSchemaJson,
    ],
    enabled: renderOpen && Boolean(selected) && Boolean(parsedSchema),
    queryFn: async () => {
      const response = await fetch("/api/document-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: selected!.sourceKey, schema: parsedSchema }),
      });
      if (!response.ok) throw new Error("Failed to render the preview");
      return response.text();
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!createSourceOption) {
        throw new Error("Select a source before creating a template");
      }

      const response = await fetch("/api/document-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          sourceKey: createSourceOption.sourceKey,
          documentType: createSourceOption.documentType,
          targetType: createSourceOption.targetType,
          cloneFromSystemDefault: true,
          setDefault: createDraft.setDefault,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create template");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setCreateOpen(false);
      setCreateDraft({ name: "", sourceOptionId: "", setDefault: true });
      toast({
        title: "Template created",
        description: "Template was created from defaults and is ready for editing.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to create template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No template selected");
      const parsed = tryParseSchemaStrict(effectiveSchemaJson);
      if (!parsed) throw new Error("Invalid schema JSON");

      const response = await fetch(`/api/document-templates/${selected.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaJson: JSON.stringify(parsed) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to save template version");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["document-template-versions", activeId],
      });
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setSchemaOpen(false);
      toast({
        title: "Version saved",
        description: "A new template version has been created.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save version",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (versionId: string) => {
      if (!selected) throw new Error("Select a version to publish");
      const response = await fetch(`/api/document-templates/${selected.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to publish template version");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["document-template-versions", activeId],
      });
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({
        title: "Version published",
        description: "Selected template version is now published.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to publish version",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/document-templates/${templateId}/set-default`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to set default template");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({
        title: "Default updated",
        description: "Template has been marked as default for this source.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to set default",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function openCreate(prefill?: TemplateRow) {
    if (!prefill) {
      setCreateDraft({ name: "", sourceOptionId: "", setDefault: true });
      setCreateOpen(true);
      return;
    }

    const optionId = buildSourceOptionId(
      prefill.sourceKey,
      prefill.documentType,
      prefill.targetType,
    );
    const sourceOption =
      sourceOptionById.get(optionId) ??
      ({
        id: optionId,
        label: toSourceLabel(prefill.sourceKey),
        description: `${prefill.sourceKey} | ${toDocumentTypeLabel(prefill.documentType)} | ${toTargetTypeLabel(prefill.targetType)}`,
        sourceKey: prefill.sourceKey,
        documentType: prefill.documentType,
        targetType: prefill.targetType,
      } as SourceOption);

    setCreateDraft({
      name:
        prefill.scope === "SYSTEM" ? `${prefill.name} override` : `${prefill.name} copy`,
      sourceOptionId: sourceOption.id,
      setDefault: true,
    });
    setCreateOpen(true);
  }

  function select(id: string) {
    setSelectedId(id);
    setSelectedVersionId(null);
    setSchemaJsonDraft("");
  }

  /** The page block of the draft schema — paper size and orientation. */
  function updateSchemaPage(patch: Partial<DocumentTemplateSchema["page"]>) {
    if (!parsedSchema) return;
    setSchemaJsonDraft(
      JSON.stringify({ ...parsedSchema, page: { ...parsedSchema.page, ...patch } }, null, 2),
    );
  }

  function updateSchemaFlag(
    section: keyof DocumentTemplateSchema,
    key: string,
    checked: boolean,
  ) {
    if (!parsedSchema) return;
    setSchemaJsonDraft(
      JSON.stringify(
        { ...parsedSchema, [section]: { ...parsedSchema[section], [key]: checked } },
        null,
        2,
      ),
    );
  }

  const listState: ListColumnState = templatesQuery.isLoading
    ? "loading"
    : templatesQuery.isError
      ? "failed"
      : rows.length > 0
        ? "ready"
        : query.trim()
          ? "no-matches"
          : "empty";

  const busy =
    createTemplateMutation.isPending ||
    saveVersionMutation.isPending ||
    publishMutation.isPending ||
    setDefaultMutation.isPending;

  const versionRows: RecordListRow[] = versions.map((version, index) => {
    const isCurrent =
      version.isPublished &&
      versions.findIndex((candidate) => candidate.isPublished) === index;
    return {
      id: version.id,
      code: `v${version.version}`,
      name: version.isPublished
        ? `Published ${formatDay(version.publishedAt ?? version.createdAt)}`
        : `Saved ${formatDay(version.createdAt)}`,
      value: version.isPublished
        ? { kind: "status", tone: isCurrent ? "success" : "neutral", label: isCurrent ? "Current" : "Superseded" }
        : { kind: "status", tone: "warn", label: "Draft" },
    };
  });

  const status = selected ? headerStatus(selected) : null;
  /** `A4 · portrait` — the page block of the version's own schema. */
  const paperLabel = parsedSchema
    ? `${parsedSchema.page.size === "A4" ? "A4" : "Letter"} · ${parsedSchema.page.orientation}`
    : "—";
  const catalog = selected
    ? resolveCatalogTemplateEntry({
        sourceKey: selected.sourceKey,
        documentType: selected.documentType,
        targetType: selected.targetType,
      })
    : null;

  return (
    <ManagementShell railCounts={{ templates: templates.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Templates"
            noun="template"
            count={templates.length}
            state={listState}
            search={{ value: query, onChange: setQuery, placeholder: "Search templates" }}
            onNew={() => openCreate()}
            onRetry={() => void templatesQuery.refetch()}
            emptyIcon={FileText}
          >
            {rows.map((template) => (
              <ListRow
                key={template.id}
                name={template.name}
                mark={initialsOf(template.name)}
                selected={template.id === activeId}
                onSelect={() => select(template.id)}
                /*
                  `ListRow` raises a marked row to 50px, which is right for the
                  people lists it was drawn from. This board's rows are 42px
                  around the same 30px mark, so the rung is answered once, here,
                  where the utilities layer wins over the shared module.
                */
                className="min-h-[42px]"
              />
            ))}
          </ListColumn>
        }
      >
        {selected && status ? (
          <>
            <BackToList label="Templates" onBack={() => setSelectedId(null)} />

            <RecordHeader
              title={selected.name}
              icon={FileText}
              badge={
                <StatusBadge context="header" tone={status.tone}>
                  {status.label}
                </StatusBadge>
              }
              action={
                <HeaderAction icon={Eye} onClick={() => setRenderOpen(true)}>
                  Preview
                </HeaderAction>
              }
              overflow={
                <>
                  {/* A system template is the one the product ships and nothing
                      here may write it; duplicating is how a workspace gets one
                      of its own, so `Edit blocks` is absent rather than greyed
                      on those. */}
                  {selected.scope === "COMPANY" ? (
                    <DropdownMenuItem
                      disabled={busy}
                      onSelect={() => {
                        setSchemaJsonDraft(
                          selectedVersion?.schemaJson ??
                            JSON.stringify(defaultTemplateSchema, null, 2),
                        );
                        setSchemaOpen(true);
                      }}
                    >
                      Edit blocks
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem disabled={busy} onSelect={() => openCreate(selected)}>
                    Duplicate
                  </DropdownMenuItem>
                  {/* Rule 9: an already-default template has nothing to set, so
                      the item is absent rather than greyed. */}
                  {selected.scope === "COMPANY" && !selected.isDefault ? (
                    <DropdownMenuItem
                      disabled={busy}
                      onSelect={() => setDefaultMutation.mutate(selected.id)}
                    >
                      Set as the default
                    </DropdownMenuItem>
                  ) : null}
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            {/*
              The board draws live controls here. `/api/document-templates` has
              POST and nothing else — there is no `[id]` route at all, so no
              PATCH — and a template's own fields cannot be written without a
              new endpoint, which this refactor does not add.

              So every fact is a `DetailValue`, which is the answer this group
              of registers already settled on for a fact it cannot write (see
              `downtime-codes`, `Code`): an input whose every commit would be a
              rejected write is worse than the board's picture, and a control
              that cannot be operated is an affordance that lies. The one field
              that *is* writable — Paper, which lives in the version schema —
              is changed through `Edit blocks`, which saves a version.

              `Name` is not repeated here. On the board it is the rename
              control; with nothing to rename it would be the record's title
              drawn a second line below itself.
            */}
            <DetailGrid>
              <DetailRow label="Issued for">
                <DetailValue>
                  {catalog?.name ?? toDocumentTypeLabel(selected.documentType)}
                </DetailValue>
              </DetailRow>
              <DetailRow label="Applies to">
                <DetailValue>{toTargetTypeLabel(selected.targetType)}</DetailValue>
              </DetailRow>
              <DetailRow label="Source">
                <DetailValue mono>{selected.sourceKey}</DetailValue>
              </DetailRow>
              <DetailRow label="Paper">
                <DetailValue>{paperLabel}</DetailValue>
              </DetailRow>
              <DetailRow label="Status">
                <DetailValue>{status.label}</DetailValue>
              </DetailRow>
              <DetailRow label="Default">
                <DetailValue>
                  {selected.isDefault
                    ? `Yes, for every ${toDocumentTypeLabel(selected.documentType).toLowerCase()}`
                    : "No"}
                </DetailValue>
              </DetailRow>
              <DetailRow label="Kept by">
                <DetailValue>
                  {selected.scope === "SYSTEM" ? "The system" : "This workspace"}
                </DetailValue>
              </DetailRow>
            </DetailGrid>

            <SectionHeading icon={ListBullets} count={versions.length}>
              Versions
            </SectionHeading>
            {versionRows.length > 0 ? (
              <RecordList
                columns={{ row: "Published", value: "Status" }}
                rows={versionRows}
                valueWidth={88}
              />
            ) : (
              <NoRecord
                label={versionsQuery.isLoading ? "Loading versions" : "No versions yet."}
              />
            )}

            <RecordActivityTrail
              entityType="DocumentTemplate"
              entityId={selected.id}
              fullLogHref={FULL_LOG_HREF}
            />
          </>
        ) : (
          <NoRecord
            label={
              templatesQuery.isLoading
                ? "Loading templates"
                : query.trim()
                  ? "No template matches that search."
                  : "No template to show yet."
            }
          />
        )}
      </RegisterLayout>

      {/* ---------------------------------------------------------------- *
          TemplateRender.dc.html — the document, and the versions beside it
       * ---------------------------------------------------------------- */}
      <Dialog open={renderOpen && Boolean(selected)} onOpenChange={setRenderOpen}>
        <DialogContent
          size="full"
          tabletBehavior="centered"
          showClose={false}
          className="h-full w-full max-w-none gap-0 overflow-hidden rounded-[var(--radius-2xl)] border-0 p-0 sm:p-0 md:max-lg:max-h-[calc(100dvh-3rem)]"
        >
          <DialogTitle className="sr-only">{selected?.name ?? "Template"}</DialogTitle>
          <DialogDescription className="sr-only">
            The rendered document and its version history
          </DialogDescription>

          {selected && status ? (
            <div className={styles.render}>
              <header className={styles.renderHead}>
                <button
                  type="button"
                  aria-label="Back to the template"
                  className={styles.iconBtn}
                  onClick={() => setRenderOpen(false)}
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <h1 className={styles.renderTitle}>{selected.name}</h1>
                <span style={{ flexGrow: 1 }} />
                {selected.scope === "COMPANY" ? (
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      setSchemaJsonDraft(
                        selectedVersion?.schemaJson ??
                          JSON.stringify(defaultTemplateSchema, null, 2),
                      );
                      setRenderOpen(false);
                      setSchemaOpen(true);
                    }}
                  >
                    Edit blocks
                  </button>
                ) : null}
                {selectedVersion && !selectedVersion.isPublished ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    disabled={publishMutation.isPending}
                    onClick={() => publishMutation.mutate(selectedVersion.id)}
                  >
                    {publishMutation.isPending ? "Publishing…" : "Publish"}
                  </button>
                ) : null}
              </header>

              <div className={styles.renderBody}>
                <div className={styles.stage}>
                  {previewQuery.data ? (
                    <iframe
                      title={`${selected.name} preview`}
                      sandbox=""
                      srcDoc={previewQuery.data}
                      className={
                        parsedSchema?.page.orientation === "landscape"
                          ? `${styles.page} ${styles.pageLandscape}`
                          : styles.page
                      }
                    />
                  ) : (
                    <div className={`${styles.page} ${styles.pageFallback}`}>
                      {previewQuery.isError
                        ? "The preview could not be rendered"
                        : "Rendering…"}
                    </div>
                  )}
                </div>

                <aside className={styles.panel}>
                  <div className={styles.panelHead}>
                    <span
                      className={styles.panelTile}
                      data-tone={status.tone === "success" ? undefined : "warn"}
                    >
                      {status.tone === "success" ? (
                        <CheckCircle aria-hidden="true" />
                      ) : (
                        <Warning aria-hidden="true" />
                      )}
                    </span>
                    <h2 className={styles.panelTitle}>
                      {status.tone === "success" ? "Published" : status.label}
                    </h2>
                  </div>

                  <dl className={styles.panelFacts}>
                    <dt>Used for</dt>
                    <dd>
                      <span className={styles.pill} data-tone="brand">
                        {catalog?.name ?? toDocumentTypeLabel(selected.documentType)}
                      </span>
                    </dd>
                    <dt>Default</dt>
                    <dd>
                      {selected.isDefault
                        ? `Yes, for every ${toDocumentTypeLabel(selected.documentType).toLowerCase()}`
                        : "No"}
                    </dd>
                    <dt>Paper</dt>
                    <dd>
                      {parsedSchema
                        ? `${parsedSchema.page.size === "A4" ? "A4" : "Letter"} · ${parsedSchema.page.orientation}`
                        : "—"}
                    </dd>
                    <dt>Branding</dt>
                    <dd>Live snapshot</dd>
                  </dl>

                  <p className={styles.panelNote}>
                    <Info aria-hidden="true" />
                    <span>
                      Colours, logo and the payment accounts come from Branding. Changing
                      them there changes every document.
                    </span>
                  </p>

                  <h3 className={styles.panelSection}>Versions</h3>
                  <ul className={styles.versions}>
                    {versions.map((version) => {
                      const live = version.id === resolvedSelectedVersionId;
                      return (
                        <li
                          key={version.id}
                          className={styles.versionRow}
                          data-live={live ? "true" : "false"}
                        >
                          <span className={styles.versionNum}>v{version.version}</span>
                          <span style={{ flexGrow: 1, minWidth: 0 }}>
                            <span className={styles.versionWhen}>
                              {formatDay(
                                version.isPublished
                                  ? (version.publishedAt ?? version.createdAt)
                                  : version.createdAt,
                              )}
                            </span>
                            <span className={styles.versionWho}>
                              {version.isPublished ? "Published" : "Draft"}
                            </span>
                          </span>
                          {live ? (
                            <span
                              className={styles.pill}
                              data-tone={version.isPublished ? "success" : "warn"}
                            >
                              {version.isPublished ? "Live" : "Draft"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.rowBtn}
                              onClick={() => setSelectedVersionId(version.id)}
                            >
                              Restore
                            </button>
                          )}
                        </li>
                      );
                    })}
                    {versions.length === 0 ? (
                      <li className={styles.versionRow}>
                        <span className={styles.versionWhen}>No versions yet</span>
                      </li>
                    ) : null}
                  </ul>
                </aside>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- *
          New template
       * ---------------------------------------------------------------- */}
      {/* No board draws creation, so it follows the group's own create sheet —
          the same label-over-control stack and the same footer every other
          register in this surface opens. */}
      <CreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New template"
        submitLabel={createTemplateMutation.isPending ? "Creating…" : "Create template"}
        busy={
          createTemplateMutation.isPending ||
          !createDraft.name.trim() ||
          !createDraft.sourceOptionId
        }
        onSubmit={(event) => {
          event.preventDefault();
          createTemplateMutation.mutate();
        }}
      >
        <CreateField label="Name">
          {(id) => (
            <Input
              id={id}
              value={createDraft.name}
              className={DETAIL_CONTROL_CLASS}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          )}
        </CreateField>

        {/* The repo's searchable select, not the Popover+Command autocomplete
            this file used to carry its own copy of. Its own label is left off:
            `CreateField` already names it, at the surface's label rung. */}
        <CreateField label="Source">
          <SearchableSelect
            value={createDraft.sourceOptionId}
            options={sourceOptions.map((option) => ({
              value: option.id,
              label: option.label,
              description: option.description,
            }))}
            placeholder="Pick a source"
            searchPlaceholder="Search by name or key"
            onValueChange={(value) =>
              setCreateDraft((current) => ({ ...current, sourceOptionId: value }))
            }
          />
        </CreateField>

        <CreateField label="Default for this source">
          {(id) => (
            <DetailSelect
              id={id}
              value={createDraft.setDefault ? "yes" : "no"}
              onValueChange={(next) =>
                setCreateDraft((current) => ({ ...current, setDefault: next === "yes" }))
              }
            >
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </DetailSelect>
          )}
        </CreateField>
      </CreateSheet>

      {/* ---------------------------------------------------------------- *
          Edit blocks — the schema behind a version
       * ---------------------------------------------------------------- */}
      <Dialog open={schemaOpen && Boolean(selected)} onOpenChange={setSchemaOpen}>
        <DialogContent size="xl">
          <DialogTitle>{selected ? `${selected.name} — blocks` : "Blocks"}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose which blocks the document prints, then save a new version
          </DialogDescription>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              saveVersionMutation.mutate();
            }}
          >
            {/* Paper is the one field the record's Details block draws that is
                actually writable — it lives in the version schema, so it is
                changed the way every other block is, by saving a version. */}
            {parsedSchema ? (
              <DetailGrid className="mb-[22px]">
                <DetailRow label="Paper">
                  {(id) => (
                    <DetailSelect
                      id={id}
                      value={parsedSchema.page.size}
                      onValueChange={(next) =>
                        updateSchemaPage({ size: next as "A4" | "LETTER" })
                      }
                    >
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="LETTER">Letter</SelectItem>
                    </DetailSelect>
                  )}
                </DetailRow>
                <DetailRow label="Orientation">
                  {(id) => (
                    <DetailSelect
                      id={id}
                      value={parsedSchema.page.orientation}
                      onValueChange={(next) =>
                        updateSchemaPage({
                          orientation: next as "portrait" | "landscape",
                        })
                      }
                    >
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </DetailSelect>
                  )}
                </DetailRow>
              </DetailGrid>
            ) : null}

            {parsedSchema ? (
              <div className={styles.toggles}>
                {(
                  [
                    ["header", "showLogo", "Logo"],
                    ["header", "showSecondaryLogo", "Second logo"],
                    ["header", "showCompanyIdentity", "Company identity"],
                    ["header", "showContactBlock", "Contact block"],
                    ["table", "compact", "Compact table"],
                    ["table", "zebra", "Banded table rows"],
                    ["footer", "showFooterText", "Footer text"],
                    ["footer", "showDisclaimer", "Disclaimer"],
                    ["footer", "showPaymentDetails", "Payment details"],
                    ["footer", "showSignature", "Signature line"],
                    ["footer", "showStamp", "Stamp"],
                  ] as Array<[keyof DocumentTemplateSchema, string, string]>
                ).map(([section, key, label]) => {
                  const group = parsedSchema[section] as Record<string, unknown>;
                  const id = `schema-${section}-${key}`;
                  return (
                    <label key={id} className={styles.toggleRow} htmlFor={id}>
                      <span className={styles.toggleLabel}>{label}</span>
                      <Checkbox
                        id={id}
                        checked={Boolean(group[key])}
                        onCheckedChange={(next) =>
                          updateSchemaFlag(section, key, next === true)
                        }
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor="schema-json">Schema</label>
              <Textarea
                id="schema-json"
                className={styles.json}
                aria-invalid={parsedSchema ? undefined : true}
                value={effectiveSchemaJson}
                onChange={(event) => setSchemaJsonDraft(event.target.value)}
              />
            </div>

            <div className={styles.formFoot}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setSchemaOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saveVersionMutation.isPending || !parsedSchema}
              >
                {saveVersionMutation.isPending ? "Saving…" : "Save a new version"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}

const FULL_LOG_HREF = "/preferences/organization/activity";

/** The way back to the list below 900px, where the register shows one column. */
function BackToList({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 hidden items-center gap-2 text-[13px] font-medium leading-[1.4] text-[#565C69] max-[899px]:inline-flex"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Below 900px the register shows one column at a time; see the auto-pick note. */
function useWideViewport() {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return wide;
}
