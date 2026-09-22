"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Switch } from "@corelithzw/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BLOCK_LABELS,
  TEMPLATE_KIND_LABELS,
  type TemplateKind,
} from "@/lib/crm/blocks";
import {
  DEFAULT_TEMPLATE_CATALOG,
  type DefaultTemplateCatalogEntry,
} from "@/lib/documents/default-template-catalog";
import {
  defaultTemplateSchema,
  type DocumentTemplateSchema,
} from "@/lib/documents/template-schema";
import { BarChart3, DotsThree, FileText, Info, Pencil, TableRows } from "@/lib/icons";

import styles from "./template-studio.module.css";

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

/**
 * What kind of document each catalogue entry produces, in the vocabulary the
 * rest of the product uses for templates (`lib/crm/blocks.ts`).
 *
 * A dashboard pack and a generic record are not one of those kinds, and the
 * inspector says so by falling back to the entry's own name rather than
 * inventing a kind for them.
 */
const KIND_FOR_DOCUMENT_TYPE: Partial<Record<DefaultTemplateCatalogEntry["documentType"], TemplateKind>> = {
  SALES_INVOICE: "INVOICE",
  SALES_QUOTATION: "QUOTE",
  SALES_RECEIPT: "RECEIPT",
  REPORT_TABLE: "EXPORT",
};

/** The proportion of the sheet on the stage, from the paper it will print on. */
const PAPER_RATIO: Record<DocumentTemplateSchema["page"]["size"], number> = {
  A4: 210 / 297,
  LETTER: 8.5 / 11,
};

function entryTitle(entry: DefaultTemplateCatalogEntry): string {
  return entry.name.replace(" Default", "");
}

function PaletteIcon({ entry }: { entry: DefaultTemplateCatalogEntry }) {
  if (entry.documentType === "DASHBOARD_PACK") return <BarChart3 aria-hidden="true" />;
  if (entry.documentType === "REPORT_TABLE") return <TableRows aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel}>{label}</span>
      <Switch
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

