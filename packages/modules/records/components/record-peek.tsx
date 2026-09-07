"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Badge, type Accent } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@corelithzw/ui/components/sheet";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useRecordTrail } from "./record-trail";
import {
  ENTITY_LABEL,
  parseRecordHref,
  type RecordEntity,
  type RecordRef,
} from "../record-ref";
import { ArrowRight, Building2, Funnel, MapPin, User, Users } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A look at a related record without leaving the one you are on.
 *
 * Half the references on a record page are answering a question, not starting
 * a journey: *which* company is this, is that the site we quoted last year,
 * has that person got a phone number on file. Following the link to find out
 * costs the page you were reading, the section you had open and the place in
 * the timeline you had scrolled to — and then costs them again coming back.
 *
 * So a plain click opens the record beside the one you are reading and the
 * page underneath does not move. The URL does not change either, which is the
 * point: nothing about where you are has been spent on a glance.
 *
 * What is deliberately *not* here is editing. A peek that can change six kinds
 * of record is a second record page with a worse layout, and two places to
 * edit the same thing is how they drift. The peek shows, and hands over.
 *
 * Escape hatches, because a preview that traps you is worse than no preview:
 * **Open full page** sits at the bottom where a commit belongs, and back in
 * `EntityLink` the modifier clicks are left entirely alone — ⌘-click and
 * middle-click are how people already say "I want this properly", and
 * intercepting them would be rude.
 */

/**
 * The glyph and hue for each kind of record.
 *
 * Same job the event table does on a timeline, one level up: a peek that
 * opens the same grey disc for a company and a site makes the reader read
 * the eyebrow to find out which arrived. Site keeps the orange it has as an
 * event, since "a place" means the same thing in both.
 */
const ENTITY_MARK: Record<RecordEntity, { icon: typeof Funnel; accent: Accent }> = {
  lead: { icon: Funnel, accent: "cyan" },
  deal: { icon: Funnel, accent: "blue" },
  company: { icon: Building2, accent: "indigo" },
  person: { icon: Users, accent: "violet" },
  site: { icon: MapPin, accent: "orange" },
  rep: { icon: User, accent: "green" },
};

type PeekSummary = {
  entity: RecordEntity;
  id: string;
  href: string;
  title: string;
  reference: string | null;
  status: { label: string; tone: "neutral" | "info" | "success" | "warn" | "danger" } | null;
  subtitle: string | null;
  properties: Array<{ label: string; value: string }>;
  archived: boolean;
};

type PeekValue = {
  /** Open the peek on a record. Returns false when the href is not one. */
  open: (href: string) => boolean;
  close: () => void;
  peeking: RecordRef | null;
};

const RecordPeekContext = createContext<PeekValue | null>(null);

export function useRecordPeek(): PeekValue {
  return useContext(RecordPeekContext) ?? DEAD_PEEK;
}

const DEAD_PEEK: PeekValue = { open: () => false, close: () => {}, peeking: null };

export function RecordPeekProvider({ children }: { children: ReactNode }) {
  const [peeking, setPeeking] = useState<RecordRef | null>(null);

  const open = useCallback((href: string) => {
    const ref = parseRecordHref(href);
    if (!ref) return false;
    setPeeking(ref);
    return true;
  }, []);

  const close = useCallback(() => setPeeking(null), []);

  const value = useMemo<PeekValue>(() => ({ open, close, peeking }), [open, close, peeking]);

  return (
    <RecordPeekContext.Provider value={value}>
      {children}
      <PeekSheet peeking={peeking} onClose={close} />
    </RecordPeekContext.Provider>
  );
}

function PeekSheet({ peeking, onClose }: { peeking: RecordRef | null; onClose: () => void }) {
  const router = useRouter();
  const { current, follow } = useRecordTrail();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["crm-peek", peeking?.entity, peeking?.id],
    enabled: Boolean(peeking),
    // `successResponse` returns the record itself, not a `{ data }` envelope.
    queryFn: () =>
      fetchJson<PeekSummary>(`/api/v2/crm/records/${peeking!.entity}/${peeking!.id}/summary`),
    // A peek is a glance, and the same record gets glanced at repeatedly on
    // one page. Keeping it a minute means the second look is instant.
    staleTime: 60_000,
  });

  const mark = peeking ? ENTITY_MARK[peeking.entity] : ENTITY_MARK.deal;
  const Icon = mark.icon;

  return (
    <Sheet open={Boolean(peeking)} onOpenChange={(next) => (next ? null : onClose())}>
      <SheetContent side="right" size="md" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-[var(--border-subtle)] p-4">
          <p className="text-sm uppercase tracking-[0.08em] text-[var(--text-subtle)]">
            {peeking ? ENTITY_LABEL[peeking.entity] : "Record"}
          </p>
          <SheetTitle className="flex items-start gap-2 text-left">
            <span
              data-accent={mark.accent}
              className="solid-mark mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              {isLoading ? "Loading…" : (data?.title ?? "Not found")}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isError ? (
            <p className="text-sm text-[var(--text-muted)]">
              This record could not be loaded. It may have been deleted.
            </p>
          ) : isLoading ? (
            <PeekSkeleton />
          ) : data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {data.reference ? (
                  <span className="font-mono text-sm text-[var(--text-subtle)]">
                    {data.reference}
                  </span>
                ) : null}
                {data.status ? <Badge tone={data.status.tone}>{data.status.label}</Badge> : null}
                {data.archived ? <Badge tone="neutral">Archived</Badge> : null}
              </div>

              {data.subtitle ? (
                <p className="text-sm text-[var(--text-muted)]">{data.subtitle}</p>
              ) : null}

              {data.properties.length > 0 ? (
                <dl className="grid gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  {data.properties.map((property) => (
                    <div key={property.label} className="contents">
                      <dt className="text-sm text-[var(--text-muted)]">{property.label}</dt>
                      <dd className="min-w-0 break-words text-sm text-[var(--text-strong)]">
                        {property.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-4">
          {/* Routed by hand rather than by a `<Link onClick={close}>`: closing
              a Radix dialog unmounts its own subtree, and the anchor's default
              navigation goes with it. Pushing the trail first is what makes
              the next page's back arrow name the record this peek was opened
              from rather than that record's list. */}
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              if (current) follow(current);
              onClose();
              router.push(data.href);
            }}
          >
            Open full page
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PeekSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className={cn(
            "h-4 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]",
            row === 0 ? "w-1/3" : row === 3 ? "w-1/2" : "w-3/4",
          )}
        />
      ))}
    </div>
  );
}
