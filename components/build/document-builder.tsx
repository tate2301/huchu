"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BuilderBar,
  BuilderGrid,
  BuilderInspector,
  BuilderOutline,
  CanvasBlock,
  useBlockList,
  type BlockKind,
  type BuilderMode,
} from "@/components/builder/grid";
import { FieldInspector } from "@/components/builder/grid/field-inspector";
import { Button, Field, Icon, Input, Select, Setting, Switch, TextArea, useShortcut, type IconName } from "@/components/core";
import { BlockRenderer, type BlockRendererContext } from "@/components/crm/templates/block-renderer";
import { ActivityTrail, type ActivityEvent } from "@/components/management/ui";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BLOCK_LABELS,
  BLOCKS_FOR_KIND,
  TEMPLATE_KIND_LABELS,
  blockFields,
  emptyBlock,
  templateProblems,
  type Block,
  type BlockType,
  type LeafBlock,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { starterBlocks, startersForKind } from "@/lib/crm/starter-templates";
import { groupedVariables, sampleValues, unknownVariables, VARIABLE_CATALOGUE } from "@/lib/crm/template-variables";
import { FIELD_TYPES, keyFromLabel } from "@/lib/forms/fields";
import { formatTime } from "@/lib/workspace/format";
import { followLabel, newQuestion } from "@/lib/forms/questions";

import { BuilderError, BuilderLoading } from "./builder-states";
import { useBuilderKeys } from "./use-builder-keys";

type TemplateRecord = {
  id: string;
  name: string;
  kind: TemplateKind;
  attributes: { emoji?: string | null; description?: string | null; custom?: Record<string, string> } | null;
  blocks: Block[];
  isShared: boolean;
  isActive: boolean;
  linkedEntity: string | null;
  publicToken: string | null;
  viewCount: number;
  submitCount: number;
  lastViewedAt: string | null;
  lastSubmitAt: string | null;
  updatedAt: string;
  createdBy?: { id: string; name: string | null } | null;
  events?: Array<{ id: string; type: string; source: string | null; createdAt: string }>;
};

type Draft = { name: string; description: string; emoji: string | null; custom: Record<string, string>; blocks: Block[]; isShared: boolean; isActive: boolean };

/** What the page edits: the template's name and blocks, and its settings' own. */
export type DocumentDraft = Draft;

const BLOCK_ICONS: Record<BlockType, IconName> = {
  heading: "sentence",
  text: "docs",
  field: "pen",
  divider: "sections",
  spacer: "sections",
  image: "brand",
  table: "table",
  lineItems: "tablegrid",
  totals: "figure",
  signature: "signature",
  terms: "docs",
  columns: "columns",
};

/** What each kind of document is, under its name in the bar. */
const ROLE: Record<TemplateKind, string> = {
  FORM: "Form, filled in from its link",
  QUOTE: "Document, sent with every quote",
  INVOICE: "Document, sent with every invoice",
  RECEIPT: "Document, sent with every receipt",
  EMAIL: "Email template, sent about a record",
  EXPORT: "Document, the shape of a table export",
};

const newId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

function createBlock(type: BlockType, existing: readonly Block[]): Block {
  const id = newId(type);
  if (type === "field") return { id, type: "field", field: newQuestion("text", "", blockFields([...existing])) };
  return emptyBlock(type, id);
}

function duplicateBlock(block: Block, existing: readonly Block[]): Block {
  if (block.type === "field") {
    const label = `${block.field.label} (copy)`;
    const taken = new Set(blockFields([...existing]).map((field) => field.key));
    return { ...block, id: newId("field"), field: { ...block.field, label, key: keyFromLabel(label, taken) } };
  }
  if (block.type === "columns") {
    const renew = (child: LeafBlock): LeafBlock => ({ ...child, id: newId(child.type) });
    return { ...block, id: newId("columns"), left: block.left.map(renew), right: block.right.map(renew) };
  }
  return { ...block, id: newId(block.type) };
}

