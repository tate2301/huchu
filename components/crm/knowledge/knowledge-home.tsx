"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { ReportTable, amt, node, txt, type ReportRow } from "@/components/accounting/report-table";
import { Kit, VaneMark } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { GroupedRecordList, type RecordListSection } from "@/components/records/record-list-groups";
import { ClientDate } from "@/components/ui/client-date";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { VaneText } from "@/components/vane/vane-text";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { KnowledgeAnswer } from "@/lib/crm/knowledge/ask";
import type { KnowledgeEntryView } from "@/lib/crm/knowledge/entries";
import type { KeptPriceRow, KnowledgeRow } from "@/lib/crm/knowledge/store";
import { Coins, FileText, Lightbulb, Question, Send } from "@/lib/icons";

import { ENTRY_ICON, EntryDialog, EntryList, KNOWLEDGE_QUERY_KEY, UploadDialog, type EntryDraft } from "./entry-list";

const TABS = [
  { id: "everything", label: "Everything" },
  { id: "faq", label: "FAQs", icon: Question },
  { id: "fact", label: "Facts", icon: FileText },
  { id: "tip", label: "Tips", icon: Lightbulb },
  { id: "prices", label: "Prices", icon: Coins },
  { id: "documents", label: "Documents", icon: FileText },
] as const;
type Tab = (typeof TABS)[number]["id"];

const KIND_OF: Record<"faq" | "fact" | "tip", KnowledgeEntryView["kind"]> = { faq: "FAQ", fact: "FACT", tip: "TIP" };