/**
 * The document template studio — `TemplateBuilder.dc.html`.
 *
 * One 60px header over three columns: the documents the system prints, the
 * document itself on its scrim as `TemplateRender.dc.html` draws it, and the
 * settings of whichever one is selected. The title in the header is the title
 * the document will carry, edited in place with its pencil, so the header
 * names the thing rather than labelling a box at the bottom of a form.
 *
 * Presentation only: every query key, endpoint and mutation below is the one
 * that was here before.
 */
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
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState("");

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
      queryClient.invalidateQueries({ queryKey: ["doc-templates"] });
      queryClient.invalidateQueries({ queryKey: ["doc-template-versions"] });
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  function patchSchema(patch: Partial<DocumentTemplateSchema>) {
    setDraft({ key: seedKey, schema: { ...schema, ...patch } });
  }

  const title = schema.labels.documentTitle?.trim() || (entry ? entryTitle(entry) : "Template");
  const kind = entry ? KIND_FOR_DOCUMENT_TYPE[entry.documentType] : undefined;
  const landscape = schema.page.orientation === "landscape";
  const ratio = landscape ? 1 / PAPER_RATIO[schema.page.size] : PAPER_RATIO[schema.page.size];
  // Rule 9: nothing to reset to is nothing to offer.
  const changedFromDefault =
    entry !== null && JSON.stringify(schema) !== JSON.stringify(entry.schema);

  function commitRename() {
    const next = rename.trim();
    setRenaming(false);
    if (next === (schema.labels.documentTitle ?? "")) return;
    patchSchema({ labels: { ...schema.labels, documentTitle: next || undefined } });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.head}>
        <span className={styles.titleGroup}>
          {renaming ? (
            <input
              autoFocus
              aria-label="Document title"
              className={styles.titleInput}
              value={rename}
              onChange={(event) => setRename(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <>
              {/* Rule 8: clicking either the title or the pencil opens it. */}
              <h1 className={styles.title}>
                <button
                  type="button"
                  className={styles.titleButton}
                  onClick={() => {
                    setRename(schema.labels.documentTitle ?? "");
                    setRenaming(true);
                  }}
                >
                  {title}
                </button>
              </h1>
              <button
                type="button"
                aria-label="Rename this document"
                className={styles.pencil}
                onClick={() => {
                  setRename(schema.labels.documentTitle ?? "");
                  setRenaming(true);
                }}
              >
                <Pencil aria-hidden="true" />
              </button>
            </>
          )}
        </span>

        {/* Rule 5: the chip marks the exception — edits nobody has published
            yet. A document that matches what is published draws nothing. */}
        {dirty ? <span className={styles.draft}>Draft</span> : null}

        <span className={styles.spacer} />

        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Publishing…" : "Publish"}
        </button>

        {/* Rule 3: the rare verb lives in the overflow — and rule 9, the
            overflow itself goes when there is nothing in it. */}
        {changedFromDefault ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More actions" className={styles.iconBtn}>
                <DotsThree aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => entry && setDraft({ key: seedKey, schema: entry.schema })}
              >
                Reset to the system default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div className={styles.body}>
        <div className={styles.palette}>
          <h2 className={styles.paletteTitle}>Documents</h2>

          {grouped.map((group) => (
            <div key={group.id} className={styles.paletteSection}>
              <p className={styles.paletteGroup}>{group.title}</p>
              {group.entries.map((e) => {
                const customized = (templates.data ?? []).some(
                  (t) => t.scope === "COMPANY" && t.sourceKey === e.sourceKey && t.isDefault && t.isActive,
                );
                return (
                  <button
                    key={e.sourceKey}
                    type="button"
                    className={styles.paletteItem}
                    aria-current={e.sourceKey === selectedKey ? "true" : undefined}
                    onClick={() => setSelectedKey(e.sourceKey)}
                  >
                    <PaletteIcon entry={e} />
                    <span className={styles.paletteLabel}>{entryTitle(e)}</span>
                    {customized ? <span className={styles.paletteMark}>Custom</span> : null}
                  </button>
                );
              })}
            </div>
          ))}

          <p className={styles.paletteFoot}>
            <span className={styles.paletteFootMark} aria-hidden="true">
              {"{}"}
            </span>
            DEFAULT_TEMPLATE_CATALOG
          </p>
        </div>

        <div className={styles.stage}>
          {/* The sheet is drawn whether or not the render has come back: a
              blank page is what a document being rendered looks like, and it
              does not move the stage when the paint arrives. */}
          <div
            className={styles.sheet}
            style={
              {
                "--sheet-ratio": `${ratio}`,
                "--sheet-width": landscape ? "760px" : "540px",
              } as CSSProperties
            }
          >
            {previewHtml ? (
              <iframe
                title={`${title} preview`}
                sandbox=""
                srcDoc={previewHtml}
                className={styles.sheetFrame}
              />
            ) : null}
          </div>
        </div>

        <div className={styles.inspector}>
          <div className={styles.inspectorHead}>
            <span className={styles.inspectorTile} aria-hidden="true">
              <FileText />
            </span>
            <h2 className={styles.inspectorTitle}>
              {kind ? TEMPLATE_KIND_LABELS[kind] : entry ? entryTitle(entry) : "Template"}
            </h2>
          </div>

          {error ? <p className={styles.failure}>{error}</p> : null}

          <h3 className={styles.group}>Paper</h3>

          <div className={styles.field}>
            <label htmlFor="tpl-size">Size</label>
            <Select
              value={schema.page.size}
              onValueChange={(size) => patchSchema({ page: { ...schema.page, size: size as "A4" | "LETTER" } })}
            >
              <SelectTrigger id="tpl-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="LETTER">Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={styles.field}>
            <label htmlFor="tpl-orientation">Orientation</label>
            <Select
              value={schema.page.orientation}
              onValueChange={(orientation) =>
                patchSchema({ page: { ...schema.page, orientation: orientation as "portrait" | "landscape" } })
              }
            >
              <SelectTrigger id="tpl-orientation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={styles.field}>
            <label htmlFor="tpl-margin">Margin (mm)</label>
            <Input
              id="tpl-margin"
              type="number"
              min={5}
              max={40}
              value={schema.page.marginMm}
              onChange={(e) =>
                patchSchema({ page: { ...schema.page, marginMm: Number(e.target.value || 10) } })
              }
            />
          </div>

          <h3 className={styles.group}>Header</h3>
          <div className={styles.switchGroup}>
            <SwitchRow
              label="Company logo"
              checked={schema.header.showLogo}
              onChange={(v) => patchSchema({ header: { ...schema.header, showLogo: v } })}
            />
            <SwitchRow
              label="Secondary logo"
              checked={schema.header.showSecondaryLogo}
              onChange={(v) => patchSchema({ header: { ...schema.header, showSecondaryLogo: v } })}
            />
            <SwitchRow
              label="Company identity"
              checked={schema.header.showCompanyIdentity}
              onChange={(v) => patchSchema({ header: { ...schema.header, showCompanyIdentity: v } })}
            />
            <SwitchRow
              label="Contact details"
              checked={schema.header.showContactBlock}
              onChange={(v) => patchSchema({ header: { ...schema.header, showContactBlock: v } })}
            />
          </div>

          {/* The block's own name, so the studio and the builder call the
              same thing by the same word. */}
          <h3 className={styles.group}>{BLOCK_LABELS.lineItems}</h3>
          <div className={styles.switchGroup}>
            <SwitchRow
              label="Compact rows"
              checked={schema.table.compact}
              onChange={(v) => patchSchema({ table: { ...schema.table, compact: v } })}
            />
            <SwitchRow
              label="Striped rows"
              checked={schema.table.zebra}
              onChange={(v) => patchSchema({ table: { ...schema.table, zebra: v } })}
            />
          </div>

          <h3 className={styles.group}>Footer</h3>
          <div className={styles.switchGroup}>
            <SwitchRow
              label="Footer text"
              checked={schema.footer.showFooterText}
              onChange={(v) => patchSchema({ footer: { ...schema.footer, showFooterText: v } })}
            />
            <SwitchRow
              label={BLOCK_LABELS.terms}
              checked={schema.footer.showDisclaimer}
              onChange={(v) => patchSchema({ footer: { ...schema.footer, showDisclaimer: v } })}
            />
            <SwitchRow
              label="Payment details"
              checked={schema.footer.showPaymentDetails}
              onChange={(v) => patchSchema({ footer: { ...schema.footer, showPaymentDetails: v } })}
            />
            <SwitchRow
              label={BLOCK_LABELS.signature}
              checked={schema.footer.showSignature}
              onChange={(v) => patchSchema({ footer: { ...schema.footer, showSignature: v } })}
            />
            <SwitchRow
              label="Stamp"
              checked={schema.footer.showStamp}
              onChange={(v) => patchSchema({ footer: { ...schema.footer, showStamp: v } })}
            />
          </div>

          <p className={styles.note}>
            <Info aria-hidden="true" />
            <span>
              Colours, the logo and the payment accounts come from Branding. Changing them
              there changes every document.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
