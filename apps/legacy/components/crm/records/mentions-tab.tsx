"use client";

import { useQuery } from "@tanstack/react-query";

import { EmptyState, Skeleton, Stack } from "@corelithzw/react";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { RichTextRenderer } from "@/components/crm/collaboration/rich-text-renderer";
import { fetchJson } from "@corelithzw/platform/api-client";

import { EntityLink } from "@/components/records/entity-link";

type Mention = {
  id: string;
  kind: "comment" | "activity";
  body: string;
  occurredAt: string;
  authorName: string | null;
  source: { kind: string; id: string; label: string; href: string } | null;
};

/**
 * The other half of a link.
 *
 * A record page showed what it points at and nothing about what points back,
 * so the site that three deals keep referring to looked unconnected to any of
 * them. The references have been in the note bodies all along; this reads
 * them the other way round.
 *
 * The text renders through the same renderer the timeline uses, so a mention
 * inside a mention is still a link you can follow — which is the point: this
 * is for getting from one record to the next.
 */
export function MentionsTab({ recordId }: { recordId: string }) {
  const query = useQuery({
    queryKey: ["crm", "mentions", recordId],
    queryFn: () => fetchJson<{ data: Mention[] }>(`/api/v2/crm/mentions?recordId=${recordId}`),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }

  const mentions = query.data?.data ?? [];

  if (mentions.length === 0) {
    return (
      <EmptyState
        title="Not mentioned anywhere yet"
        body="When somebody links this record in a note or a comment on another record, it shows up here."
      />
    );
  }

  return (
    <Stack as="ul" gap="xs" className="max-w-3xl">
      {mentions.map((mention) => (
        <li
          key={`${mention.kind}-${mention.id}`}
          className="rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--surface-subtle)]"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            {mention.source ? (
              <EntityLink href={mention.source.href} className="font-medium">
                {mention.source.label}
              </EntityLink>
            ) : (
              <span className="font-medium">Somewhere</span>
            )}
            <span className="text-[var(--text-muted)]">
              {mention.authorName ? `${mention.authorName} · ` : ""}
              <ClientDate value={mention.occurredAt} mode="datetime" />
            </span>
          </div>
          <RichTextRenderer body={mention.body} className="mt-1" />
        </li>
      ))}
    </Stack>
  );
}