const money = (n: number, currency: string) => `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * CRM → Knowledge: everything the business knows, in one place. Ask Vane
 * anything about the business at the top and it answers from what is here,
 * with where it found it; below, the FAQs, facts and tips people wrote or kept,
 * the prices Vane quotes from, and the documents they came from. Anybody in
 * the CRM reads it; people who can change CRM settings add to it.
 */
export function KnowledgeHome() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((row) => row.id === params.get("tab"))?.id ?? "everything") as Tab;
  const adding = params.get("add");
  const [editing, setEditing] = useState<EntryDraft | null>(null);

  const docs = useQuery({
    queryKey: [...KNOWLEDGE_QUERY_KEY, "docs"],
    queryFn: () => fetchJson<{ data: KnowledgeRow[]; prices: KeptPriceRow[]; canEdit: boolean }>("/api/v2/crm/knowledge"),
  });
  const entries = useQuery({
    queryKey: [...KNOWLEDGE_QUERY_KEY, "entries"],
    queryFn: () => fetchJson<{ data: KnowledgeEntryView[]; canEdit: boolean }>("/api/v2/crm/knowledge/entries"),
  });
  const canEdit = docs.data?.canEdit ?? false;
  const all = useMemo(() => entries.data?.data ?? [], [entries.data]);
  const of = (kind: KnowledgeEntryView["kind"]) => all.filter((entry) => entry.kind === kind);

  const go = (next: { tab?: Tab; add?: string | null }) => {
    const query = new URLSearchParams(params.toString());
    if (next.tab !== undefined) {
      if (next.tab === "everything") query.delete("tab");
      else query.set("tab", next.tab);
    }
    if (next.add !== undefined) {
      if (next.add) query.set("add", next.add);
      else query.delete("add");
    }
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };
  const draftFor = (kind: string | null): EntryDraft | null =>
    kind === "faq" || kind === "fact" || kind === "tip" ? { kind: KIND_OF[kind], title: "", body: "" } : null;

  const tabHref = (id: Tab) => {
    const query = new URLSearchParams(params.toString());
    query.delete("add");
    if (id === "everything") query.delete("tab");
    else query.set("tab", id);
    const search = query.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  const counts: Record<Tab, number | undefined> = {
    everything: undefined,
    faq: of("FAQ").length,
    fact: of("FACT").length,
    tip: of("TIP").length,
    prices: docs.data?.prices.length,
    documents: docs.data?.data.length,
  };
  const loading = docs.isLoading || entries.isLoading;

  return (
    <>
      <PageChrome
        title="Knowledge"
        sub="What the business knows. Vane answers and quotes from it."
        primary={
          canEdit
            ? {
                label: "Add",
                icon: "plus",
                menu: [
                  { label: "An FAQ", href: `${pathname}?add=faq` },
                  { label: "A fact", href: `${pathname}?add=fact` },
                  { label: "A tip", href: `${pathname}?add=tip` },
                  { label: "A document", href: `${pathname}?add=document` },
                ],
              }
            : null
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <AskVane canEdit={canEdit} onKeep={(answer) => setEditing({ kind: "FAQ", title: answer.question, body: answer.answer })} />

        <SectionTabs label="What to show">
          {TABS.map((row) => (
            <SectionTab key={row.id} to={tabHref(row.id)} active={tab === row.id} count={counts[row.id] || undefined}>
              {row.label}
            </SectionTab>
          ))}
        </SectionTabs>

        {docs.error || entries.error ? (
          <p role="alert" className="text-sm text-[var(--status-error-text)]">
            {getApiErrorMessage(docs.error ?? entries.error, "The knowledge base did not load. Check the connection and try again.")}
          </p>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tab === "everything" ? (
          <Everything entries={all} docs={docs.data?.data ?? []} prices={docs.data?.prices.length ?? 0} canEdit={canEdit} onEdit={edit} onAdd={(kind) => go({ add: kind })} tabHref={tabHref} />
        ) : tab === "faq" || tab === "fact" || tab === "tip" ? (
          <EntryList
            entries={of(KIND_OF[tab])}
            canEdit={canEdit}
            onEdit={edit}
            empty={
              tab === "faq"
                ? "No FAQs yet. Add the questions clients and new staff ask, with their answers, or keep an answer Vane gave above."
                : tab === "fact"
                  ? "No facts yet. Add what everyone should know about the business: where you work, your hours, what you guarantee."
                  : "No tips yet. Add what your best people know about doing the work well."
            }
          />
        ) : tab === "prices" ? (
          <Prices prices={docs.data?.prices ?? []} />
        ) : (
          <Documents rows={docs.data?.data ?? []} canEdit={canEdit} />
        )}
      </div>

      <EntryDialog draft={editing ?? draftFor(adding)} onClose={() => (editing ? setEditing(null) : go({ add: null }))} />
      <UploadDialog open={adding === "document"} onClose={() => go({ add: null })} onDone={(id) => router.push(`/crm/knowledge/${id}`)} />
    </>
  );

  function edit(entry: KnowledgeEntryView) {
    setEditing({ id: entry.id, kind: entry.kind, title: entry.title, body: entry.body });
  }
}

/** Ask Vane about the business, answered here from the knowledge base, with what it went by. */
function AskVane({ canEdit, onKeep }: { canEdit: boolean; onKeep: (answer: KnowledgeAnswer) => void }) {
  const [question, setQuestion] = useState("");
  const ask = useMutation({
    mutationFn: (text: string) => fetchJson<KnowledgeAnswer>("/api/v2/crm/knowledge/ask", { method: "POST", body: JSON.stringify({ question: text }) }),
  });
  const answer = ask.data;

  return (
    <section aria-label="Ask Vane" className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim().length >= 3) ask.mutate(question.trim());
        }}
      >
        <Kit className="flex shrink-0">
          <VaneMark size={20} />
        </Kit>
        <label htmlFor="knowledge-ask" className="sr-only">
          Ask Vane about the business
        </label>
        <input
          id="knowledge-ask"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about the business: “Do we need a deposit?”, “What does screed cost?”"
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          maxLength={500}
        />
        <Button type="submit" variant="secondary" loading={ask.isPending} disabled={question.trim().length < 3} startIcon={<Send aria-hidden="true" className="size-4" />}>
          Ask
        </Button>
      </form>
      {ask.error ? (
        <p role="alert" className="text-sm text-[var(--status-error-text)]">
          {getApiErrorMessage(ask.error, "Vane could not answer. Try again.")}
        </p>
      ) : null}
      {answer ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-3" aria-live="polite">
          <p className="text-sm font-medium text-[var(--text)]">{answer.question}</p>
          <div className="text-sm text-[var(--text)]">
            <Kit>
              <VaneText text={answer.answer} />
            </Kit>
          </div>
          {answer.sources.length ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-subtle)]">
              <span>Went by</span>
              {answer.sources.map((source) => (
                <Link key={`${source.href}-${source.note}`} href={source.href} className="underline underline-offset-2 hover:text-[var(--text)]">
                  {source.title}
                  {source.note && source.note !== source.title ? ` · ${source.note}` : ""}
                </Link>
              ))}
            </p>
          ) : null}
          {canEdit ? (
            <Button size="sm" variant="ghost" startIcon={<Question aria-hidden="true" className="size-4" />} onClick={() => onKeep(answer)}>
              {answer.answered ? "Keep it as an FAQ" : "Write the answer as an FAQ"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The landing: a few of each kind, with the way to the rest. */
function Everything({
  entries,
  docs,
  prices,
  canEdit,
  onEdit,
  onAdd,
  tabHref,
}: {
  entries: KnowledgeEntryView[];
  docs: KnowledgeRow[];
  prices: number;
  canEdit: boolean;
  onEdit: (entry: KnowledgeEntryView) => void;
  onAdd: (kind: string) => void;
  tabHref: (tab: Tab) => string;
}) {
  const sections = [
    { kind: "FAQ" as const, tab: "faq" as const, title: "FAQs", add: "faq", lede: "The questions clients and new staff ask, answered once." },
    { kind: "FACT" as const, tab: "fact" as const, title: "Facts", add: "fact", lede: "What everyone should know about the business." },
    { kind: "TIP" as const, tab: "tip" as const, title: "Tips", add: "tip", lede: "What your best people know about doing the work well." },
  ];
  const waiting = entries.filter((entry) => !entry.kept).length;
  return (
    <div className="space-y-8">
      {waiting > 0 && canEdit ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text)]">
          <Badge tone="warn" size="sm">
            {waiting} to keep
          </Badge>
          Vane read your documents and found {waiting === 1 ? "something" : "things"} worth knowing. Keep what is right below.
        </p>
      ) : null}
      {sections.map((section) => {
        const rows = entries.filter((entry) => entry.kind === section.kind);
        const Icon = ENTRY_ICON[section.kind];
        return (
          <section key={section.kind} aria-labelledby={`knowledge-${section.tab}`} className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id={`knowledge-${section.tab}`} className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
                  <Icon aria-hidden="true" className="size-4 text-[var(--text-subtle)]" />
                  {section.title}
                  {rows.length ? <span className="font-normal text-[var(--text-subtle)]">{rows.length}</span> : null}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">{section.lede}</p>
              </div>
              {rows.length > 4 ? (
                <Link href={tabHref(section.tab)} className="text-sm text-[var(--text-link)] hover:underline">
                  All {rows.length}
                </Link>
              ) : canEdit ? (
                <Button size="sm" variant="ghost" onClick={() => onAdd(section.add)}>
                  Add {section.kind === "FAQ" ? "an FAQ" : section.kind === "FACT" ? "a fact" : "a tip"}
                </Button>
              ) : null}
            </div>
            <EntryList entries={rows.slice(0, 4)} canEdit={canEdit} onEdit={onEdit} empty={`None yet.${canEdit ? " Add one, or upload a document and have Vane find them." : ""}`} />
          </section>
        );
      })}
      <p className="text-sm text-[var(--text-muted)]">
        <Link href={tabHref("prices")} className="text-[var(--text-link)] hover:underline">
          {prices} {prices === 1 ? "price" : "prices"}
        </Link>{" "}
        Vane quotes from, in{" "}
        <Link href={tabHref("documents")} className="text-[var(--text-link)] hover:underline">
          {docs.length} {docs.length === 1 ? "document" : "documents"}
        </Link>
        .
      </p>
    </div>
  );
}

/** Every kept price, with the document it is in. */
function Prices({ prices }: { prices: KeptPriceRow[] }) {
  const rows: ReportRow[] = prices.map((price) => ({
    id: price.id,
    cells: [
      node(
        <span className="block min-w-0">
          <span className="block font-medium text-[var(--text)]">{price.name}</span>
          {price.description ? <span className="block text-sm text-[var(--text-muted)]">{price.description}</span> : null}
        </span>,
      ),
      txt(price.unit ?? "—", { tone: price.unit ? "body" : "subtle" }),
      amt(money(price.unitPrice, price.currency)),
      node(
        <Link href={`/crm/knowledge/${price.doc.id}`} className="block truncate text-sm text-[var(--text-link)] hover:underline">
          {price.doc.title}
        </Link>,
      ),
    ],
  }));
  return (
    <ReportTable
      label="Prices Vane quotes from"
      tracks="minmax(0,1fr) 80px 110px 180px"
      columns={[{ label: "Item" }, { label: "Unit" }, { label: "Price", align: "right" }, { label: "From" }]}
      rows={rows}
      emptyLabel="No prices yet. Upload a price list (.xlsx or .csv), or a rate card for Vane to read."
    />
  );
}

/** The documents the knowledge came from: price lists first, then the rest. */
function Documents({ rows, canEdit }: { rows: KnowledgeRow[]; canEdit: boolean }) {
  const sections = useMemo<RecordListSection[]>(() => {
    const toRow = (row: KnowledgeRow) => ({
      id: row.id,
      href: `/crm/knowledge/${row.id}`,
      title: row.title,
      subtitle: (
        <>
          {row.fileName}
          {" · "}
          <ClientDate value={row.createdAt} mode="date" />
          {row.uploadedBy ? ` · ${row.uploadedBy}` : ""}
        </>
      ),
      status: row.waiting ? (
        <Badge tone="warn" size="sm">
          {row.waiting} to keep
        </Badge>
      ) : null,
      facts: [
        {
          label: "Holds",
          value: [row.prices ? `${row.prices} ${row.prices === 1 ? "price" : "prices"}` : null, row.pages ? `${row.pages} ${row.pages === 1 ? "page" : "pages"}` : null].filter(Boolean).join(" · ") || "Words",
          primary: true,
        },
      ],
    });
    return [
      { id: "prices", label: "Price lists", rows: rows.filter((row) => row.kind === "PRICE_LIST").map(toRow) },
      { id: "documents", label: "Documents", rows: rows.filter((row) => row.kind === "DOCUMENT").map(toRow) },
    ];
  }, [rows]);
  return (
    <GroupedRecordList
      sections={sections}
      emptyTitle="No documents yet"
      emptyBody={canEdit ? "Upload a price list, rate card, handbook or terms with Add → A document." : "Someone who can change CRM settings uploads the documents Vane reads."}
    />
  );
}
