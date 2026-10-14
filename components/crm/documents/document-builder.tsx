"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert } from "@corelithzw/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { RailSection } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { LayoutChoice } from "@/lib/documents/layouts";
import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";
import { cn } from "@/lib/utils";

type LayoutState = {
  kind: "QUOTATION" | "INVOICE" | "RECEIPT";
  current: string | null;
  layouts: LayoutChoice[];
  schema: DocumentTemplateSchema;
  mayChoose: boolean;
  mayCustomise: boolean;
};

/** The sheet at 96 dpi: A4 is 210 × 297 mm, Letter 8.5 × 11 in. */
const SHEET = { A4: { width: 794, height: 1123 }, LETTER: { width: 816, height: 1056 } } as const;

/** What a person can switch on and off in a layout, in the words the page uses. */
const SWITCHES: Array<{ group: "header" | "footer" | "table"; key: string; label: string }> = [
  { group: "header", key: "showLogo", label: "Logo" },
  { group: "header", key: "showCompanyIdentity", label: "Company name and details" },
  { group: "header", key: "showContactBlock", label: "Contact details" },
  { group: "footer", key: "showPaymentDetails", label: "Payment details and terms" },
  { group: "footer", key: "showFooterText", label: "Footer text" },
  { group: "footer", key: "showDisclaimer", label: "Disclaimer" },
  { group: "footer", key: "showSignature", label: "Signature" },
  { group: "footer", key: "showStamp", label: "Stamp" },
  { group: "table", key: "compact", label: "Compact lines" },
];

const flag = (schema: DocumentTemplateSchema, group: string, key: string) =>
  Boolean((schema as unknown as Record<string, Record<string, unknown>>)[group]?.[key]);

function withFlag(schema: DocumentTemplateSchema, group: "header" | "footer" | "table", key: string, value: boolean): DocumentTemplateSchema {
  return { ...schema, [group]: { ...schema[group], [key]: value } };
}

/**
 * A labelled text field with an id of its own: the record page draws its rail
 * twice (beside the record, and under it on a phone), so a fixed id would
 * name two fields.
 */
function Field({ label, ...input }: { label: string } & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...input} />
    </div>
  );
}

/** The HTML for the preview: the saved layout by id, or settings not saved yet. */
async function previewHtml(documentId: string, layoutId: string | null, draft: DocumentTemplateSchema | null): Promise<string> {
  const url = `/api/v2/crm/documents/${documentId}/preview${!draft && layoutId ? `?templateId=${layoutId}` : ""}`;
  const response = await fetch(url, {
    method: draft ? "POST" : "GET",
    credentials: "include",
    headers: draft ? { "Content-Type": "application/json" } : undefined,
    body: draft ? JSON.stringify({ schema: draft }) : undefined,
  });
  if (!response.ok) throw new Error("The document could not be shown.");
  return response.text();
}

/**
 * The sheet: the document as it prints, at its paper's width, scaled to fit
 * the column and grown to its own length. Shown in a frame that runs no
 * script; read from the same origin only to measure how long it is.
 */
