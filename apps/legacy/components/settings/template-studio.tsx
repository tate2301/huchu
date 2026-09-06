"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Card, CardContent } from "@corelithzw/ui/components/card";
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
import {
  DEFAULT_TEMPLATE_CATALOG,
  type DefaultTemplateCatalogEntry,
} from "@/lib/documents/default-template-catalog";
import {
  defaultTemplateSchema,
  type DocumentTemplateSchema,
} from "@/lib/documents/template-schema";

type TemplateRow = {
  id: string;
  scope: "SYSTEM" | "COMPANY";
  sourceKey: string;
  documentType: string;
  targetType: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

type VersionRow = {
  id: string;
  version: number;
  schemaJson: string;
  isPublished: boolean;
};

const GROUPS: Array<{ id: string; title: string; match: (sourceKey: string) => boolean }> = [
  { id: "sales", title: "Sales Documents", match: (key) => key.startsWith("accounting.sales.") },
  { id: "reports", title: "Reports & Dashboards", match: (key) => key.startsWith("reports.") || key.startsWith("dashboard.") },
];

function groupEntries(): Array<{ id: string; title: string; entries: DefaultTemplateCatalogEntry[] }> {
  return GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    entries: DEFAULT_TEMPLATE_CATALOG.filter(
      (entry) => group.match(entry.sourceKey) && !entry.sourceKey.includes("*"),
    ),
  })).filter((group) => group.entries.length > 0);
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function TemplateStudio() {
  const queryClient = useQueryClient();
  const grouped = useMemo(() => groupEntries(), []);
  const [selectedKey, setSelectedKey] = useState<string>(grouped[0]?.entries[0]?.sourceKey ?? "");
  // User edits are stored as a draft keyed to the seed they were made against;
  // the effective schema falls back to the stored/catalog schema otherwise.
  // This avoids syncing state in an effect entirely.
  const [draft, setDraft] = useState<{ key: string; schema: DocumentTemplateSchema } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const entry = useMemo(
    () => DEFAULT_TEMPLATE_CATALOG.find((e) => e.sourceKey === selectedKey) ?? null,
    [selectedKey],
  );

  const templates = useQuery({
    queryKey: ["doc-templates"],
    queryFn: () => fetchJson<TemplateRow[]>("/api/document-templates"),
  });

  const companyTemplate = useMemo(
    () =>
      (templates.data ?? []).find(
        (t) => t.scope === "COMPANY" && t.sourceKey === selectedKey && t.isDefault && t.isActive,
      ) ?? null,
    [templates.data, selectedKey],
  );

  const versions = useQuery({
    queryKey: ["doc-template-versions", companyTemplate?.id],
    enabled: Boolean(companyTemplate?.id),
    queryFn: () => fetchJson<VersionRow[]>(`/api/document-templates/${companyTemplate?.id}/versions`),
  });

  const seedKey = `${selectedKey}:${companyTemplate?.id ?? "catalog"}`;
  const baseSchema = useMemo<DocumentTemplateSchema>(() => {
    if (!entry) return defaultTemplateSchema;
    const published = (versions.data ?? []).find((v) => v.isPublished) ?? (versions.data ?? [])[0];
    if (companyTemplate && published) {
      try {
        return { ...defaultTemplateSchema, ...(JSON.parse(published.schemaJson) as DocumentTemplateSchema) };
      } catch {
        return entry.schema;
      }
    }
    return entry.schema;
  }, [entry, companyTemplate, versions.data]);

  const schema = draft && draft.key === seedKey ? draft.schema : baseSchema;
  const dirty = Boolean(draft && draft.key === seedKey);

  // Debounced live preview.
  useEffect(() => {
    if (!selectedKey) return;
    const handle = setTimeout(() => {
      fetch("/api/document-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: selectedKey, schema }),
      })
        .then(async (res) => (res.ok ? res.text() : ""))
        .then((html) => setPreviewHtml(html))
        .catch(() => setPreviewHtml(""));
    }, 350);
    return () => clearTimeout(handle);
  }, [selectedKey, schema]);

  const save = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No document selected");
      let templateId = companyTemplate?.id;
      if (!templateId) {
        const created = await fetchJson<{ template: { id: string } }>("/api/document-templates", {
          method: "POST",
          body: JSON.stringify({
            name: entry.name.replace(" Default", ""),
            description: `Customized ${entry.name.replace(" Default", "").toLowerCase()} template`,
            sourceKey: entry.sourceKey,
            documentType: entry.documentType,
            targetType: entry.targetType,
            setDefault: true,
            cloneFromSystemDefault: true,
          }),
        });
        templateId = created.template.id;
      }
      const version = await fetchJson<{ id: string }>(`/api/document-templates/${templateId}/versions`, {
        method: "POST",
        body: JSON.stringify({ schemaJson: JSON.stringify(schema) }),
      });
      await fetchJson(`/api/document-templates/${templateId}/publish`, {
        method: "POST",
        body: JSON.stringify({ versionId: version.id }),
      });
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      queryClient.invalidateQueries({ queryKey: ["doc-templates"] });
      queryClient.invalidateQueries({ queryKey: ["doc-template-versions"] });
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  function patchSchema(patch: Partial<DocumentTemplateSchema>) {
    setDraft({ key: seedKey, schema: { ...schema, ...patch } });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_320px_1fr]">
      {/* Document list */}
      <Card className="h-fit">
        <CardContent className="p-2">
          {grouped.map((group) => (
            <div key={group.id} className="mb-3">
              <p className="px-2 py-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group.title}
              </p>
              {group.entries.map((e) => {
                const customized = (templates.data ?? []).some(
                  (t) => t.scope === "COMPANY" && t.sourceKey === e.sourceKey && t.isDefault && t.isActive,
                );
                const active = e.sourceKey === selectedKey;
                return (
                  <button
                    key={e.sourceKey}
                    onClick={() => setSelectedKey(e.sourceKey)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                      active ? "bg-[var(--sidebar-item-active-bg)] font-medium" : "hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <span>{e.name.replace(" Default", "")}</span>
                    {customized ? <Badge variant="outline">Custom</Badge> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="h-fit">
        <CardContent className="space-y-5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{entry?.name.replace(" Default", "") ?? "Template"}</p>
            <div className="flex items-center gap-2">
              {savedFlash ? <span className="text-sm text-green-600">Saved</span> : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => entry && setDraft({ key: seedKey, schema: entry.schema })}
              >
                Reset
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                Save & publish
              </Button>
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Page</p>
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={schema.page.size}
                onValueChange={(size) => patchSchema({ page: { ...schema.page, size: size as "A4" | "LETTER" } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="LETTER">Letter</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={schema.page.orientation}
                onValueChange={(orientation) =>
                  patchSchema({ page: { ...schema.page, orientation: orientation as "portrait" | "landscape" } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={5}
                max={40}
                value={schema.page.marginMm}
                onChange={(e) =>
                  patchSchema({ page: { ...schema.page, marginMm: Number(e.target.value || 10) } })
                }
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Header</p>
            <Toggle label="Company logo" checked={schema.header.showLogo} onChange={(v) => patchSchema({ header: { ...schema.header, showLogo: v } })} />
            <Toggle label="Secondary logo" checked={schema.header.showSecondaryLogo} onChange={(v) => patchSchema({ header: { ...schema.header, showSecondaryLogo: v } })} />
            <Toggle label="Company identity" checked={schema.header.showCompanyIdentity} onChange={(v) => patchSchema({ header: { ...schema.header, showCompanyIdentity: v } })} />
            <Toggle label="Contact details" checked={schema.header.showContactBlock} onChange={(v) => patchSchema({ header: { ...schema.header, showContactBlock: v } })} />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Line items</p>
            <Toggle label="Compact rows" checked={schema.table.compact} onChange={(v) => patchSchema({ table: { ...schema.table, compact: v } })} />
            <Toggle label="Zebra striping" checked={schema.table.zebra} onChange={(v) => patchSchema({ table: { ...schema.table, zebra: v } })} />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Footer</p>
            <Toggle label="Footer text" checked={schema.footer.showFooterText} onChange={(v) => patchSchema({ footer: { ...schema.footer, showFooterText: v } })} />
            <Toggle label="Legal disclaimer" checked={schema.footer.showDisclaimer} onChange={(v) => patchSchema({ footer: { ...schema.footer, showDisclaimer: v } })} />
            <Toggle label="Payment details" checked={schema.footer.showPaymentDetails} onChange={(v) => patchSchema({ footer: { ...schema.footer, showPaymentDetails: v } })} />
            <Toggle label="Signature" checked={schema.footer.showSignature} onChange={(v) => patchSchema({ footer: { ...schema.footer, showSignature: v } })} />
            <Toggle label="Stamp" checked={schema.footer.showStamp} onChange={(v) => patchSchema({ footer: { ...schema.footer, showStamp: v } })} />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Labels</p>
            <Label htmlFor="tpl-title" className="text-sm">Document title</Label>
            <Input
              id="tpl-title"
              value={schema.labels.documentTitle ?? ""}
              placeholder="Use default"
              onChange={(e) =>
                patchSchema({ labels: { ...schema.labels, documentTitle: e.target.value || undefined } })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardContent className="p-2">
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Live preview — sample data, your branding
            </p>
          </div>
          {previewHtml ? (
            <iframe
              title="Template preview"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[75vh] w-full rounded-lg border border-[var(--border)] bg-white"
            />
          ) : (
            <div className="flex h-[75vh] items-center justify-center text-sm text-[var(--text-muted)]">
              Rendering preview…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
