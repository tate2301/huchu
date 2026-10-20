"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { RuleDrawer } from "@/components/books/bk-ledger-setup-drawers";
import { BkPostingRulesView } from "@/components/books/bk-ledger-setup-views";
import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import type { PostingRulesPage, PostingRulesQuery } from "@/lib/books/ledger-setup";

/**
 * Books → Ledger → Posting rules (BkPostingRules): the rules with New rule (N)
 * and each one's editor (conditions, lines, Try it), the tender mappings and
 * the readiness. Moved from `/accounting/posting-rules`; its failures are
 * Needs posting, its seed is Set up the books.
 */
function PostingRules() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, onQuery } = useListQuery<PostingRulesQuery>({ tab: "rules", q: "", source: "" });
  const [open, setOpen] = React.useState(false);
  const [ruleId, setRuleId] = React.useState<string | null>(null);
  const query = useQuery({ queryKey: ["books", "posting-rules", search], queryFn: () => fetchJson<PostingRulesPage>(`/api/books/posting-rules${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const data = query.data;
  return (
    <>
      <PageChrome
        title="Posting rules"
        primary={{
          label: "New rule",
          icon: "plus",
          shortcut: "N",
          disabled: data && !data.can.change ? "Only the owner or the accountant can change the posting rules" : undefined,
          onClick: () => {
            setRuleId(null);
            setOpen(true);
          },
        }}
      />
      <BooksPage screen="bk-b">
        {data ? (
          <BkPostingRulesView
            data={data}
            onQuery={onQuery}
            onExport={() => downloadCsv("posting-rules.csv", ["Rule", "When", "Debit", "Credit", "This month", "State"], data.rows.map((row) => [row.name, row.when, row.debit, row.credit, row.thisMonth, row.state]))}
            onEdit={(id) => {
              setRuleId(id);
              setOpen(true);
            }}
          />
        ) : query.isError ? (
          <BooksError what="Posting rules" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <RuleDrawer
        open={open}
        ruleId={ruleId}
        sources={data?.allSources ?? []}
        onOpenChange={setOpen}
        onSaved={(message) => {
          toast({ title: message, variant: "success" });
          client.invalidateQueries({ queryKey: ["books"] });
          client.invalidateQueries({ queryKey: ["accounting", "posting-rules"] });
        }}
      />
    </>
  );
}

/** Books → Ledger → Posting rules (design/core-modules/boards/view/BkPostingRules.html). */
export default function PostingRulesPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <PostingRules />
    </React.Suspense>
  );
}
