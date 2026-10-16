"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { layoutUse } from "@/lib/build/items";
import type { BuildLibraryKind } from "@/lib/library/workspace";
import type { BlockTemplatePayload, EnquiryFormPayload, LayoutPayload, VisitFormPayload } from "@/lib/library/build-kinds";
import { SITE_VISIT_FIELD_TYPES } from "@/lib/crm/site-visits/fields";
import { FIELD_TYPES } from "@/lib/forms/fields";
import { resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";

import { DocumentBuilderView } from "./document-builder";
import { EnquiryAfter, EnquiryBefore } from "./enquiry-form-builder";
import { FormBuilderView } from "./form-builder-view";
import { LayoutBuilderView } from "./layout-builder";
import { useStartBuild } from "./use-start";

/**
 * One of Corelith's library, opened in a workspace (Build → Templates → From
 * Corelith): its own builder, read-only, with Use this template — which makes
 * the workspace's copy through the type's API and opens that in the builder.
 * The library item itself is read live: what Corelith changes, this shows next.
 */

export type LibraryViewItem<P> = { key: string; title: string; summary: string | null; payload: P };

const KEPT_BY = "Kept by Corelith. Use this template to make your own copy and change it.";

function useLibraryStart(kind: BuildLibraryKind, item: { key: string; title: string }, canUse: boolean) {
  const start = useStartBuild([]);
  const router = useRouter();
  return {
    back: { label: "Back to templates", onBack: () => router.push("/build/templates") },
    primary: canUse
      ? { label: "Use this template", icon: "file" as const, busy: start.isPending, onClick: () => start.mutate({ type: "library", kind, key: item.key, name: item.title }) }
      : undefined,
  };
}

function About({ item, rows }: { item: LibraryViewItem<unknown>; rows: Array<[string, string]> }) {
  return (
    <>
      <h2>The template</h2>
      {item.summary ? <p className="rb-note">{item.summary}</p> : null}
      {rows.map(([label, value]) => (
        <div key={label} className="prow">
          <b>{label}</b>
          <span>{value}</span>
        </div>
      ))}
      <p className="rb-note">{KEPT_BY}</p>
    </>
  );
}

const VISIT_ROLE: Record<VisitFormPayload["kind"], string> = {
  PRODUCT: "Form from Corelith, used on site visits when quoting",
  EVIDENCE: "Form from Corelith, used on every site visit",
  CLOSEOUT: "Form from Corelith, used at the end of every site visit",
};

const none = () => undefined;
const NO_KEYS: ReadonlySet<string> = new Set();

export function LibraryVisitFormView({ item, canUse }: { item: LibraryViewItem<VisitFormPayload>; canUse: boolean }) {
  const { back, primary } = useLibraryStart("VISIT_FORM", item, canUse);
  return (
    <FormBuilderView
      name={item.title}
      role={VISIT_ROLE[item.payload.kind]}
      back={back}
      fields={item.payload.fields}
      onFields={none}
      types={SITE_VISIT_FIELD_TYPES}
      lockedKeys={NO_KEYS}
      requiredNote="A visit cannot finish without it"
      quoteLines={item.payload.quoteLines}
      onQuoteLines={none}
      canEdit={false}
      primary={primary}
      settings={<About item={item} rows={[["Kept by", "Corelith"]]} />}
    />
  );
}

export function LibraryEnquiryFormView({ item, canUse }: { item: LibraryViewItem<EnquiryFormPayload>; canUse: boolean }) {
  const { back, primary } = useLibraryStart("ENQUIRY_FORM", item, canUse);
  const content = {
    headline: item.payload.headline ?? "",
    description: item.payload.description ?? "",
    successMessage: item.payload.successMessage ?? "",
    allowPhotos: item.payload.allowPhotos,
    maxPhotos: item.payload.maxPhotos,
    services: item.payload.services,
  };
  return (
    <FormBuilderView
      name={item.title}
      role="Form from Corelith, used for new enquiries"
      back={back}
      fields={item.payload.fields}
      onFields={none}
      types={FIELD_TYPES}
      lockedKeys={NO_KEYS}
      requiredNote="An enquiry cannot be sent without it"
      canEdit={false}
      primary={primary}
      before={<EnquiryBefore draft={content} />}
      after={<EnquiryAfter draft={content} />}
      settings={<About item={item} rows={[["Kept by", "Corelith"]]} />}
    />
  );
}

export function LibraryDocumentView({ item, canUse }: { item: LibraryViewItem<BlockTemplatePayload>; canUse: boolean }) {
  const { back, primary } = useLibraryStart("BLOCK_TEMPLATE", item, canUse);
  const { kind, attributes, blocks } = item.payload;
  return (
    <DocumentBuilderView
      kind={kind}
      savedBlocks={blocks}
      draft={{
        name: item.title,
        description: attributes.description ?? "",
        emoji: attributes.emoji ?? null,
        custom: attributes.custom,
        blocks,
        isShared: true,
        isActive: true,
      }}
      onDraft={none}
      back={back}
      primary={primary}
      readOnly
      settings={<About item={item} rows={[["Kept by", "Corelith"]]} />}
    />
  );
}

export function LibraryLayoutView({ item, canUse }: { item: LibraryViewItem<LayoutPayload>; canUse: boolean }) {
  const { back, primary } = useLibraryStart("LAYOUT", item, canUse);
  const { sourceKey, documentType, targetType, schema } = item.payload;
  const use = layoutUse(sourceKey, documentType);
  const issuedFor = resolveCatalogTemplateEntry({ sourceKey, documentType, targetType })?.name.replace(/ Default$/, "") ?? use;
  return (
    <LayoutBuilderView
      name={item.title}
      role={`Document template from Corelith, for ${use.toLowerCase()}`}
      sourceKey={sourceKey}
      schema={schema}
      onSchema={none}
      readOnly
      onBack={back.onBack}
      onUse={primary?.onClick}
      using={primary?.busy}
      settings={
        <>
          <About
            item={item}
            rows={[
              ["Name", item.title],
              ["Issued for", issuedFor],
              ["Source", sourceKey],
              ["Kept by", "Corelith"],
            ]}
          />
          <p className="rb-note">Colours, the logo and the payment accounts come from Branding. Changing them there changes every document.</p>
        </>
      }
    />
  );
}
