"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Badge, type Accent } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, fetchJson } from "@/lib/api-client";
import type { PeekSummary } from "@/lib/records/peek-summary";
import { useRecordTrail } from "@/components/records/record-trail";
import {
  ENTITY_LABEL,
  isPeekable,
  parseRecordHref,
  recordSummaryPath,
  type RecordEntity,
  type RecordRef,
} from "@/lib/crm/record-ref";
import { ArrowRight, Building2, X, Funnel, MapPin, User, Users, Work } from "@/lib/icons";
import { RecordStepper } from "@/components/workspace/button-group-parts";
import { useShell } from "@/components/layout/shell-state";
import { parseSequence, SEQUENCE_KEY, stepAt } from "@/lib/nav/sequence";
import { cn } from "@/lib/utils";

function readSequence() {
  try {
    return parseSequence(window.sessionStorage.getItem(SEQUENCE_KEY));
  } catch {
    return null;
  }
}

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
  // The school types read the same way: a child and a parent are people, a
  // house is a place, so each takes the mark its CRM counterpart already has
  // rather than a second vocabulary for the same shapes.
  student: { icon: Users, accent: "violet" },
  guardian: { icon: Users, accent: "cyan" },
  teacher: { icon: User, accent: "green" },
  class: { icon: Building2, accent: "indigo" },
  subject: { icon: Funnel, accent: "blue" },
  hostel: { icon: MapPin, accent: "orange" },
  // Not peekable yet — it has no summary endpoint — but the map covers every
  // record type so one never opens as a blank disc when it is.
  project: { icon: Work, accent: "green" },
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
    // Knowing which record a link points at and being able to describe one
    // without going there are different questions. A type with no summary
    // endpoint answers the first and not the second, so the link navigates —
    // which is the honest outcome, and better than a panel that opens on a 404.
    if (!ref || !isPeekable(ref)) return false;
    setPeeking(ref);
    return true;
  }, []);

  const close = useCallback(() => setPeeking(null), []);

  const value = useMemo<PeekValue>(() => ({ open, close, peeking }), [open, close, peeking]);

  return (
    <RecordPeekContext.Provider value={value}>{children}</RecordPeekContext.Provider>
  );
}

const HIDDEN_KEY = "details:hidden";
const readHidden = () => {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
};
// Storage fires no event in the tab that wrote it, and the choice is held in state there.
const subscribeHidden = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

/**
 * Where a peek is drawn. Beside the page (≥1100px) it is the details panel: a
 * 344px column that stays while the person goes down a list, stepping with
 * up and down, with Open to leave for the record. `]` hides and shows it, and
 * that is remembered. Narrower, it is a sheet over the page, as it was.
 * Placed once by the shell, after the page.
 */
export function RecordPeekHost() {
  const { peeking, close, open } = useRecordPeek();
  const { width } = useShell();
  const stored = useSyncExternalStore(subscribeHidden, readHidden, () => false);
  // A choice made this visit wins over what storage held when it was read.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const hidden = chosen ?? stored;
  const setHidden = setChosen;

  const setHiddenKept = useCallback((next: boolean) => {
    setChosen(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, String(next));
    } catch {
      // The choice holds for this visit.
    }
  }, []);

  // A new peek brings the panel back: asking to look at something is asking to see it.
  const key = peeking ? `${peeking.entity}:${peeking.id}` : null;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    if (key) setHidden(false);
  }

  useEffect(() => {
    if (width !== "wide" || !peeking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "]" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      setHiddenKept(!hidden);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hidden, peeking, setHiddenKept, width]);

  if (width === "wide") {
    if (!peeking || hidden) return null;
    return (
      <aside
        aria-label="Details"
        className="flex h-full w-[344px] flex-none flex-col bg-[var(--surface)] shadow-[inset_1px_0_0_var(--line)]"
      >
        <PeekPanel peeking={peeking} onClose={close} onStep={open} docked />
      </aside>
    );
  }
  return (
    <Sheet open={Boolean(peeking)} onOpenChange={(next) => (next ? null : close())}>
      <SheetContent side="right" size="md" className="flex flex-col gap-0 p-0">
        <PeekPanel peeking={peeking} onClose={close} onStep={open} />
      </SheetContent>
    </Sheet>
  );
}

function PeekPanel({
  peeking,
  onClose,
  onStep,
  docked = false,
}: {
  peeking: RecordRef | null;
  onClose: () => void;
  onStep: (href: string) => boolean;
  docked?: boolean;
}) {
  const router = useRouter();
  const { current, follow } = useRecordTrail();
  const { data, error, isLoading, isError } = useQuery({
    queryKey: ["record-peek", peeking?.entity, peeking?.id],
    enabled: Boolean(peeking),
    // `successResponse` returns the record itself, not a `{ data }` envelope.
    queryFn: () => fetchJson<PeekSummary>(recordSummaryPath(peeking!)!),
    // A peek is a glance, and the same record gets glanced at repeatedly on
    // one page. Keeping it a minute means the second look is instant.
    staleTime: 60_000,
  });

  /**
   * Why a glance failed, in the words the API used.
   *
   * The panel used to say "it may have been deleted" whatever came back, which
   * was near enough true when the only failure was a 404. It is not true of a
   * refusal: the campus endpoints answer 403 with a sentence naming the role
   * that can look ("Your role cannot view boarding"), and swallowing that in
   * favour of a guess about deletion tells the reader something false about a
   * record that is right there. A refusal that does not say what would work
   * teaches the reader only that the panel is unreliable.
   */
  const failure =
    error instanceof ApiError && error.status === 403
      ? error.message
      : error instanceof ApiError && error.status === 404
        ? "This record no longer exists."
        : "This record could not be loaded. Try opening it in full.";

  const mark = peeking ? ENTITY_MARK[peeking.entity] : ENTITY_MARK.deal;
  const Icon = mark.icon;

  const recordHref = data?.href;
  const step = useMemo(() => (recordHref ? stepAt(readSequence(), recordHref) : null), [recordHref]);

  const Head = docked ? "header" : SheetHeader;
  const Title = docked ? "h2" : SheetTitle;

  return (
    <>
        <Head className="border-b border-[var(--border-subtle)] p-4">
          <p className="text-sm uppercase tracking-[0.08em] text-[var(--text-subtle)]">
            {peeking ? ENTITY_LABEL[peeking.entity] : "Record"}
          </p>
          <Title className="flex items-start gap-2 text-left">
            <span
              data-accent={mark.accent}
              className="solid-mark mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              {isLoading
                ? "Loading…"
                : (data?.title ??
                  // A refused record is not a missing one, and a heading that
                  // says "Not found" over a body that says "your role cannot"
                  // contradicts itself in the space of two lines.
                  (error instanceof ApiError && error.status === 403
                    ? "Not yours to see"
                    : "Not found"))}
            </span>
          </Title>
          {docked ? (
            <div className="mt-3 flex items-center gap-2">
              {step ? (
                <RecordStepper
                  noun="records"
                  size="panel"
                  direction="down"
                  onPrevious={step.prevHref ? () => void onStep(step.prevHref as string) : null}
                  onNext={step.nextHref ? () => void onStep(step.nextHref as string) : null}
                  position={step.position}
                  total={step.total}
                />
              ) : null}
              <button
                type="button"
                aria-label="Close the panel"
                aria-keyshortcuts="]"
                onClick={onClose}
                className="ml-auto flex size-7 items-center justify-center rounded-[8px] text-[var(--ink-3)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </Head>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isError ? (
            <p className="text-sm text-[var(--text-muted)]">{failure}</p>
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
            Open
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
    </>
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
