"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BuilderBar, BuilderGrid, BuilderInspector, BuilderOutline, type BlockKind, type BuilderMode } from "@/components/builder/grid";
import { Button, Check, Field, Icon, Input, Select, Setting, Switch, TextArea, type IconName } from "@/components/core";
import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { layoutUse } from "@/lib/build/items";
import { DEFAULT_TEMPLATE_CATALOG, resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";
import { isPayslipRowPart, newPayslipRow, PAYSLIP_ROW_SOURCES, payslipRowSourceLabel } from "@/lib/documents/payslip-rows";
import { defaultTemplateSchema, templateSchema, type DocumentTemplateSchema } from "@/lib/documents/template-schema";

import { BuilderError, BuilderLoading, BuilderMessage } from "./builder-states";
import { useBuilderKeys } from "./use-builder-keys";
import { useStartBuild } from "./use-start";

type LayoutRow = {
  id: string;
  name: string;
  description: string | null;
  sourceKey: string;
  documentType: string;
  targetType: string;
  scope: "SYSTEM" | "COMPANY";
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
};

type Version = { id: string; version: number; schemaJson: string; isPublished: boolean; createdAt: string; publishedAt?: string | null };

/** What the layout's outline lists: the parts of the printed page, and which settings each has. */
type Element = "page" | "header" | "labels" | "table" | "totals" | "leave" | "footer" | "notes";
type Part = { id: string; label: string; icon: IconName; element: Element; rows?: string };

const ELEMENT_ICON: Record<Element, IconName> = { page: "docs", header: "ws", labels: "sentence", table: "tablegrid", totals: "figure", leave: "sun", footer: "pen", notes: "docs" };

/**
 * The parts a source's document is made of, in the order they print. The
 * payslip says what it holds (`lib/documents/hr-sources.ts`); every other
 * source prints the letterhead, its title and labels, its table and its foot.
 */
export function layoutParts(sourceKey: string): Part[] {
  const page: Part = { id: "page", label: "Page", icon: ELEMENT_ICON.page, element: "page" };
  const letterhead: Part = { id: "letterhead", label: "Letterhead", icon: ELEMENT_ICON.header, element: "header" };
  const foot: Part = { id: "footer", label: "Footer and signature", icon: ELEMENT_ICON.footer, element: "footer" };
  if (sourceKey === "hr.payslip") {
    return [
      page,
      letterhead,
      { id: "employee", label: "Employee and period", icon: "person", element: "labels" },
      { id: "earnings", label: "Earnings", icon: ELEMENT_ICON.table, element: "table", rows: "The run line’s earnings" },
      { id: "deductions", label: "Deductions", icon: ELEMENT_ICON.table, element: "table", rows: "The run line’s deductions" },
      { id: "net", label: "Net pay", icon: ELEMENT_ICON.totals, element: "totals", rows: "Gross, deductions and net, from the run line" },
      { id: "leave", label: "Leave left", icon: ELEMENT_ICON.leave, element: "leave", rows: "The employee’s leave, as at the period’s end" },
      { id: "employer", label: "Employer paid", icon: "inspections", element: "table", rows: "What the company paid on their behalf" },
      { id: "notes", label: "Notes", icon: ELEMENT_ICON.notes, element: "notes" },
      foot,
    ];
  }
  return [
    page,
    letterhead,
    { id: "labels", label: "Title and labels", icon: ELEMENT_ICON.labels, element: "labels" },
    { id: "table", label: "Table", icon: ELEMENT_ICON.table, element: "table", rows: "The record’s lines" },
    { id: "totals", label: "Totals", icon: ELEMENT_ICON.totals, element: "totals" },
    foot,
  ];
}

const parseSchema = (json: string | null | undefined): DocumentTemplateSchema | null => {
  if (!json) return null;
  try {
    const parsed = templateSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * A printed layout in Build (PageTemplatePayslip): the versioned document
 * template every PDF of its source is drawn with — moved here from
 * Management. The outline lists the parts of the page; the page is the
 * document rendered with the workspace's branding and a sample record; the
 * inspector sets the selected part, shows what fills it (Data, and the schema
 * itself), and holds its versions, default and activity. Publish saves a new
 * version and publishes it; Ctrl S saves a version without publishing it.
 * Corelith's own (and the system's) open read-only, with Use this template.
 */
export function LayoutBuilder({ id }: { id: string }) {
  const catalog = DEFAULT_TEMPLATE_CATALOG.find((entry) => entry.key === id) ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const layouts = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => fetchJson<LayoutRow[]>("/api/document-templates"),
    enabled: !catalog,
  });
  const row = layouts.data?.find((entry) => entry.id === id) ?? null;
  const versions = useQuery({
    queryKey: ["document-template-versions", id],
    queryFn: () => fetchJson<Version[]>(`/api/document-templates/${encodeURIComponent(id)}/versions`),
    enabled: Boolean(row),
  });

  const live = versions.data?.find((version) => version.isPublished) ?? versions.data?.[0] ?? null;
  const base = catalog ? catalog.schema : (parseSchema(live?.schemaJson) ?? defaultTemplateSchema);
  const [draft, setDraft] = React.useState<{ from: string; schema: DocumentTemplateSchema } | null>(null);
  const baseKey = catalog ? `catalog:${catalog.key}` : live ? `version:${live.id}` : "none";
  const schema = draft && draft.from === baseKey ? draft.schema : base;
  const dirty = Boolean(draft && draft.from === baseKey && JSON.stringify(draft.schema) !== JSON.stringify(base));
  const readOnly = Boolean(catalog) || row?.scope === "SYSTEM";

  const saveVersion = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const created = await fetchJson<{ id: string; version: number }>(`/api/document-templates/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        body: JSON.stringify({ schemaJson: JSON.stringify(schema) }),
      });
      if (publish) {
        await fetchJson(`/api/document-templates/${encodeURIComponent(id)}/publish`, { method: "POST", body: JSON.stringify({ versionId: created.id }) });
      }
      return { publish, version: created.version };
    },
    onSuccess: async ({ publish, version }) => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", id] });
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: publish ? `Version ${version} published` : `Version ${version} saved`, description: publish ? undefined : "Publish it when it is ready.", variant: "success" });
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const publishVersion = useMutation({
    mutationFn: (versionId: string) => fetchJson(`/api/document-templates/${encodeURIComponent(id)}/publish`, { method: "POST", body: JSON.stringify({ versionId }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", id] });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: "Version published", variant: "success" });
    },
    onError: (failure) => toast({ title: "Not published", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const setDefault = useMutation({
    mutationFn: () => fetchJson(`/api/document-templates/${encodeURIComponent(id)}/set-default`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: "Now the default", description: "Every document of its kind prints with it.", variant: "success" });
    },
    onError: (failure) => toast({ title: "Not changed", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const start = useStartBuild([]);
  const sourceKey = catalog?.sourceKey ?? row?.sourceKey ?? "";
  const back = useBuilderKeys({ dirty, onSave: () => !readOnly && dirty && saveVersion.mutate({ publish: false }), backHref: "/build/templates?view=made" });

  if (!catalog && layouts.isError) return <BuilderError what="This template" onRetry={() => void layouts.refetch()} error={layouts.error} backHref="/build/templates" />;
  if (!catalog && layouts.data && !row) {
    return (
      <BuilderMessage backHref="/build/templates">
        <p className="muted">That template is not here. It may belong to another workspace.</p>
      </BuilderMessage>
    );
  }
  if (!catalog && (!row || !versions.data)) return <BuilderLoading scope="layout" />;

  const name = catalog ? catalog.name.replace(/ Default$/, "") : row!.name;
  const documentType = catalog?.documentType ?? row!.documentType;
  const use = layoutUse(sourceKey, documentType);

  return (
    <LayoutBuilderView
      name={name}
      role={`Document template, ${row?.isDefault || (catalog && !row) ? "the default" : "used"} for ${use.toLowerCase()}`}
      sourceKey={sourceKey}
      schema={schema}
      onSchema={(next) => setDraft({ from: baseKey, schema: next })}
      readOnly={readOnly}
      onBack={back}
      saved={saveVersion.isPending ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: null }}
      onPublish={() => saveVersion.mutate({ publish: true })}
      publishing={saveVersion.isPending}
      onUse={
        readOnly
          ? () =>
              start.mutate({
                type: "layout",
                sourceKey,
                documentType,
                targetType: catalog?.targetType ?? row!.targetType,
                name,
              })
          : undefined
      }
      using={start.isPending}
      settings={
        <>
          <h2>The template</h2>
          <div className="prow">
            <b>Name</b>
            <span>{name}</span>
          </div>
          <div className="prow">
            <b>Issued for</b>
            <span>{resolveCatalogTemplateEntry({ sourceKey, documentType: documentType as never, targetType: (catalog?.targetType ?? row?.targetType ?? "RECORD") as never })?.name.replace(/ Default$/, "") ?? use}</span>
          </div>
          <div className="prow">
            <b>Source</b>
            <span className="mono">{sourceKey}</span>
          </div>
          <div className="prow">
            <b>Kept by</b>
            <span>{catalog || row?.scope === "SYSTEM" ? "Corelith" : "This workspace"}</span>
          </div>
          {row && row.scope === "COMPANY" ? (
            <Setting
              title="The default"
              description={row.isDefault ? `Every ${use.toLowerCase().replace(/s$/, "")} prints with it` : "Another template is the default"}
              control={
                row.isDefault ? (
                  <span className="status status-info">Default</span>
                ) : (
                  <Button busy={setDefault.isPending} onClick={() => setDefault.mutate()}>
                    Set as the default
                  </Button>
                )
              }
            />
          ) : null}
          {row ? (
            <div className="pl">
              <div className="pl-h">Versions</div>
              {(versions.data ?? []).map((version) => (
                <div key={version.id} className="prow">
                  <b>
                    v{version.version} · {version.isPublished ? `Published ${day(version.publishedAt ?? version.createdAt)}` : `Saved ${day(version.createdAt)}`}
                  </b>
                  <span>
                    {version.id === live?.id ? (
                      <span className={version.isPublished ? "status status-success" : "status status-warn"}>{version.isPublished ? "Live" : "Draft"}</span>
                    ) : readOnly ? null : (
                      <>
                        <Button size="sm" variant="quiet" onClick={() => setDraft({ from: baseKey, schema: parseSchema(version.schemaJson) ?? defaultTemplateSchema })}>
                          Restore
                        </Button>
                        {!version.isPublished ? (
                          <Button size="sm" variant="quiet" busy={publishVersion.isPending} onClick={() => publishVersion.mutate(version.id)}>
                            Publish
                          </Button>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="rb-note">Colours, the logo and the payment accounts come from Branding. Changing them there changes every document.</p>
          {row ? <RecordActivityTrail entityType="DocumentTemplate" entityId={row.id} fullLogHref="/activity?view=workspace" /> : null}
        </>
      }
    />
  );
}

/**
 * A printed layout on the builder's grid. Pure: the page loads and saves it —
 * a workspace's template through its API, or a library item in the admin
 * portal, whose preview is drawn by the portal's own route (`previewUrl`).
 */
export function LayoutBuilderView({
  name,
  role,
  sourceKey,
  schema,
  onSchema,
  readOnly,
  onBack,
  saved,
  onPublish,
  publishing = false,
  onUse,
  using = false,
  settings,
  previewUrl = "/api/document-templates/preview",
  readOnlyNote = "This is Corelith's. Use this template to make your own copy and change it.",
  framed = false,
}: {
  name: string;
  role: string;
  sourceKey: string;
  schema: DocumentTemplateSchema;
  onSchema: (schema: DocumentTemplateSchema) => void;
  readOnly: boolean;
  onBack?: () => void;
  saved?: React.ComponentProps<typeof BuilderBar>["saved"];
  /** Left out, with no `onUse`, the bar has no primary: the page around the builder publishes it. */
  onPublish?: () => void;
  publishing?: boolean;
  onUse?: () => void;
  using?: boolean;
  settings: React.ReactNode;
  /** Where the page is drawn: POST `{ sourceKey, schema }`, answered with HTML. */
  previewUrl?: string;
  readOnlyNote?: string;
  /** Fills the frame it is put in rather than the window (the admin portal's library). */
  framed?: boolean;
}) {
  const parts = React.useMemo(() => layoutParts(sourceKey), [sourceKey]);
  const [mode, setMode] = React.useState<BuilderMode>("build");
  const [tab, setTab] = React.useState<"element" | "data" | "settings">("element");
  const [selectedId, setSelectedId] = React.useState<string>(parts.find((part) => part.label === "Deductions")?.id ?? parts[1]?.id ?? "page");
  const selected = parts.find((part) => part.id === selectedId) ?? parts[0]!;
  const [json, setJson] = React.useState<string | null>(null);

  // The page as it prints: rendered by the server with this workspace's branding and a sample record.
  const [rendered, setRendered] = React.useState<{ html: string | null; failed: boolean; of?: string | null }>({ html: null, failed: false });
  const schemaJson = JSON.stringify(schema);
  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(previewUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceKey, schema: JSON.parse(schemaJson) }) })
        .then(async (response) => {
          if (!response.ok) throw new Error("preview");
          const html = await response.text();
          const of = response.headers.get("X-Preview-Of");
          if (!cancelled) setRendered({ html, failed: false, of: of ? decodeURIComponent(of) : null });
        })
        .catch(() => !cancelled && setRendered((current) => ({ ...current, failed: true })));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [schemaJson, sourceKey, previewUrl]);

  const set = <K extends keyof DocumentTemplateSchema>(section: K, patch: Partial<DocumentTemplateSchema[K]>) =>
    onSchema({ ...schema, [section]: { ...(schema[section] as object), ...patch } } as DocumentTemplateSchema);

  // The Add menu turns on a part the page leaves out.
  const offs: Array<{ id: string; label: string; icon: IconName; on: () => void }> = [
    ...(!schema.header.showLogo ? [{ id: "logo", label: "Logo", icon: "brand" as const, on: () => set("header", { showLogo: true }) }] : []),
    ...(!schema.header.showSecondaryLogo ? [{ id: "logo2", label: "Second logo", icon: "brand" as const, on: () => set("header", { showSecondaryLogo: true }) }] : []),
    ...(!schema.header.showContactBlock ? [{ id: "contact", label: "Contact block", icon: "at" as const, on: () => set("header", { showContactBlock: true }) }] : []),
    ...(!schema.footer.showFooterText ? [{ id: "foottext", label: "Footer text", icon: "sentence" as const, on: () => set("footer", { showFooterText: true }) }] : []),
    ...(!schema.footer.showDisclaimer ? [{ id: "disclaimer", label: "Disclaimer", icon: "log" as const, on: () => set("footer", { showDisclaimer: true }) }] : []),
    ...(!schema.footer.showPaymentDetails ? [{ id: "pay", label: "Payment details", icon: "bank" as const, on: () => set("footer", { showPaymentDetails: true }) }] : []),
    ...(!schema.footer.showSignature ? [{ id: "sign", label: "Signature line", icon: "signature" as const, on: () => set("footer", { showSignature: true }) }] : []),
    ...(!schema.footer.showStamp ? [{ id: "stamp", label: "Stamp", icon: "check" as const, on: () => set("footer", { showStamp: true }) }] : []),
  ];
  const kinds: BlockKind[] = offs.map((off) => ({ id: off.id, label: off.label, icon: off.icon }));

  const bar = (
    <BuilderBar
      lead={
        <>
          {onBack ? <Button variant="quiet" iconOnly icon="back" label="Back" onClick={onBack} /> : null}
          <span className="rb-mark" aria-hidden>
            <Icon name="docs" />
          </span>
          <div className="st-name">
            <b className="truncate">{name}</b>
            <span className="truncate">{role}</span>
          </div>
        </>
      }
      name={name}
      mode={mode}
      onMode={setMode}
      saved={saved}
      actions={
        <>
          <span className="muted rb-sample">{rendered.of ? `Showing ${rendered.of}` : "Showing a sample record"}</span>
        </>
      }
      // Corelith's own cannot be published: making it yours is the page's one action.
      publish={onUse ? { label: "Use this template", icon: "file", onPublish: onUse, busy: using } : onPublish ? { onPublish, disabled: readOnly, busy: publishing } : undefined}
    />
  );

  const outline = (
    <BuilderOutline
      addLabel="Add"
      heading="Page"
      entries={parts.map((part) => ({ id: part.id, icon: part.icon, title: part.label }))}
      selected={selected.id}
      onSelect={(partId) => {
        setSelectedId(partId);
        setTab("element");
      }}
      onMove={() => undefined}
      kinds={readOnly ? [] : kinds}
      onAdd={(kind) => offs.find((off) => off.id === kind)?.on()}
    />
  );

  const canvas = (
    <div className="desk2">
      <article className={rendered.html ? "a4 a4-page" : "a4"} aria-label={name}>
        {rendered.html ? (
          <PrintedPage title={`${name}, as it prints`} html={rendered.html} page={schema.page} />
        ) : rendered.failed ? (
          <p className="muted">The page could not be drawn. Check the connection; the template is unchanged.</p>
        ) : (
          <div className="skeleton" style={{ height: 600 }} aria-busy="true" aria-label="Drawing the page" />
        )}
      </article>
    </div>
  );

  const disabled = readOnly;
  // Rows a person adds to this part of the payslip (`payslip-rows.ts`): a label, and the run line's figure that fills it.
  const addable = sourceKey === "hr.payslip" && isPayslipRowPart(selected.id);
  const setRows = (rows: DocumentTemplateSchema["rows"]) => onSchema({ ...schema, rows });
  const addedRows = addable ? (
    <>
      {schema.rows.map((row, index) =>
        row.part === selected.id ? (
          <span key={index} className="rb-pair rb-row">
            <Input
              aria-label={`Row ${index + 1}, label`}
              value={row.label}
              disabled={disabled}
              onChange={(event) => setRows(schema.rows.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)))}
            />
            <Select
              aria-label={`Row ${index + 1}, from`}
              value={row.from}
              disabled={disabled}
              onChange={(event) => {
                const from = event.target.value;
                // A label still naming the old figure follows the new one.
                const label = row.label === payslipRowSourceLabel(row.from) ? payslipRowSourceLabel(from) : row.label;
                setRows(schema.rows.map((existing, at) => (at === index ? { ...existing, from, label } : existing)));
              }}
            >
              {PAYSLIP_ROW_SOURCES.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label}
                </option>
              ))}
            </Select>
            <Button variant="quiet" iconOnly icon="x" label={`Remove ${row.label || "the row"}`} disabled={disabled} onClick={() => setRows(schema.rows.filter((_, at) => at !== index))} />
          </span>
        ) : null,
      )}
      <Button variant="quiet" icon="plus" className="rb-addrow" disabled={disabled} onClick={() => isPayslipRowPart(selected.id) && setRows([...schema.rows, newPayslipRow(selected.id)])}>
        Add a row
      </Button>
    </>
  ) : null;
  // The payslip's own Show (the Deductions part) and Hide rows that are zero (every table of it).
  const payslip = sourceKey === "hr.payslip";
  const setShow = (patch: Partial<DocumentTemplateSchema["payslip"]>) => onSchema({ ...schema, payslip: { ...schema.payslip, ...patch } });
  const showKinds =
    payslip && selected.id === "deductions" ? (
      <div>
        <div className="prow">
          <Check label="Statutory deductions" checked={schema.payslip.statutory} disabled={disabled} onCheckedChange={(statutory) => setShow({ statutory })} />
          <span>PAYE, AIDS levy, NSSA</span>
        </div>
        <div className="prow">
          <Check label="Other deductions" checked={schema.payslip.otherDeductions} disabled={disabled} onCheckedChange={(otherDeductions) => setShow({ otherDeductions })} />
          <span>from compensation rules</span>
        </div>
        <div className="prow">
          <Check label="Disciplinary penalties" checked={schema.payslip.penalties} disabled={disabled} onCheckedChange={(penalties) => setShow({ penalties })} />
          <span>when applied</span>
        </div>
      </div>
    ) : null;
  const element = (
    <>
      <h2 className="text-heading">{selected.label}</h2>
      {selected.rows ? (
        // What fills it is the source's, not a choice: drawn as the board's box, not a list to pick from.
        <label className="field">
          <span>Rows from</span>
          <span className="selbox">{selected.rows}</span>
        </label>
      ) : null}
      {selected.element === "page" ? (
        <>
          <Field label="Paper" htmlFor="layout-paper">
            <Select id="layout-paper" value={schema.page.size} disabled={disabled} onChange={(event) => set("page", { size: event.target.value as "A4" | "LETTER" })}>
              <option value="A4">A4</option>
              <option value="LETTER">Letter</option>
            </Select>
          </Field>
          <Field label="Orientation" htmlFor="layout-orientation">
            <Select id="layout-orientation" value={schema.page.orientation} disabled={disabled} onChange={(event) => set("page", { orientation: event.target.value as "portrait" | "landscape" })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </Select>
          </Field>
          <Field label="Margin, mm" htmlFor="layout-margin">
            <Input id="layout-margin" type="number" min={5} max={40} value={schema.page.marginMm} disabled={disabled} onChange={(event) => set("page", { marginMm: Math.min(40, Math.max(5, Number(event.target.value) || 20)) })} />
          </Field>
        </>
      ) : null}
      {selected.element === "header" ? (
        <>
          <Toggle id="logo" title="Logo" note="From Branding" on={schema.header.showLogo} disabled={disabled} onChange={(showLogo) => set("header", { showLogo })} />
          <Toggle id="logo2" title="Second logo" note="A partner's or an award's" on={schema.header.showSecondaryLogo} disabled={disabled} onChange={(showSecondaryLogo) => set("header", { showSecondaryLogo })} />
          <Toggle id="identity" title="Company identity" note="Name, registration and tax numbers" on={schema.header.showCompanyIdentity} disabled={disabled} onChange={(showCompanyIdentity) => set("header", { showCompanyIdentity })} />
          <Toggle id="contact" title="Contact block" note="Address, phone and email" on={schema.header.showContactBlock} disabled={disabled} onChange={(showContactBlock) => set("header", { showContactBlock })} />
        </>
      ) : null}
      {selected.element === "labels" ? (
        <>
          <Field label="Title" htmlFor="layout-title" optional>
            <Input id="layout-title" value={schema.labels.documentTitle ?? ""} disabled={disabled} onChange={(event) => set("labels", { documentTitle: event.target.value || undefined })} />
          </Field>
          <Field label="Number, called" htmlFor="layout-number">
            <Input id="layout-number" value={schema.labels.documentNumber} disabled={disabled} onChange={(event) => set("labels", { documentNumber: event.target.value })} />
          </Field>
          <Field label="Date, called" htmlFor="layout-date">
            <Input id="layout-date" value={schema.labels.documentDate} disabled={disabled} onChange={(event) => set("labels", { documentDate: event.target.value })} />
          </Field>
          <Field label="Who it is for, called" htmlFor="layout-customer">
            <Input id="layout-customer" value={schema.labels.customer} disabled={disabled} onChange={(event) => set("labels", { customer: event.target.value })} />
          </Field>
        </>
      ) : null}
      {selected.element === "table" ? (
        <>
          <div className="pl">
            <div className="pl-h">Show</div>
            {showKinds}
            <Toggle id="compact" title="Compact rows" note="More rows on a page" on={schema.table.compact} disabled={disabled} onChange={(compact) => set("table", { compact })} />
            <Toggle id="zebra" title="Banded rows" note="Every other row shaded" on={schema.table.zebra} disabled={disabled} onChange={(zebra) => set("table", { zebra })} />
            {addedRows}
          </div>
          {payslip ? (
            <Toggle id="zero" title="Hide rows that are zero" note="Keeps short payslips short" on={schema.payslip.hideZero} disabled={disabled} onChange={(hideZero) => setShow({ hideZero })} />
          ) : null}
          <div className="pl">
            <div className="pl-h">Columns</div>
            {schema.table.columns.length === 0 ? <p className="rb-note">The source&apos;s own columns, in its order.</p> : null}
            {schema.table.columns.map((column, index) => (
              <span key={`${column.key}-${index}`} className="rb-pair rb-choice">
                <Input
                  aria-label={`Column ${index + 1}`}
                  value={column.label}
                  disabled={disabled}
                  onChange={(event) => set("table", { columns: schema.table.columns.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)) })}
                />
                <Button variant="quiet" iconOnly icon="x" label={`Remove ${column.label}`} disabled={disabled} onClick={() => set("table", { columns: schema.table.columns.filter((_, at) => at !== index) })} />
              </span>
            ))}
          </div>
        </>
      ) : null}
      {addable && selected.element !== "table" ? (
        <div className="pl">
          <div className="pl-h">Show</div>
          {addedRows}
        </div>
      ) : null}
      {selected.element === "leave" ? (
        <p className="rb-note">Leave that builds up month by month, and any other kind the employee has been granted or has taken this year: what is left of it at the end of the run&apos;s period.</p>
      ) : null}
      {selected.element === "totals" ? <p className="rb-note">{selected.rows ?? "The document's totals, as the record adds them up."} They print under the table, and are never typed in.</p> : null}
      {selected.element === "notes" ? <p className="rb-note">What the payslip explains, written by payroll as it is worked out: a contractor paid gross, a foreign currency, a missing tax number.</p> : null}
      {selected.element === "footer" ? (
        <>
          <Toggle id="foottext" title="Footer text" note="From Branding" on={schema.footer.showFooterText} disabled={disabled} onChange={(showFooterText) => set("footer", { showFooterText })} />
          <Toggle id="disclaimer" title="Disclaimer" note="From Branding" on={schema.footer.showDisclaimer} disabled={disabled} onChange={(showDisclaimer) => set("footer", { showDisclaimer })} />
          <Toggle id="pay" title="Payment details" note="Bank accounts, for paper that asks to be paid" on={schema.footer.showPaymentDetails} disabled={disabled} onChange={(showPaymentDetails) => set("footer", { showPaymentDetails })} />
          <Toggle id="sign" title="Signature line" note="Signature, from Branding" on={schema.footer.showSignature} disabled={disabled} onChange={(showSignature) => set("footer", { showSignature })} />
          <Toggle id="stamp" title="Stamp" note="The company stamp" on={schema.footer.showStamp} disabled={disabled} onChange={(showStamp) => set("footer", { showStamp })} />
        </>
      ) : null}
      {readOnly ? <p className="rb-note">{readOnlyNote}</p> : null}
    </>
  );

  const schemaText = json ?? JSON.stringify(schema, null, 2);
  const parsedText = (() => {
    try {
      const parsed = templateSchema.safeParse(JSON.parse(schemaText));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  })();
  const labelCount = 4 + schema.table.columns.length;

  const inspector = (
    <BuilderInspector<"element" | "data" | "settings">
      tabs={[
        { value: "element", label: "Element" },
        { value: "data", label: "Data", count: labelCount },
        { value: "settings", label: "Settings" },
      ]}
      tab={tab}
      onTab={setTab}
    >
      {tab === "element" ? (
        element
      ) : tab === "data" ? (
        <>
          <h2>What fills it</h2>
          <p className="rb-note">
            The record&apos;s own figures fill the page when it prints, from <span className="mono">{sourceKey}</span>. Below is the template itself, for anything the
            parts do not show.
          </p>
          <Field label="The template" htmlFor="layout-json" error={parsedText ? undefined : "This is not a template the page can print with."}>
            <TextArea
              id="layout-json"
              className="mono"
              rows={18}
              value={schemaText}
              disabled={readOnly}
              onChange={(event) => setJson(event.target.value)}
              onBlur={() => {
                if (parsedText) {
                  onSchema(parsedText);
                  setJson(null);
                }
              }}
            />
          </Field>
        </>
      ) : (
        settings
      )}
    </BuilderInspector>
  );

  return (
    <BuilderGrid scope="layout" mode={mode} wideBar bar={bar} outline={outline} canvas={canvas} canvasLabel={name} inspector={inspector} inspectorLabel="Inspector" framed={framed} />
  );
}

/** The page's size on screen at 96 dpi, as the PDF lays it out. */
const PAPER_PX = { A4: [794, 1123], LETTER: [816, 1056] } as const;

/**
 * The printed page drawn at its own width and scaled to the desk, so it wraps
 * where the PDF wraps rather than reflowing into a narrower column.
 */
function PrintedPage({ title, html, page }: { title: string; html: string; page: DocumentTemplateSchema["page"] }) {
  const [short, long] = PAPER_PX[page.size];
  const [width, height] = page.orientation === "landscape" ? [long, short] : [short, long];
  const box = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0);
  React.useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => setScale(Math.min(1, node.clientWidth / width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={box} className="a4-fit" style={{ height: scale ? height * scale : undefined }}>
      <iframe title={title} sandbox="" srcDoc={html} style={{ width, height, transform: `scale(${scale || 1})`, visibility: scale ? undefined : "hidden" }} />
    </div>
  );
}

function Toggle({ id, title, note, on, disabled, onChange }: { id: string; title: string; note: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return <Setting htmlFor={`layout-${id}`} title={title} description={note} control={<Switch id={`layout-${id}`} checked={on} disabled={disabled} onCheckedChange={onChange} />} />;
}
