"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  DEFAULT_TEMPLATE_CATALOG,
  resolveCatalogTemplateEntry,
} from "@/lib/documents/default-template-catalog";
import {
  defaultTemplateSchema,
  type DocumentTemplateSchema,
  templateSchema,
} from "@/lib/documents/template-schema";
import { CheckIcon, ChevronDown } from "@/lib/icons";

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
};

type SourceOption = {
  id: string;
  label: string;
  description: string;
  sourceKey: string;
  documentType: DocumentType;
  targetType: ExportTargetType;
};

type Option = {
  id: string;
  label: string;
  description?: string;
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

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
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

function AutocompleteField({
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Option[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => {
      const source = `${option.label} ${option.id} ${option.description ?? ""}`;
      return source.toLowerCase().includes(normalized);
    });
  }, [options, query]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold">{label}</label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className={selected ? "text-foreground" : "text-muted-foreground"}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
            <CommandList>
              {filteredOptions.length === 0 ? (
                <CommandEmpty>No options found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredOptions.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={`${option.label} ${option.id} ${option.description ?? ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => {
                        onChange(option.id);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{option.label}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {option.id}
                        </div>
                        {option.description ? (
                          <div className="truncate text-xs text-muted-foreground">{option.description}</div>
                        ) : null}
                      </div>
                      {value === option.id ? <CheckIcon className="h-4 w-4 text-primary" /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function TemplateSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    name: "",
    sourceOptionId: "",
    setDefault: true,
  });

  const [editTemplate, setEditTemplate] = useState<TemplateRow | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [schemaJsonDraft, setSchemaJsonDraft] = useState("");

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
    queryKey: ["document-template-versions", editTemplate?.id],
    enabled: Boolean(editTemplate?.id),
    queryFn: async () => {
      const response = await fetch(`/api/document-templates/${editTemplate!.id}/versions`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load template versions");
      return payload as TemplateVersion[];
    },
  });

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);
  const versionOptions = useMemo<Option[]>(
    () =>
      versions.map((version) => ({
        id: version.id,
        label: `v${version.version}${version.isPublished ? " (Published)" : ""}`,
        description: `Created ${formatTimestamp(version.createdAt)}`,
      })),
    [versions],
  );

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
      setCreateDialogOpen(false);
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
      if (!editTemplate) throw new Error("No template selected");
      const parsed = tryParseSchemaStrict(effectiveSchemaJson);
      if (!parsed) throw new Error("Invalid schema JSON");

      const response = await fetch(`/api/document-templates/${editTemplate.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaJson: JSON.stringify(parsed) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to save template version");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", editTemplate?.id] });
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
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
    mutationFn: async () => {
      if (!editTemplate || !resolvedSelectedVersionId) throw new Error("Select a version to publish");
      const response = await fetch(`/api/document-templates/${editTemplate.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: resolvedSelectedVersionId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to publish template version");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", editTemplate?.id] });
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

  const openCreateDialog = (prefill?: TemplateRow) => {
    if (!prefill) {
      setCreateDraft({ name: "", sourceOptionId: "", setDefault: true });
      setCreateDialogOpen(true);
      return;
    }

    const optionId = buildSourceOptionId(prefill.sourceKey, prefill.documentType, prefill.targetType);
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
      name: `${prefill.name} Override`,
      sourceOptionId: sourceOption.id,
      setDefault: true,
    });
    setCreateDialogOpen(true);
  };

  const openEditDialog = (template: TemplateRow) => {
    setEditTemplate(template);
    setSelectedVersionId(null);
    setSchemaJsonDraft(JSON.stringify(defaultTemplateSchema, null, 2));
  };

  const closeEditDialog = () => {
    setEditTemplate(null);
    setSelectedVersionId(null);
    setSchemaJsonDraft("");
  };

  const updateSchemaFlag = (
    section: keyof DocumentTemplateSchema,
    key: string,
    checked: boolean,
  ) => {
    if (!parsedSchema) return;
    const next = {
      ...parsedSchema,
      [section]: {
        ...parsedSchema[section],
        [key]: checked,
      },
    };
    setSchemaJsonDraft(JSON.stringify(next, null, 2));
  };

  const columns: ColumnDef<TemplateRow>[] = [
      {
        id: "name",
        header: "Template",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-semibold">{row.original.name}</div>
            {row.original.description ? (
              <p className="text-xs text-muted-foreground">{row.original.description}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => {
          const source = row.original.sourceKey;
          const catalog = resolveCatalogTemplateEntry({
            sourceKey: row.original.sourceKey,
            documentType: row.original.documentType,
            targetType: row.original.targetType,
          });

          return (
            <div className="space-y-1">
              <div className="font-medium">{catalog?.name ?? toSourceLabel(source)}</div>
              <div className="font-mono text-xs text-muted-foreground">{source}</div>
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{toDocumentTypeLabel(row.original.documentType)}</Badge>
            <Badge variant="secondary">{toTargetTypeLabel(row.original.targetType)}</Badge>
          </div>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge variant={row.original.scope === "SYSTEM" ? "outline" : "secondary"}>
            {row.original.scope}
          </Badge>
        ),
      },
      {
        id: "default",
        header: "Default",
        cell: ({ row }) =>
          row.original.isDefault ? <Badge>Default</Badge> : <span className="text-muted-foreground">No</span>,
      },
      {
        id: "version",
        header: "Latest Version",
        cell: ({ row }) => {
          const latest = row.original.versions[0];
          if (!latest) return <span className="text-muted-foreground">N/A</span>;
          return (
            <div className="space-y-1">
              <div className="font-mono text-xs">v{latest.version}</div>
              <Badge variant={latest.isPublished ? "secondary" : "outline"}>
                {latest.isPublished ? "Published" : "Draft"}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "updated",
        header: "Updated",
        cell: ({ row }) => <span className="font-mono text-xs">{formatTimestamp(row.original.updatedAt)}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    createTemplateMutation.isPending ||
                    saveVersionMutation.isPending ||
                    publishMutation.isPending ||
                    setDefaultMutation.isPending
                  }
                >
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {row.original.scope === "COMPANY" ? (
                  <>
                    <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                      Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDefaultMutation.mutate(row.original.id)}>
                      Set as Default
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={() => openCreateDialog(row.original)}>
                    Create Company Override
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Document Templates"
        description="Manage branded export templates with dialog-based create and edit flows."
      />

      {templatesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load templates</AlertTitle>
          <AlertDescription>{(templatesQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={templates}
        columns={columns}
        queryState={queryState}
        onQueryStateChange={(next) =>
          setQueryState((current) => ({
            ...current,
            ...next,
          }))
        }
        features={{ sorting: false, globalFilter: true, pagination: true }}
        pagination={{ enabled: true }}
        searchPlaceholder="Search templates by name, source, or type"
        searchSubmitLabel="Search"
        tableClassName="text-sm"
        noResultsText={templatesQuery.isLoading ? "Loading templates..." : "No templates found."}
        toolbar={
          <>
            <Badge variant="outline">{templates.length} Templates</Badge>
            <Button type="button" size="sm" onClick={() => openCreateDialog()}>
              New Template
            </Button>
          </>
        }
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a company template from source defaults. Source options use id and label mapping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Template Name</label>
              <Input
                value={createDraft.name}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Template name"
              />
            </div>

            <AutocompleteField
              label="Source"
              value={createDraft.sourceOptionId || null}
              options={sourceOptions.map((option) => ({
                id: option.id,
                label: option.label,
                description: option.description,
              }))}
              placeholder="Select source"
              searchPlaceholder="Search source by label or id"
              onChange={(id) =>
                setCreateDraft((current) => ({
                  ...current,
                  sourceOptionId: id,
                }))
              }
            />

            <div className="rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Source Mapping
              </p>
              {createSourceOption ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium">{createSourceOption.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{createSourceOption.sourceKey}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">{toDocumentTypeLabel(createSourceOption.documentType)}</Badge>
                    <Badge variant="secondary">{toTargetTypeLabel(createSourceOption.targetType)}</Badge>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Pick a source option to continue.</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createDraft.setDefault}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    setDefault: event.target.checked,
                  }))
                }
              />
              Mark as default for this source
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                createTemplateMutation.isPending ||
                !createDraft.name.trim() ||
                !createDraft.sourceOptionId
              }
              onClick={() => createTemplateMutation.mutate()}
            >
              {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editTemplate)}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Save a new schema version, then publish and set default when ready.
            </DialogDescription>
          </DialogHeader>

          {editTemplate ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-semibold">{editTemplate.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{editTemplate.sourceKey}</p>
              </div>

              <AutocompleteField
                label="Version"
                value={resolvedSelectedVersionId}
                options={versionOptions}
                placeholder="Select version"
                searchPlaceholder="Search version"
                disabled={versionsQuery.isLoading || versions.length === 0}
                onChange={(id) => {
                  setSelectedVersionId(id);
                  const nextVersion = versions.find((version) => version.id === id);
                  if (nextVersion) {
                    setSchemaJsonDraft(nextVersion.schemaJson);
                  }
                }}
              />

              {versionsQuery.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to load versions</AlertTitle>
                  <AlertDescription>{(versionsQuery.error as Error).message}</AlertDescription>
                </Alert>
              ) : null}

              {parsedSchema ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.header.showLogo}
                      onChange={(event) =>
                        updateSchemaFlag("header", "showLogo", event.target.checked)
                      }
                    />
                    Show Logo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.header.showSecondaryLogo}
                      onChange={(event) =>
                        updateSchemaFlag("header", "showSecondaryLogo", event.target.checked)
                      }
                    />
                    Show Secondary Logo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.header.showCompanyIdentity}
                      onChange={(event) =>
                        updateSchemaFlag("header", "showCompanyIdentity", event.target.checked)
                      }
                    />
                    Show Company Identity
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.header.showContactBlock}
                      onChange={(event) =>
                        updateSchemaFlag("header", "showContactBlock", event.target.checked)
                      }
                    />
                    Show Contact Block
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.table.compact}
                      onChange={(event) => updateSchemaFlag("table", "compact", event.target.checked)}
                    />
                    Compact Table
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.table.zebra}
                      onChange={(event) => updateSchemaFlag("table", "zebra", event.target.checked)}
                    />
                    Zebra Table
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.footer.showFooterText}
                      onChange={(event) =>
                        updateSchemaFlag("footer", "showFooterText", event.target.checked)
                      }
                    />
                    Show Footer Text
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.footer.showDisclaimer}
                      onChange={(event) =>
                        updateSchemaFlag("footer", "showDisclaimer", event.target.checked)
                      }
                    />
                    Show Disclaimer
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.footer.showPaymentDetails}
                      onChange={(event) =>
                        updateSchemaFlag("footer", "showPaymentDetails", event.target.checked)
                      }
                    />
                    Show Payment Details
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.footer.showSignature}
                      onChange={(event) =>
                        updateSchemaFlag("footer", "showSignature", event.target.checked)
                      }
                    />
                    Show Signature
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={parsedSchema.footer.showStamp}
                      onChange={(event) =>
                        updateSchemaFlag("footer", "showStamp", event.target.checked)
                      }
                    />
                    Show Stamp
                  </label>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>Invalid JSON</AlertTitle>
                  <AlertDescription>
                    Template JSON is invalid. Fix it before saving a new version.
                  </AlertDescription>
                </Alert>
              )}

              <Textarea
                className="min-h-[260px] font-mono text-xs"
                value={effectiveSchemaJson}
                onChange={(event) => setSchemaJsonDraft(event.target.value)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditDialog}>
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saveVersionMutation.isPending || !editTemplate}
              onClick={() => saveVersionMutation.mutate()}
            >
              {saveVersionMutation.isPending ? "Saving..." : "Save New Version"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={publishMutation.isPending || !editTemplate || !resolvedSelectedVersionId}
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? "Publishing..." : "Publish Selected"}
            </Button>
            <Button
              type="button"
              disabled={setDefaultMutation.isPending || !editTemplate || editTemplate.scope !== "COMPANY"}
              onClick={() => {
                if (!editTemplate) return;
                setDefaultMutation.mutate(editTemplate.id);
              }}
            >
              {setDefaultMutation.isPending ? "Updating..." : "Set Default"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
