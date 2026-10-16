"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button } from "@corelithzw/react";
import { ReportTable, amt, badge, node, txt, type ReportRow } from "@/components/accounting/report-table";
import { RecordAttributes } from "@/components/records/record-attributes";
import { RecordPageShell, type RecordTab } from "@/components/records/record-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { KnowledgeEntryView } from "@/lib/crm/knowledge/entries";
import type { ReadResult } from "@/lib/crm/knowledge/read-with-vane";
import type { KnowledgeDocView, KnowledgePriceView } from "@/lib/crm/knowledge/store";
import { Calendar, Check, Coins, FileText, Lightbulb, Sparkles, Tag, Trash, User, X } from "@/lib/icons";

import { EntryDialog, EntryList, KNOWLEDGE_QUERY_KEY, type EntryDraft } from "./entry-list";

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One document in the knowledge base: its prices (the ones Vane quotes from,
 * and the ones it found that wait to be kept) and its words. A prose document
 * is read for its prices by Vane on request; nothing it finds is used until a
 * person keeps it.
 */
export function KnowledgeDoc({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [chosenTab, setTab] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const key = [...KNOWLEDGE_QUERY_KEY, id];

  const query = useQuery({ queryKey: key, queryFn: () => fetchJson<{ data: KnowledgeDocView; canEdit: boolean }>(`/api/v2/crm/knowledge/${id}`) });
  const entries = useQuery({
    queryKey: [...key, "entries"],
    queryFn: () => fetchJson<{ data: KnowledgeEntryView[] }>(`/api/v2/crm/knowledge/entries?docId=${id}`),
  });
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY })]);

  const find = useMutation({
    mutationFn: () => fetchJson<ReadResult>(`/api/v2/crm/knowledge/${id}/vane-read`, { method: "POST" }),
    onSuccess: async (result) => {
      await refresh();
      const entriesFound = result.faqs + result.facts + result.tips;
      setTab(entriesFound ? "knowledge" : "prices");
      const parts = [
        result.faqs ? `${result.faqs} ${result.faqs === 1 ? "FAQ" : "FAQs"}` : null,
        result.facts ? `${result.facts} ${result.facts === 1 ? "fact" : "facts"}` : null,
        result.tips ? `${result.tips} ${result.tips === 1 ? "tip" : "tips"}` : null,
        result.prices ? `${result.prices} ${result.prices === 1 ? "price" : "prices"}` : null,
      ].filter(Boolean);
      toast({
        title: parts.length ? `Vane found ${parts.join(", ")}` : "Vane found nothing new in it",
        description: parts.length ? "Keep the ones that are right; Vane answers and quotes only from what is kept." : undefined,
      });
    },
    onError: (error) => toast({ title: "Vane could not read it", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const decide = useMutation({
    mutationFn: (body: { ids: string[]; keep: boolean } | { remove: string }) =>
      fetchJson(`/api/v2/crm/knowledge/${id}/prices`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refresh,
    onError: (error) => toast({ title: "That did not change", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="p-6">
        <Alert tone="danger" title="This document did not load">
          {getApiErrorMessage(query.error, "Check the connection and try again.")}
        </Alert>
      </div>
    );
  }

  const { data: doc, canEdit } = query.data;
  const kept = doc.prices.filter((price) => price.kept);
  const waiting = doc.prices.filter((price) => !price.kept);
  const busy = decide.isPending || find.isPending;

  const priceRow = (price: KnowledgePriceView): ReportRow => ({
    id: price.id,
    cells: [
      node(
        <span className="block min-w-0">
          <span className="block font-medium text-[var(--text)]">{price.name}</span>
          {price.description ? <span className="block text-sm text-[var(--text-muted)]">{price.description}</span> : null}
          <span className="block truncate text-sm text-[var(--text-subtle)]" title={price.source}>
            {price.source}
          </span>
        </span>,
      ),
      txt(price.unit ?? "—", { tone: price.unit ? "body" : "subtle" }),
      amt(money(price.unitPrice, price.currency)),
      price.kept
        ? node(
            canEdit ? (
              <Button size="sm" variant="ghost" iconOnly disabled={busy} onClick={() => decide.mutate({ remove: price.id })} aria-label={`Remove ${price.name}`}>
                <Trash aria-hidden="true" className="size-4" />
              </Button>
            ) : null,
          )
        : canEdit
          ? node(
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide.mutate({ ids: [price.id], keep: true })} aria-label={`Keep ${price.name}`}>
                  <Check aria-hidden="true" className="size-4" /> Keep
                </Button>
                <Button size="sm" variant="ghost" iconOnly disabled={busy} onClick={() => decide.mutate({ ids: [price.id], keep: false })} aria-label={`Not ${price.name}`}>
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </span>,
            )
          : badge("Waiting", "warn"),
    ],
  });

  const prices = (
    <div className="space-y-4">
      {waiting.length > 0 ? (
        <section className="space-y-2" aria-label="Prices Vane found">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Vane found {waiting.length} {waiting.length === 1 ? "price" : "prices"}: keep the ones that are right
            </h3>
            {canEdit && waiting.length > 1 ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide.mutate({ ids: waiting.map((price) => price.id), keep: true })}>
                Keep all {waiting.length}
              </Button>
            ) : null}
          </div>
          <ReportTable
            label="Prices Vane found"
            tracks="minmax(0,1fr) 90px 120px 120px"
            columns={[{ label: "Item" }, { label: "Unit" }, { label: "Price", align: "right" }, { label: "", align: "right" }]}
            rows={waiting.map(priceRow)}
          />
        </section>
      ) : null}
      <ReportTable
        label="Kept prices"
        tracks="minmax(0,1fr) 90px 120px 52px"
        columns={[{ label: waiting.length ? "Kept" : "Item" }, { label: "Unit" }, { label: "Price", align: "right" }, { label: "", align: "right" }]}
        rows={kept.map(priceRow)}
        emptyLabel={
          doc.kind === "PRICE_LIST"
            ? "No row in it had a name and a price."
            : waiting.length
              ? "None kept yet."
              : "No prices kept from it. Vane answers from its words."
        }
      />
    </div>
  );

  const readWithVane = canEdit ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-3">
      <p className="text-sm text-[var(--text-muted)]">
        {doc.vaneReadAt
          ? "Vane read it. Keep what is right; Vane answers and quotes only from what is kept."
          : "Vane can read it for its FAQs, facts, tips and prices. You keep what is right before Vane uses it."}
      </p>
      <Button size="sm" variant="secondary" loading={find.isPending} onClick={() => find.mutate()} startIcon={<Sparkles aria-hidden="true" className="size-4" />}>
        {doc.vaneReadAt ? "Read it again" : "Read it with Vane"}
      </Button>
    </div>
  ) : null;

  const docEntries = entries.data?.data ?? [];
  const knowledge = (
    <div className="space-y-4">
      {readWithVane}
      <EntryList
        entries={docEntries}
        canEdit={canEdit}
        onEdit={(entry) => setEditing({ id: entry.id, kind: entry.kind, title: entry.title, body: entry.body })}
        empty={doc.vaneReadAt ? "Vane found no FAQs, facts or tips in it." : "Nothing taken from it yet."}
      />
    </div>
  );

  const words = (
    <div className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]">{doc.text}</div>
  );

  const tabs: RecordTab[] = [
    {
      value: "knowledge",
      label: "FAQs, facts and tips",
      icon: Lightbulb,
      count: docEntries.filter((entry) => entry.kept).length,
      attention: docEntries.some((entry) => !entry.kept),
      titled: true,
      content: knowledge,
    },
    { value: "prices", label: "Prices", icon: Coins, count: kept.length, attention: waiting.length > 0, titled: true, content: prices },
    { value: "words", label: "Words", icon: FileText, titled: true, content: words },
  ];

  return (
    <RecordPageShell
      icon={FileText}
      backHref="/crm/knowledge"
      backLabel="Knowledge"
      title={doc.title}
      subtitle={doc.fileName}
      figure={kept.length ? `${kept.length} ${kept.length === 1 ? "price" : "prices"}` : undefined}
      actions={
        canEdit
          ? [
              { label: "Open the file", onSelect: () => window.open(doc.url, "_blank", "noopener") },
              { label: "Remove from the knowledge base", destructive: true, icon: <Trash aria-hidden="true" className="size-4" />, onSelect: () => setRemoving(true) },
            ]
          : [{ label: "Open the file", onSelect: () => window.open(doc.url, "_blank", "noopener") }]
      }
      attributes={
        <RecordAttributes
          attributes={[
            { id: "kind", label: "What it is", icon: Tag, display: doc.kind === "PRICE_LIST" ? "A price list, read row by row" : "A document, read for its words" },
            { id: "by", label: "Uploaded by", icon: User, display: doc.uploadedBy ?? "Someone in the workspace" },
            { id: "when", label: "Uploaded", icon: Calendar, display: new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
            ...(doc.pages ? [{ id: "pages", label: "Pages", icon: FileText, display: String(doc.pages) }] : []),
            { id: "quotes", label: "Quotes priced from it", icon: Coins, display: doc.quotedIn ? String(doc.quotedIn) : "None yet" },
          ]}
        />
      }
      activeTab={chosenTab ?? (doc.kind === "PRICE_LIST" ? "prices" : "knowledge")}
      onTabChange={setTab}
      tabs={tabs}
    >
      <EntryDialog draft={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        ask={{
          title: `Remove ${doc.title}?`,
          body: `Its ${kept.length ? `${kept.length} prices and its ` : ""}words go from the knowledge base, so Vane stops answering and quoting from them. FAQs, facts and tips kept from it stay. Quotes already priced from it keep their lines.`,
          keep: "Keep it",
          go: "Remove it",
          fill: "bad",
        }}
        onConfirm={async () => {
          try {
            await fetchJson(`/api/v2/crm/knowledge/${id}`, { method: "DELETE" });
          } catch (error) {
            throw new Error(getApiErrorMessage(error));
          }
          await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
          toast({ title: `${doc.title} is removed`, variant: "success" });
          router.push("/crm/knowledge");
        }}
      />
    </RecordPageShell>
  );
}