/** How a block is named in the outline: what it is on this document. */
export function blockTitle(block: Block, kind: TemplateKind, blocks: readonly Block[]): string {
  const firstLine = (text: string) => text.split("\n").find((line) => line.trim())?.trim() ?? "";
  switch (block.type) {
    case "heading":
      return kind === "EMAIL" && blocks.find((candidate) => candidate.type === "heading")?.id === block.id ? "Subject" : firstLine(block.text) || "Heading";
    case "text":
      return firstLine(block.text) || "Text";
    case "image":
      return block.source === "branding.logo" ? "Letterhead" : "Image";
    case "lineItems":
      return "Lines table";
    case "field":
      return block.field.label || "Question";
    default:
      return BLOCK_LABELS[block.type];
  }
}

const SAMPLE_LINES: NonNullable<BlockRendererContext["lines"]> = [
  { description: "The first line of the work", quantity: 2, unitPrice: 120, taxRate: 15.5, total: 240 },
  { description: "Materials", quantity: 14, unitPrice: 38, taxRate: 15.5, total: 532 },
  { description: "Fitting", quantity: 1, unitPrice: 168, taxRate: 15.5, total: 168 },
];
const SAMPLE_TOTALS = { subtotal: 940, tax: 145.7, total: 1085.7, paid: 0 };

/**
 * A document, an email or a form laid out as blocks, in Build (BuildDocument,
 * PageTemplateEmail) — the rebuild of the templates' editor on the builder's
 * grid. The outline lists its blocks, with Add (/) and drag to reorder; the
 * page shows it as it is sent, with sample values; the inspector edits the
 * selected element, lists the record's fields to put in (Data), and holds the
 * template's settings, its activity and Delete. Publish (Ctrl ↵) saves it and
 * lets the whole team use it; Ctrl S saves it as it is.
 */
