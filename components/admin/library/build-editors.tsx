"use client";

import type { ReactNode } from "react";

import { DocumentBuilderView } from "@/components/build/document-builder";
import { EnquiryAfter, EnquiryAsks, EnquiryBefore, EnquiryWords, type EnquiryContent } from "@/components/build/enquiry-form-builder";
import { FormBuilderView } from "@/components/build/form-builder-view";
import { LayoutBuilderView } from "@/components/build/layout-builder";
import { Field, Select, TextArea } from "@/components/core";
import { layoutUse } from "@/lib/build/items";
import { TEMPLATE_KIND_LABELS, TEMPLATE_KINDS, type TemplateKind } from "@/lib/crm/blocks";
import { SITE_VISIT_FIELD_TYPES } from "@/lib/crm/site-visits/fields";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { DISPLAY_FIELD_TYPES, FIELD_TYPES } from "@/lib/forms/fields";
import {
  EMPTY_BLOCK_TEMPLATE,
  EMPTY_ENQUIRY_FORM,
  EMPTY_LAYOUT,
  EMPTY_VISIT_FORM,
  layoutSourceOf,
  type BlockTemplatePayload,
  type EnquiryFormPayload,
  type LayoutPayload,
  type VisitFormPayload,
} from "@/lib/library/build-kinds";

import type { PayloadEditorProps } from "./editors";

/**
 * The library's forms, templates and layouts, each in the builder a workspace
 * edits its own in — the same components, fed the item's payload instead of a
 * workspace's API. What only a workspace has is left out: the products a quote
 * line sells, a form's public link and whether it is taking answers, who may
 * see a draft, a layout's versions and default. A workspace sets those on its
 * copy. The page around the builder saves and publishes; the builder has no
 * Publish of its own.
 */

/** The builder at the height of the window under the item's details, as one block of the page. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)] min-[1100px]:h-[calc(100dvh-14rem)] min-[1100px]:min-h-[40rem]">
      {children}
    </div>
  );
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** The payload as the builder has it, or the kind's empty one where a part is missing. */
function read<T extends object>(value: unknown, empty: T): T {
  return value && typeof value === "object" ? { ...empty, ...(value as Partial<T>) } : empty;
}

/* ── Site-visit forms ─────────────────────────────────────────────────── */

const VISIT_ASKED: Record<VisitFormPayload["kind"], string> = {
  PRODUCT: "When it is being quoted",
  EVIDENCE: "On every visit",
  CLOSEOUT: "At the end of every visit",
};

const VISIT_ROLE: Record<VisitFormPayload["kind"], string> = {
  PRODUCT: "Site-visit form, used when quoting",
  EVIDENCE: "Site-visit form, used on every visit",
  CLOSEOUT: "Site-visit form, used at the end of every visit",
};