function Sheet({ html, size, landscape, busy }: { html: string | undefined; size: "A4" | "LETTER"; landscape: boolean; busy: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const paper = landscape ? { width: SHEET[size].height, height: SHEET[size].width } : SHEET[size];

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (doc) setLength(Math.max(paper.height, doc.documentElement.scrollHeight));
  }, [paper.height]);

  const scale = width > 0 ? Math.min(1, width / paper.width) : 1;
  const height = length ?? paper.height;

  return (
    <div ref={box} className="w-full">
      {html === undefined ? (
        <Skeleton height={Math.round(paper.height * scale)} />
      ) : (
        <div
          className={cn("relative mx-auto overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-8px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-opacity motion-reduce:transition-none", busy && "opacity-60")}
          style={{ width: paper.width * scale, height: height * scale }}
        >
          <iframe
            ref={frame}
            title="The document as it prints"
            // No script runs in it; the same origin only lets the page measure it.
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={measure}
            style={{ width: paper.width, height, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The document's builder, on its own page: the document as it prints, large,
 * in its tab, and the sections that decide how it prints, in the record's
 * rail beside it. Any layout made for this kind
 * of document can be previewed and then kept; a manager can also switch what
 * shows, set the paper, retitle it, and save that as a layout of the
 * company's own. A layout never changes the figures: those are changed with
 * `edits`, which the page passes in only where changing them makes sense.
 */
export function useDocumentBuilder({
  documentId,
  pdfHref,
  edits,
}: {
  documentId: string;
  /** The PDF under the record the document hangs off, when it hangs off one. */
  pdfHref: string | null;
  /** The figure changes this document allows (Edit, the due date, a receipt's reference), or none. */
  edits?: ReactNode;
}): { sheet: ReactNode; rail: ReactNode } {
  const client = useQueryClient();
  const { toast } = useToast();
  const stateKey = ["crm", "documents", "layout", documentId];
  const state = useQuery({ queryKey: stateKey, queryFn: () => fetchJson<LayoutState>(`/api/v2/crm/documents/${documentId}/layout`) });

  // The layout being looked at (not yet kept), and settings changed but not saved.
  const [looking, setLooking] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<DocumentTemplateSchema | null>(null);
  const [name, setName] = useState("");
  const shown = looking === undefined ? (state.data?.current ?? null) : looking;

  const preview = useQuery({
    queryKey: ["crm", "documents", "preview", documentId, shown, draft ? JSON.stringify(draft) : null],
    queryFn: () => previewHtml(documentId, shown, draft),
    enabled: Boolean(state.data),
    placeholderData: keepPreviousData,
  });
  // The settings of the layout being looked at, for the switches to start from.
  const lookingSchema = useQuery({
    queryKey: ["crm", "documents", "layout-schema", documentId, shown],
    queryFn: async () => {
      if (shown === (state.data?.current ?? null)) return state.data!.schema;
      // Previewing another layout: its settings come with its preview's choice.
      return (await fetchJson<LayoutState>(`/api/v2/crm/documents/${documentId}/layout?templateId=${shown ?? ""}`)).schema;
    },
    enabled: Boolean(state.data) && Boolean(state.data?.mayCustomise),
  });
  const schema = draft ?? lookingSchema.data ?? state.data?.schema;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: stateKey });
    void client.invalidateQueries({ queryKey: ["crm", "documents", "preview", documentId] });
  };
  const keep = useMutation({
    mutationFn: (templateId: string | null) =>
      fetchJson(`/api/v2/crm/documents/${documentId}/layout`, { method: "PATCH", body: JSON.stringify({ templateId }) }),
    onSuccess: () => {
      setLooking(undefined);
      toast({ title: "Layout kept", description: "The PDF and the emails use it from now on." });
    },
    onError: (failure) => toast({ title: "The layout was not changed", description: getApiErrorMessage(failure), variant: "destructive" }),
    onSettled: refresh,
  });
  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ layout: LayoutChoice }>(`/api/v2/crm/documents/${documentId}/layout`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), schema }),
      }),
    onSuccess: ({ layout }) => {
      setDraft(null);
      setLooking(undefined);
      setName("");
      toast({ title: `Saved as "${layout.name}"`, description: "This document prints in it, and the next one can too." });
    },
    onError: (failure) => toast({ title: "The layout was not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
    onSettled: refresh,
  });

  const choices = useMemo(() => {
    const layouts = state.data?.layouts ?? [];
    const fallback = layouts.find((layout) => layout.isDefault);
    return [{ id: null as string | null, name: `Company default${fallback ? ` (${fallback.name})` : ""}`, own: false, isDefault: false }, ...layouts.filter((layout) => !layout.isDefault || layout.own)];
  }, [state.data?.layouts]);

  const sheet = (
    <div className="min-w-0 rounded-lg bg-[var(--canvas)] p-4 sm:p-6">
      {state.error || preview.error ? (
        <Alert tone="danger" title="The document could not be shown">
          {getApiErrorMessage(state.error ?? preview.error)}
        </Alert>
      ) : (
        <Sheet html={preview.data} size={schema?.page.size ?? "A4"} landscape={schema?.page.orientation === "landscape"} busy={preview.isFetching} />
      )}
    </div>
  );
  if (!state.data) return { sheet, rail: null };
  const { current, mayChoose, mayCustomise } = state.data;
  const changed = shown !== current;

  const rail = (
    <>
        <RailSection title="Layout">
          <ul className="space-y-1" role="radiogroup" aria-label="Layout">
            {choices.map((choice) => {
              const selected = shown === choice.id;
              return (
                <li key={choice.id ?? "default"}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={Boolean(draft)}
                    onClick={() => setLooking(choice.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60",
                      selected ? "bg-[var(--surface-selected,var(--sel-bg))] font-medium text-[var(--text-strong)]" : "hover:bg-[var(--hover)]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                    {choice.id === current ? <Badge variant="secondary">In use</Badge> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {changed && !draft ? (
            mayChoose ? (
              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={keep.isPending} onClick={() => keep.mutate(shown)}>
                  {keep.isPending ? "Keeping…" : "Use this layout"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLooking(undefined)}>
                  Back to the one in use
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Only the record&apos;s owner can change its layout.</p>
            )
          ) : null}
          {pdfHref ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" asChild>
                <a href={pdfHref} target="_blank" rel="noopener">
                  View PDF
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`${pdfHref}?download=1`}>Download PDF</a>
              </Button>
            </div>
          ) : null}
        </RailSection>

        {mayCustomise && schema ? (
          <RailSection title="Customise">
            <div className="space-y-3">
            <Field
              label="Title"
              value={schema.labels.documentTitle ?? ""}
              maxLength={60}
              onChange={(event) => setDraft({ ...schema, labels: { ...schema.labels, documentTitle: event.target.value || undefined } })}
            />
            <div className="space-y-2">
              <SegmentedControl
                ariaLabel="Paper"
                size="sm"
                fullWidth
                value={schema.page.size}
                onValueChange={(size) => setDraft({ ...schema, page: { ...schema.page, size } })}
                options={[
                  { value: "A4", label: "A4" },
                  { value: "LETTER", label: "Letter" },
                ]}
              />
              <SegmentedControl
                ariaLabel="Orientation"
                size="sm"
                fullWidth
                value={schema.page.orientation}
                onValueChange={(orientation) => setDraft({ ...schema, page: { ...schema.page, orientation } })}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm text-[var(--text-muted)]">What shows</legend>
              {SWITCHES.map((item) => (
                <label key={`${item.group}.${item.key}`} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={flag(schema, item.group, item.key)}
                    onCheckedChange={(checked) => setDraft(withFlag(schema, item.group, item.key, checked === true))}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-[var(--text-muted)]">Colours, fonts, the logo and the footer&apos;s words come from the company&apos;s branding.</p>
            {draft ? (
              <form
                className="space-y-2 border-t border-[var(--border-subtle)] pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) save.mutate();
                }}
              >
                <Field label="Save as a layout" placeholder="Quote, without the stamp" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" type="submit" disabled={!name.trim() || save.isPending}>
                    {save.isPending ? "Saving…" : "Save and use it"}
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => setDraft(null)}>
                    Undo changes
                  </Button>
                </div>
              </form>
            ) : null}
            </div>
          </RailSection>
        ) : null}

        {edits ? <RailSection title="Change it">{edits}</RailSection> : null}
    </>
  );
  return { sheet, rail };
}