export function DocumentBuilder({ id, backLabel = "Back to Build" }: { id: string; backLabel?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm-template", id];
  const template = useQuery({ queryKey, queryFn: () => fetchJson<TemplateRecord>(`/api/v2/crm/templates/${encodeURIComponent(id)}`) });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [savedJson, setSavedJson] = React.useState<string | null>(null);
  const loaded = template.data;
  if (loaded && draft === null) {
    const next: Draft = {
      name: loaded.name,
      description: loaded.attributes?.description ?? "",
      emoji: loaded.attributes?.emoji ?? null,
      custom: loaded.attributes?.custom ?? {},
      blocks: loaded.blocks ?? [],
      isShared: loaded.isShared,
      isActive: loaded.isActive,
    };
    setDraft(next);
    setSavedJson(JSON.stringify(next));
  }
  const dirty = draft !== null && JSON.stringify(draft) !== savedJson;
  const kind = loaded?.kind ?? "QUOTE";
  const listHref = kind === "EMAIL" ? "/build?kind=emails" : kind === "FORM" ? "/build?kind=forms" : "/build?kind=documents";

  const save = useMutation({
    mutationFn: ({ next, published }: { next: Draft; published: boolean }) =>
      fetchJson<TemplateRecord>(`/api/v2/crm/templates/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: next.name.trim() || `Untitled ${TEMPLATE_KIND_LABELS[kind].toLowerCase()}`,
          attributes: { emoji: next.emoji, description: next.description, custom: next.custom },
          blocks: next.blocks,
          isShared: next.isShared,
          isActive: next.isActive,
        }),
      }).then(() => ({ next, published })),
    onSuccess: async ({ next, published }) => {
      setDraft(next);
      setSavedJson(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey: ["crm-templates"] });
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: `${next.name} ${published ? "published" : "saved"}`, variant: "success" });
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/v2/crm/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: "Template deleted" });
      router.push(listHref);
    },
    onError: (failure) => toast({ title: "Could not delete it", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const back = useBuilderKeys({ dirty, onSave: () => draft && dirty && save.mutate({ next: draft, published: false }), backHref: listHref });

  if (template.isError) return <BuilderError what="This template" onRetry={() => void template.refetch()} error={template.error} backHref={listHref} />;
  if (!loaded || !draft) return <BuilderLoading scope="document" />;

  return (
    <DocumentBuilderView
      kind={loaded.kind}
      savedBlocks={loaded.blocks ?? []}
      draft={draft}
      onDraft={setDraft}
      back={{ label: backLabel, onBack: back }}
      saved={save.isPending ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: formatTime(new Date(loaded.updatedAt)) }}
      publishing={save.isPending}
      onPublish={() => save.mutate({ next: { ...draft, isShared: true, isActive: true }, published: true })}
      settings={
        <SettingsPanel
          record={loaded}
          draft={draft}
          onDraft={setDraft}
          onDelete={async () => {
            const sure = await dsConfirm({
              title: `Delete ${draft.name}`,
              description: "It is gone for everyone. Documents already sent keep what they said.",
              confirmLabel: "Delete",
              variant: "danger",
            });
            if (sure) remove.mutate();
          }}
          deleting={remove.isPending}
        />
      }
    />
  );
}

type InspectorTab = "element" | "data" | "settings";

/**
 * A document laid out as blocks, on the builder's grid. Pure: the page loads
 * and saves it — a workspace's template through its API, or a library item in
 * the admin portal — and gives it its settings. Read-only, it shows the page
 * as it is sent, with `primary` (Use this template) in the bar.
 */
export function DocumentBuilderView({
  kind,
  savedBlocks,
  draft,
  onDraft,
  back,
  saved,
  publishing = false,
  onPublish,
  primary,
  readOnly = false,
  settings,
  framed = false,
}: {
  kind: TemplateKind;
  /** The blocks as last saved: their questions keep their keys, since answers are stored against them. */
  savedBlocks: readonly Block[];
  draft: Draft;
  onDraft: (next: Draft) => void;
  back?: { label: string; onBack: () => void };
  saved?: React.ComponentProps<typeof BuilderBar>["saved"];
  publishing?: boolean;
  /** Left out, with no `primary`, the bar has no primary: the page around the builder publishes it. */
  onPublish?: () => void;
  primary?: { label: string; icon: IconName; onClick: () => void; busy: boolean };
  readOnly?: boolean;
  /** The inspector's Settings tab. */
  settings: React.ReactNode;
  /** Fills the frame it is put in rather than the window (the admin portal's library). */
  framed?: boolean;
}) {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<BuilderMode>(readOnly ? "preview" : "build");
  const [tab, setTab] = React.useState<InspectorTab>("element");
  const blocks = draft.blocks;
  const setBlocks = (next: Block[]) => onDraft({ ...draft, blocks: next });
  const lockedKeys = React.useMemo(() => new Set(blockFields([...savedBlocks]).map((field) => field.key)), [savedBlocks]);

  const list = useBlockList<Block>({
    blocks,
    onChange: setBlocks,
    create: (type, existing) => createBlock(type as BlockType, existing),
    duplicate: duplicateBlock,
    initial: (blocks.find((block) => block.type === "lineItems") ?? blocks.find((block) => block.type !== "heading") ?? blocks[0])?.id ?? null,
  });
  const selected = list.selected;
  const building = mode === "build";
  useShortcut("Esc", () => list.select(null), { enabled: building && Boolean(selected) });

  const problems = [
    ...templateProblems(kind, blocks),
    ...(() => {
      const typos = unknownVariables(blocks.map((block) => ("text" in block && typeof block.text === "string" ? block.text : "")).join("\n"));
      return typos.length ? [`${typos.map((entry) => `{{${entry}}}`).join(", ")}: nothing fills these`] : [];
    })(),
  ];

  const updateBlock = (next: Block) => {
    const previous = blocks.find((block) => block.id === next.id);
    if (previous?.type === "field" && next.type === "field") {
      const others = blockFields(blocks.filter((block) => block.id !== next.id));
      list.update({ ...next, field: followLabel(previous.field, next.field, others, lockedKeys) });
      return;
    }
    list.update(next);
  };

  // A field from the record, put into the selected text where it was being written.
  const [caret, setCaret] = React.useState<number | null>(null);
  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    if (selected && (selected.type === "text" || selected.type === "terms" || selected.type === "heading")) {
      const at = caret ?? selected.text.length;
      updateBlock({ ...selected, text: `${selected.text.slice(0, at)}${token}${selected.text.slice(at)}` });
      setCaret(at + token.length);
      return;
    }
    void navigator.clipboard?.writeText(token).then(
      () => toast({ title: `Copied ${token}`, description: "Select some text on the page to put it straight in." }),
      () => undefined,
    );
  };

  const context: BlockRendererContext = {
    mode: building ? "preview" : "fill",
    values: sampleValues(),
    currency: "USD",
    lines: SAMPLE_LINES,
    totals: SAMPLE_TOTALS,
  };

  /* ── The bar ── */
  const bar = (
    <BuilderBar
      lead={
        <>
          {back ? <Button variant="quiet" iconOnly icon="back" label={back.label} onClick={back.onBack} /> : null}
          <span className="rb-mark" aria-hidden>
            <Icon name={kind === "EMAIL" ? "send" : kind === "FORM" ? "visits" : "invoice"} />
          </span>
          <div className="st-name">
            <b className="truncate">{draft.name || "Untitled"}</b>
            <span className="truncate">{ROLE[kind]}</span>
          </div>
        </>
      }
      name={draft.name}
      mode={mode}
      onMode={(next) => setMode(readOnly ? "preview" : next)}
      saved={saved}
      actions={<span className="muted rb-sample">Showing sample values</span>}
      publish={
        primary
          ? { label: primary.label, icon: primary.icon, onPublish: primary.onClick, busy: primary.busy }
          : onPublish
            ? { onPublish, disabled: problems.length > 0, busy: publishing }
            : undefined
      }
    />
  );

  /* ── The outline ── */
  const kinds: BlockKind[] = BLOCKS_FOR_KIND[kind].map((type) => ({ id: type, label: BLOCK_LABELS[type], icon: BLOCK_ICONS[type] }));
  const outline = (
    <BuilderOutline
      addLabel="Add"
      heading={kind === "EMAIL" ? "Message" : kind === "FORM" ? "Form" : "Page"}
      entries={blocks.map((block) => ({ id: block.id, icon: BLOCK_ICONS[block.type], title: blockTitle(block, kind, blocks) }))}
      selected={selected?.id ?? null}
      onSelect={(blockId) => {
        list.select(blockId);
        setTab("element");
      }}
      onMove={list.move}
      kinds={kinds}
      onAdd={(type) => {
        list.add(type);
        setTab("element");
      }}
    />
  );

  /* ── The page ── */
  const draw = (block: Block) => (
    <CanvasBlock
      key={block.id}
      plain
      preview={!building}
      selected={selected?.id === block.id}
      onSelect={() => {
        list.select(block.id);
        setTab("element");
      }}
      tag={{ icon: BLOCK_ICONS[block.type], label: blockTitle(block, kind, blocks) }}
      label={blockTitle(block, kind, blocks)}
    >
      <BlockRenderer blocks={[block]} context={context} />
    </CanvasBlock>
  );
  const starters = startersForKind(kind);
  const empty =
    blocks.length === 0 && !readOnly ? (
      <div className="pl">
        <p className="muted">Nothing on it yet. Add a block (/), or start from one of these.</p>
        <div className="rb-acts" style={{ marginTop: 0, flexWrap: "wrap" }}>
          {starters.map((starter) => (
            <Button key={starter.id} icon="file" onClick={() => setBlocks(starterBlocks(starter, draft.name))}>
              {starter.name}
            </Button>
          ))}
        </div>
      </div>
    ) : null;

  const subject = kind === "EMAIL" ? blocks.find((block) => block.type === "heading") : undefined;
  const canvas =
    kind === "EMAIL" ? (
      <div className="email-desk">
        <div className="card">
          <span className="muted">From {String(sampleValues()["company.name"] ?? "Your company")} &lt;{String(sampleValues()["company.email"] ?? "")}&gt;</span>
          <span className="muted">To {String(sampleValues()["customer.email"] ?? "")}</span>
          {subject ? draw(subject) : <span className="muted">No subject yet: add a heading.</span>}
        </div>
        <div className="card">
          {blocks.filter((block) => block.id !== subject?.id).map(draw)}
          {empty}
        </div>
        {problems.length ? <Problems problems={problems} /> : null}
      </div>
    ) : (
      <div className="desk2">
        <article className="a4" aria-label={draft.name}>
          {blocks.map(draw)}
          {empty}
          {problems.length ? <Problems problems={problems} /> : null}
        </article>
      </div>
    );

  /* ── The inspector ── */
  const inspector = (
    <BuilderInspector<InspectorTab>
      tabs={[
        { value: "element", label: "Element" },
        { value: "data", label: "Data", count: VARIABLE_CATALOGUE.length },
        { value: "settings", label: "Settings" },
      ]}
      tab={tab}
      onTab={setTab}
    >
      {tab === "element" ? (
        selected ? (
          <>
            <BlockInspector block={selected} kind={kind} blocks={blocks} lockedKeys={lockedKeys} onChange={updateBlock} onCaret={setCaret} />
            <div className="rb-acts">
              <Button icon="file" onClick={() => list.duplicate(selected)}>
                Duplicate
              </Button>
              <Button variant="quiet" icon="x" onClick={() => list.remove(selected)}>
                Delete
              </Button>
            </div>
          </>
        ) : (
          <p className="rb-note">Select something on the page to change it, or press / to add a block.</p>
        )
      ) : tab === "data" ? (
        <>
          <h2>Fields from the record</h2>
          <p className="rb-note">Each is filled in when the {TEMPLATE_KIND_LABELS[kind].toLowerCase()} is sent. Select some text on the page, then pick one to put it in.</p>
          {groupedVariables().map((group) => (
            <div key={group.group} className="pl">
              <div className="pl-h">{group.label}</div>
              <div className="rb-vars">
                {group.entries.map((variable) => (
                  <button key={variable.key} type="button" onClick={() => insertVariable(variable.key)}>
                    <span>{variable.label}</span>
                    <code>{`{{${variable.key}}}`}</code>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        settings
      )}
    </BuilderInspector>
  );

  return (
    <BuilderGrid
      scope="document"
      mode={mode}
      wideBar
      bar={bar}
      outline={outline}
      canvas={canvas}
      canvasLabel={draft.name || "The document"}
      inspector={inspector}
      inspectorLabel="Selected"
      framed={framed}
    />
  );
}

function Problems({ problems }: { problems: readonly string[] }) {
  return (
    <ul className="rb-problems">
      {problems.map((problem) => (
        <li key={problem}>
          <Icon name="warn" />
          {problem}
        </li>
      ))}
    </ul>
  );
}

/** The selected block, set up: only the settings that block has. */
function BlockInspector({
  block,
  kind,
  blocks,
  lockedKeys,
  onChange,
  onCaret,
}: {
  block: Block;
  kind: TemplateKind;
  blocks: readonly Block[];
  lockedKeys: ReadonlySet<string>;
  onChange: (block: Block) => void;
  onCaret: (at: number | null) => void;
}) {
  const title = blockTitle(block, kind, blocks);
  if (block.type === "columns") {
    return (
      <>
        <div className="ph">{title}</div>
        {(["left", "right"] as const).map((side) => (
          <div key={side} className="pl">
            <div className="pl-h">{side === "left" ? "On the left" : "On the right"}</div>
            {block[side].map((child, index) => (
              <div key={child.id} className="rb-line is-open">
                <div className="prow">
                  <b>{BLOCK_LABELS[child.type]}</b>
                  <Button
                    variant="quiet"
                    iconOnly
                    icon="x"
                    label={`Remove ${BLOCK_LABELS[child.type].toLowerCase()}`}
                    onClick={() => onChange({ ...block, [side]: block[side].filter((_, at) => at !== index) })}
                  />
                </div>
                <div className="rb-line-b">
                  <LeafSettings
                    block={child}
                    kind={kind}
                    lockedKeys={lockedKeys}
                    others={blocks}
                    onChange={(next) => onChange({ ...block, [side]: block[side].map((existing, at) => (at === index ? (next as LeafBlock) : existing)) })}
                    onCaret={onCaret}
                  />
                </div>
              </div>
            ))}
            <Select
              aria-label={`Add to the ${side}`}
              value=""
              onChange={(event) => {
                const type = event.target.value as BlockType;
                if (!type) return;
                onChange({ ...block, [side]: [...block[side], createBlock(type, blocks) as LeafBlock] });
              }}
            >
              <option value="">Add to the {side}</option>
              {BLOCKS_FOR_KIND[kind]
                .filter((type) => type !== "columns")
                .map((type) => (
                  <option key={type} value={type}>
                    {BLOCK_LABELS[type]}
                  </option>
                ))}
            </Select>
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {block.type === "field" ? null : <div className="ph">{title}</div>}
      <LeafSettings block={block} kind={kind} lockedKeys={lockedKeys} others={blocks} onChange={onChange} onCaret={onCaret} />
    </>
  );
}

function LeafSettings({
  block,
  kind,
  lockedKeys,
  others,
  onChange,
  onCaret,
}: {
  block: LeafBlock;
  kind: TemplateKind;
  lockedKeys: ReadonlySet<string>;
  others: readonly Block[];
  onChange: (block: Block) => void;
  onCaret: (at: number | null) => void;
}) {
  const id = `el-${block.id}`;
  const caretOf = (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => onCaret(event.currentTarget.selectionStart);
  switch (block.type) {
    case "heading":
      return (
        <>
          <Field label={kind === "EMAIL" && others.find((candidate) => candidate.type === "heading")?.id === block.id ? "Subject" : "Heading"} htmlFor={`${id}-text`}>
            <Input id={`${id}-text`} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} onSelect={caretOf} />
          </Field>
          <Field label="Size" htmlFor={`${id}-level`}>
            <Select id={`${id}-level`} value={String(block.level)} onChange={(event) => onChange({ ...block, level: Number(event.target.value) as 1 | 2 | 3 })}>
              <option value="1">Large</option>
              <option value="2">Medium</option>
              <option value="3">Small</option>
            </Select>
          </Field>
        </>
      );
    case "text":
    case "terms":
      return (
        <Field label={block.type === "terms" ? "Terms" : "Text"} htmlFor={`${id}-text`} help="Pick a field in Data to put it in where the cursor is.">
          <TextArea id={`${id}-text`} rows={block.type === "terms" ? 8 : 5} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} onSelect={caretOf} />
        </Field>
      );
    case "field":
      return (
        <FieldInspector
          field={block.field}
          index={0}
          fields={blockFields([...others]).filter((field) => field.key !== block.field.key)}
          types={FIELD_TYPES}
          keyLocked={lockedKeys.has(block.field.key)}
          requiredNote="It cannot be sent without it"
          onChange={(field) => onChange({ ...block, field })}
        />
      );
    case "divider":
      return <p className="rb-note">A line across the page.</p>;
    case "spacer":
      return (
        <Field label="Size" htmlFor={`${id}-size`}>
          <Select id={`${id}-size`} value={block.size} onChange={(event) => onChange({ ...block, size: event.target.value as "sm" | "md" | "lg" })}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </Select>
        </Field>
      );
    case "image":
      return (
        <>
          <Field label="Image" htmlFor={`${id}-source`}>
            <Select id={`${id}-source`} value={block.source} onChange={(event) => onChange({ ...block, source: event.target.value as "branding.logo" | "url" })}>
              <option value="branding.logo">Your logo, from Branding</option>
              <option value="url">An image</option>
            </Select>
          </Field>
          {block.source === "url" ? (
            <>
              <Field label="Address" htmlFor={`${id}-url`}>
                <Input id={`${id}-url`} value={block.url ?? ""} onChange={(event) => onChange({ ...block, url: event.target.value || undefined })} />
              </Field>
              <Field label="Described as" htmlFor={`${id}-alt`}>
                <Input id={`${id}-alt`} value={block.alt ?? ""} onChange={(event) => onChange({ ...block, alt: event.target.value || undefined })} />
              </Field>
            </>
          ) : (
            <p className="rb-note">The logo and colours come from Branding. Changing them there changes every document.</p>
          )}
        </>
      );
    case "table":
      return (
        <>
          <Field label="Rows from" htmlFor={`${id}-source`} help="The collection on the record that fills the rows.">
            <Input id={`${id}-source`} className="mono" value={block.source} onChange={(event) => onChange({ ...block, source: event.target.value })} />
          </Field>
          <div className="pl">
            <div className="pl-h">Columns</div>
            {block.columns.map((column, index) => (
              <span key={column.key} className="rb-pair rb-choice">
                <Input
                  aria-label={`Column ${index + 1}`}
                  value={column.label}
                  onChange={(event) => onChange({ ...block, columns: block.columns.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)) })}
                />
                <Button variant="quiet" iconOnly icon="x" label={`Remove ${column.label || `column ${index + 1}`}`} onClick={() => onChange({ ...block, columns: block.columns.filter((_, at) => at !== index) })} />
              </span>
            ))}
            {block.columns.length < 12 ? (
              <Button
                variant="quiet"
                icon="plus"
                onClick={() => {
                  const label = `Column ${block.columns.length + 1}`;
                  onChange({ ...block, columns: [...block.columns, { key: keyFromLabel(label, new Set(block.columns.map((column) => column.key))), label }] });
                }}
              >
                Add a column
              </Button>
            ) : null}
          </div>
        </>
      );
    case "lineItems":
      return (
        <>
          <Field label="Rows from" htmlFor={`${id}-rows`}>
            <Select id={`${id}-rows`} value="lines" onChange={() => undefined}>
              <option value="lines">The {kind === "INVOICE" ? "invoice" : kind === "RECEIPT" ? "receipt" : "quote"}&apos;s lines</option>
            </Select>
          </Field>
          <div className="pl">
            <div className="pl-h">Columns</div>
            <ColumnRow label="Item" note="line name" checked disabled />
            <ColumnRow label="Qty" note="with its unit" checked disabled />
            <ColumnRow label="Price" note="2 places" checked disabled />
            <ColumnRow label="Tax" note="the line's rate" checked={block.showTax} onChange={(showTax) => onChange({ ...block, showTax })} />
            <ColumnRow label="Discount" note="where one was given" checked={block.showDiscount} onChange={(showDiscount) => onChange({ ...block, showDiscount })} />
            <ColumnRow label="Amount" note="money" checked disabled />
          </div>
        </>
      );
    case "totals":
      return (
        <>
          <Setting htmlFor={`${id}-tax`} title="Tax" description="A line for the tax under the subtotal" control={<Switch id={`${id}-tax`} checked={block.showTax} onCheckedChange={(showTax) => onChange({ ...block, showTax })} />} />
          <Setting htmlFor={`${id}-paid`} title="Paid" description="What has been paid, under the total" control={<Switch id={`${id}-paid`} checked={block.showPaid} onCheckedChange={(showPaid) => onChange({ ...block, showPaid })} />} />
        </>
      );
    case "signature":
      return (
        <>
          <Field label="The line says" htmlFor={`${id}-label`}>
            <Input id={`${id}-label`} value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} />
          </Field>
          <Field label="Who signs" htmlFor={`${id}-party`}>
            <Select id={`${id}-party`} value={block.party} onChange={(event) => onChange({ ...block, party: event.target.value as "customer" | "us" | "both" })}>
              <option value="customer">The customer</option>
              <option value="us">Us</option>
              <option value="both">Both</option>
            </Select>
          </Field>
        </>
      );
  }
}

function ColumnRow({ label, note, checked, disabled, onChange }: { label: string; note: string; checked: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="prow">
      <span className="check">
        <input type="checkbox" aria-label={`Show ${label}`} checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
        {label}
      </span>
      <span>{note}</span>
    </label>
  );
}

/** The template's own settings: what it is, who can use it, whether it is in use, what has happened to it, and Delete. */
function SettingsPanel({
  record,
  draft,
  onDraft,
  onDelete,
  deleting,
}: {
  record: TemplateRecord;
  draft: Draft;
  onDraft: (next: Draft) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { toast } = useToast();
  const publicUrl = record.publicToken ? `${typeof window === "undefined" ? "" : window.location.origin}/f/${record.publicToken}` : null;
  const events: ActivityEvent[] = (record.events ?? []).map((event) => ({
    id: event.id,
    eventType: `TEMPLATE.${event.type.toUpperCase()}`,
    createdAt: event.createdAt,
    summary: event.type === "VIEW" ? "Opened" : event.type === "SUBMIT" ? "Filled in" : event.type,
    actor: event.source,
  }));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never");
  return (
    <>
      <h2>The template</h2>
      <Field label="Name" htmlFor="doc-name">
        <Input id="doc-name" value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} />
      </Field>
      <Field label="What it is for" htmlFor="doc-description" optional>
        <TextArea id="doc-description" rows={3} value={draft.description} onChange={(event) => onDraft({ ...draft, description: event.target.value })} />
      </Field>
      <div className="prow">
        <b>Used for</b>
        <span>{TEMPLATE_KIND_LABELS[record.kind]}</span>
      </div>
      <Setting
        htmlFor="doc-shared"
        title="The whole team can use it"
        description={draft.isShared ? "Published" : "A draft only you see"}
        control={<Switch id="doc-shared" checked={draft.isShared} onCheckedChange={(isShared) => onDraft({ ...draft, isShared })} />}
      />
      <Setting
        htmlFor="doc-active"
        title="In use"
        description={draft.isActive ? "Offered when sending" : "Retired: kept, not offered"}
        control={<Switch id="doc-active" checked={draft.isActive} onCheckedChange={(isActive) => onDraft({ ...draft, isActive })} />}
      />
      {publicUrl ? (
        <Field label="Public link" htmlFor="doc-link">
          <span className="rb-pair rb-choice">
            <Input id="doc-link" className="mono" readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} />
            <Button
              variant="quiet"
              iconOnly
              icon="link"
              label="Copy the public link"
              onClick={() => void navigator.clipboard?.writeText(publicUrl).then(() => toast({ title: "Link copied" }), () => undefined)}
            />
          </span>
        </Field>
      ) : null}
      <div className="pl">
        <div className="pl-h">So far</div>
        <div className="prow">
          <b>Opened</b>
          <span>
            {record.viewCount}, last {when(record.lastViewedAt)}
          </span>
        </div>
        <div className="prow">
          <b>Filled in</b>
          <span>
            {record.submitCount}, last {when(record.lastSubmitAt)}
          </span>
        </div>
        <div className="prow">
          <b>Built by</b>
          <span>{record.createdBy?.name ?? "—"}</span>
        </div>
      </div>
      <div className="pl">
        <div className="pl-h">Activity</div>
        <ActivityTrail events={events} emptyLabel="Nothing recorded against this template yet" />
      </div>
      <Button variant="quiet" icon="x" busy={deleting} onClick={onDelete}>
        Delete this template
      </Button>
    </>
  );
}