export function VisitFormPayloadEditor({ value, onChange, title }: PayloadEditorProps) {
  const payload = read<VisitFormPayload>(value, EMPTY_VISIT_FORM);
  const set = (patch: Partial<VisitFormPayload>) => onChange({ ...payload, ...patch });
  const asked = payload.fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type)).length;
  return (
    <Frame>
      <FormBuilderView
        framed
        name={title || "Site-visit form"}
        role={VISIT_ROLE[payload.kind]}
        fields={payload.fields}
        onFields={(fields) => set({ fields })}
        types={SITE_VISIT_FIELD_TYPES}
        lockedKeys={NO_KEYS}
        requiredNote="A visit cannot finish without it"
        quoteLines={payload.quoteLines}
        onQuoteLines={(quoteLines) => set({ quoteLines })}
        canEdit
        settings={
          <>
            <h2>The form</h2>
            <Field label="Asked" htmlFor="library-visit-kind">
              <Select id="library-visit-kind" value={payload.kind} onChange={(event) => set({ kind: event.target.value as VisitFormPayload["kind"] })}>
                {(Object.keys(VISIT_ASKED) as VisitFormPayload["kind"][]).map((kind) => (
                  <option key={kind} value={kind}>
                    {VISIT_ASKED[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="pl">
              <div className="pl-h">So far</div>
              <div className="prow">
                <b>Questions</b>
                <span>{asked}</span>
              </div>
              <div className="prow">
                <b>Quote lines</b>
                <span>{payload.quoteLines.length}</span>
              </div>
            </div>
            <p className="rb-note">
              A quote line is priced here as written. A workspace links it to its own product, and puts the form in use, on its copy.
            </p>
          </>
        }
      />
    </Frame>
  );
}

/* ── Enquiry forms ────────────────────────────────────────────────────── */

export function EnquiryFormPayloadEditor({ value, onChange, title }: PayloadEditorProps) {
  const payload = read<EnquiryFormPayload>(value, EMPTY_ENQUIRY_FORM);
  const content: EnquiryContent = {
    headline: payload.headline ?? "",
    description: payload.description ?? "",
    successMessage: payload.successMessage ?? "",
    allowPhotos: payload.allowPhotos,
    maxPhotos: payload.maxPhotos,
    services: payload.services,
  };
  const set = (patch: Partial<EnquiryFormPayload>) => onChange({ ...payload, ...patch });
  const name = title || "Enquiry form";
  return (
    <Frame>
      <FormBuilderView
        framed
        name={name}
        role="Enquiry form, used for new enquiries"
        fields={payload.fields}
        onFields={(fields) => set({ fields })}
        types={FIELD_TYPES}
        lockedKeys={NO_KEYS}
        requiredNote="An enquiry cannot be sent without it"
        canEdit
        before={<EnquiryBefore draft={content} />}
        after={<EnquiryAfter draft={content} />}
        settings={
          <>
            <h2>The form</h2>
            <EnquiryWords draft={content} name={name} onChange={set} />
            <EnquiryAsks draft={content} onChange={set} />
            <p className="rb-note">A workspace&apos;s copy gets its own public link, and takes enquiries once it is published there.</p>
          </>
        }
      />
    </Frame>
  );
}

/* ── Templates laid out as blocks ─────────────────────────────────────── */

export function BlockTemplatePayloadEditor({ value, onChange, title }: PayloadEditorProps) {
  const payload = read<BlockTemplatePayload>(value, EMPTY_BLOCK_TEMPLATE);
  const attributes = { ...payload.attributes, custom: payload.attributes?.custom ?? {} };
  return (
    <Frame>
      <DocumentBuilderView
        framed
        kind={payload.kind}
        savedBlocks={[]}
        draft={{
          name: title || TEMPLATE_KIND_LABELS[payload.kind],
          description: attributes.description ?? "",
          emoji: attributes.emoji ?? null,
          custom: attributes.custom,
          blocks: payload.blocks,
          isShared: true,
          isActive: true,
        }}
        onDraft={(next) =>
          onChange({
            ...payload,
            attributes: { ...attributes, description: next.description || null, emoji: next.emoji, custom: next.custom },
            blocks: next.blocks,
          })
        }
        settings={
          <>
            <h2>The template</h2>
            <Field label="Used for" htmlFor="library-block-kind" help="Each kind offers its own blocks; one that does not belong is listed under the page.">
              <Select id="library-block-kind" value={payload.kind} onChange={(event) => onChange({ ...payload, kind: event.target.value as TemplateKind })}>
                {TEMPLATE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {TEMPLATE_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="What it is for" htmlFor="library-block-description" optional>
              <TextArea
                id="library-block-description"
                rows={3}
                value={attributes.description ?? ""}
                onChange={(event) => onChange({ ...payload, attributes: { ...attributes, description: event.target.value || null } })}
              />
            </Field>
            <p className="rb-note">A workspace&apos;s copy starts as a draft only its maker sees, until it is published there.</p>
          </>
        }
      />
    </Frame>
  );
}

/* ── Printed layouts ──────────────────────────────────────────────────── */

const sameSchema = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function LayoutPayloadEditor({ value, onChange, title }: PayloadEditorProps) {
  const payload = read<LayoutPayload>(value, EMPTY_LAYOUT);
  const source = layoutSourceOf(payload);
  const use = layoutUse(payload.sourceKey, payload.documentType);
  return (
    <Frame>
      <LayoutBuilderView
        framed
        name={title || "Printed layout"}
        role={`Printed layout, for ${use.toLowerCase()}`}
        sourceKey={payload.sourceKey}
        schema={payload.schema}
        onSchema={(schema) => onChange({ ...payload, schema })}
        readOnly={false}
        previewUrl="/api/platform-admin/library/layout-preview"
        settings={
          <>
            <h2>The layout</h2>
            <Field label="Prints" htmlFor="library-layout-source" help="The page is drawn with its sample record and a sample letterhead.">
              <Select
                id="library-layout-source"
                value={source?.key ?? ""}
                onChange={(event) => {
                  const next = DEFAULT_TEMPLATE_CATALOG.find((entry) => entry.key === event.target.value);
                  if (!next) return;
                  // Untouched, it follows the new source's own layout; changed, the changes are kept.
                  const untouched = !source || sameSchema(payload.schema, source.schema);
                  onChange({
                    sourceKey: next.sourceKey,
                    documentType: next.documentType,
                    targetType: next.targetType,
                    schema: untouched ? next.schema : payload.schema,
                  });
                }}
              >
                {source ? null : <option value="">Choose what it prints</option>}
                {DEFAULT_TEMPLATE_CATALOG.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.name.replace(/ Default$/, "")}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="prow">
              <b>Source</b>
              <span className="mono">{payload.sourceKey}</span>
            </div>
            <p className="rb-note">
              A workspace it reaches prints with it until it makes its own default, in its own colours, logo and payment accounts. Its copy keeps versions of its
              own.
            </p>
          </>
        }
      />
    </Frame>
  );
}
