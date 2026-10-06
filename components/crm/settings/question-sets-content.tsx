"use client";

/**
 * The site-visit questions, from CRM settings.
 *
 * They are built in the builder (`/crm/build`), where a question is filled in
 * as it is made and the quote it drafts is priced beside it. Settings lists
 * them so they can still be found from here, and opens each in the builder
 * rather than keeping a second editor that could disagree with the first.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";
import { ChevronRight } from "@/lib/icons";

type SetSummary = {
  id: string;
  key: string;
  name: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  isActive: boolean;
  product: { id: string; name: string } | null;
  sourceTemplateKey: string | null;
  questionCount: number;
  quoteLineCount: number;
};

const KIND_LABELS: Record<SetSummary["kind"], string> = {
  PRODUCT: "Product",
  EVIDENCE: "Photographs",
  CLOSEOUT: "Close-out",
};

export function QuestionSetsContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "question-sets"],
    queryFn: () => fetchJson<{ data: SetSummary[]; canEdit: boolean }>("/api/v2/crm/question-sets"),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  return (
    <Stack gap="md" className="max-w-3xl">
      <p className="text-sm text-[var(--text-muted)]">
        What a rep is asked on site. A visit opens a section per product being
        quoted, so only the questions that apply are asked. Each opens in{" "}
        <Link href="/crm/build" className="font-medium text-[var(--text-strong)] underline underline-offset-2">
          Build
        </Link>
        {data.canEdit ? ", where new ones start from a template." : ", read-only for you."}
      </p>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {data.data.map((set) => (
          <li key={set.id}>
            <Link href={`/crm/build/visits/${set.id}`} className="flex w-full items-center justify-between gap-3 py-3 text-left">
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--text-strong)]">{set.name}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {KIND_LABELS[set.kind]} · {set.questionCount}{" "}
                  {set.questionCount === 1 ? "question" : "questions"}
                  {set.product ? ` · ${set.product.name}` : ""}
                  {set.quoteLineCount ? " · drafts a quote" : ""}
                  {set.isActive ? "" : " · draft"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
