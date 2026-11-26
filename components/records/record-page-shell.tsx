"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { IconButton } from "@/components/ui/icon-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { EntityLink } from "@/components/records/entity-link";
import { useRecordTrail } from "@/components/records/record-trail";
import { ChevronRight, DotsThree, type LucideIcon } from "@/lib/icons";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";
import { cn } from "@/lib/utils";
import type { RegisterKpi } from "@/components/crm/registers/register-shell";
import { CrmFinding, type CrmFindingProp } from "@/components/crm/crm-finding";
import {
  RecordDetailsFab,
  RecordDetailsPanel,
  useRecordDetailsPanel,
} from "@/components/records/record-details-panel";
import {
  ci_apps,
  ci_calendar_check,
  ci_clock,
  ci_pencil,
  ci_pipeline,
  ci_receipt,
  ci_sheet,
  ci_site_visit,
  ci_sliders,
  ci_tool,
  ci_users,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";

function getSectionGlyph(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("activ") || lower.includes("histor") || lower.includes("timeline")) return ci_clock;
  if (lower.includes("note") || lower.includes("message")) return ci_pencil;
  if (lower.includes("task") || lower.includes("follow") || lower.includes("todo")) return ci_calendar_check;
  if (lower.includes("deal") || lower.includes("sale") || lower.includes("pipeline")) return ci_pipeline;
  if (lower.includes("visit") || lower.includes("appointment")) return ci_site_visit;
  if (lower.includes("job") || lower.includes("work") || lower.includes("order")) return ci_tool;
  if (lower.includes("file") || lower.includes("doc") || lower.includes("sheet")) return ci_sheet;
  if (lower.includes("financ") || lower.includes("money") || lower.includes("invoice") || lower.includes("cost")) return ci_receipt;
  if (lower.includes("peopl") || lower.includes("contact") || lower.includes("team") || lower.includes("member")) return ci_users;
  if (lower.includes("prop") || lower.includes("detail") || lower.includes("info")) return ci_sliders;
  return ci_apps;
}

/** The query parameter that says which section of a record is open. */
const SECTION_PARAM = "section";

/**
 * A figure in the record's band: its mark, its value, a line under it, and —
 * where the figure is something to act on — the act, inline after that line
 * ("1 open invoice · Record payment ›").
 */
export type RecordKpi = RegisterKpi & {
  icon?: ReactNode;
  action?: { label: string; onClick: () => void } | null;
};

export type RecordTab = {
  value: string;
  label: string;
  count?: number;
  /** The section's mark, shown in the rail at every width. */
  icon?: LucideIcon;
  /**
   * Something in here wants looking at — an unread comment, an overdue task,
   * a quote waiting on a customer. Drawn as a dot, because a count already
   * says how much and this says whether it matters.
   */
  attention?: boolean;
  /**
   * The section opens with a heading of its own — its name, its count and
   * its verb — so a phone, drilled into it, does not name it a second time
   * above that heading.
   */
  titled?: boolean;
  content: ReactNode;
};

export type RecordAction = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
};

/**
 * One record-page structure for every record in the CRM.
 *
 * The record's name, its reference and its actions live in the top app bar,
 * the same as every other page — so moving from a list to a record does not
 * move the controls. Under the bar is the record's toolbar: its lifecycle, the
 * controls a page adds, and its headline figure. There is no band repeating
 * the name.
 *
 * Tabs with no content are dropped rather than shown empty: a company with no
 * site visits shouldn't advertise a Visits tab, and a page that only shows
 * what exists is faster to read than one padded with blanks.
 *
 * ## Which section is open lives in the URL
 *
 * `?section=documents`, not component state. Three things fall out of that and
 * none of them work without it: the phone's back arrow and the browser's back
 * button both return to the record rather than to the list two levels up, a
 * link to a record's documents is a link somebody can send, and the first
 * paint is correct — the alternative is `matchMedia`, which has no answer
 * before hydration and paints the desktop shape on a phone for a frame.
 *
 * ## The sections are a rail, and a phone drills into one
 *
 * Thirteen sections is not a tab strip: it wrapped onto two rows at 1440px and
 * had to be scrolled sideways at 390px. They are a vertical rail — the one the
 * back office already uses — beside the section on a desktop, and the same rail
 * at the foot of the landing view on a phone, where tapping a row opens that
 * section full-width. Both read the same URL, so neither is a separate mode.
 */
export function RecordPageShell({
  backHref,
  backLabel,
  icon,
  title,
  onTitleCommit,
  reference,
  status,
  subtitle,
  figure,
  related,
  leading,
  primaryAction,
  actions,
  tabs,
  activeTab,
  onTabChange,
  rail,
  attributes,
  stage,
  toolbar,
  kpis,
  finding,
  quickActions,
  railHead,
  children,
}: {
  backHref: string;
  backLabel: string;
  /** The entity's mark, shown beside the record name in the top bar. */
  icon?: LucideIcon;
  title: string;
  /**
   * Commit a new name for the record. Given one, the title in the standing
   * column becomes an editor; without one it stays a heading, which is right
   * for the records that have no name of their own — a rep is a colleague,
   * and their name lives in the directory rather than here.
   */
  onTitleCommit?: (value: string) => void;
  /** Shown in mono after the name in the app bar: `DEAL-0001`. */
  reference?: string | null;
  status?: { label: string; status: CanonicalUiStatus } | null;
  /** One line under the name on a phone, where the record's landing view names it. */
  subtitle?: ReactNode;
  /**
   * The record's headline figure — a lead's worth, a deal's value, a line's
   * amount — at the far end of the record's toolbar, where it stays in view
   * while a long conversation scrolls: it is the number you are deciding
   * *against* while working the record.
   */
  figure?: ReactNode;
  /**
   * Records this one points at — the company, the site, the deal it became.
   * Drawn under the section rail, below a "Related" heading.
   */
  related?: ReactNode;
  /** An avatar or monogram for the identity strip. */
  leading?: ReactNode;
  primaryAction?: ReactNode;
  actions?: RecordAction[];
  tabs: RecordTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  rail?: ReactNode;
  /**
   * The control that moves the record along its lifecycle — a lead's stage
   * stepper, a deal's stage bar, a job's stage rail. It opens from the status
   * in the record's toolbar, and heads the landing view on a phone.
   */
  stage?: ReactNode;
  /**
   * The page's own controls in the record's toolbar, after the lifecycle — a
   * member page's period, for one. On a phone they head the landing view.
   */
  toolbar?: ReactNode;
  /** The record's figures, in a band under its header. */
  kpis?: RecordKpi[];
  /** Optional Books finding callout rendered above the record header. */
  finding?: CrmFindingProp | null;
  /**
   * The Details panel's first row: what is done *to* the record from beside
   * it — Call, Email, Message. On a record whose panel floats, pressing one
   * shuts the panel, because what it opens is on the page underneath.
   */
  quickActions?: ReactNode;
  /**
   * The panel's section above Properties — a deal's billing: the figure the
   * record is being worked towards, before the facts about it.
   */
  railHead?: ReactNode;
  /** Sheets and dialogs the page owns — mounted outside the tab content so
   *  they survive a tab change. */
  children?: ReactNode;
  /**
   * The record's properties, under a Properties heading in the Details panel
   * (after `railHead`). Given as the rows themselves, not wrapped in a
   * `RailSection`; the shell owns the section.
   */
  attributes?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const recordRef = useRef<HTMLDivElement>(null);
  const panel = useRecordDetailsPanel(recordRef);

  /**
   * Whether the record's own title is on screen. While it is, the app bar does
   * not repeat it; once it scrolls away, the bar takes the name over — so the
   * record is always named exactly once in view.
   */
  const titleRef = useRef<HTMLDivElement>(null);
  const [titleInView, setTitleInView] = useState(true);
  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTitleInView(entry.isIntersecting),
      // The app bar sits over the page on a phone; the title is gone once it
      // is under the bar, not once it leaves the window.
      { rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The width at which the app bar switches to its phone row and stops having
  // room for the record's name. Only ever used for chrome the bar itself owns.
  const narrow = useIsMobile();

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.content !== null && tab.content !== undefined),
    [tabs],
  );

  const landingTab = visibleTabs[0];
  const requested = searchParams.get(SECTION_PARAM);
  // A stale or hand-typed section name falls back to the landing view rather
  // than rendering a page with nothing on it.
  const openSection = visibleTabs.some((tab) => tab.value === requested) ? requested : null;

  const sectionHref = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(SECTION_PARAM, value);
    return `${pathname}?${next.toString()}`;
  };

  /** The record with no section open — where the phone's back arrow returns to. */
  const recordHref = (() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(SECTION_PARAM);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();

  // The trail is what makes "back" mean the record you came from rather than
  // the list you have not seen for three hops. Registering also pops the trail
  // when this record is already on it, which is how the bar's arrow and the
  // browser's own back button end up agreeing.
  const { register, back: trailBack } = useRecordTrail();
  useEffect(() => {
    register({ href: pathname, label: title });
    return () => register(null);
  }, [register, pathname, title]);

  // The parent still owns `activeTab`, because buttons inside the page jump
  // sections — "add a task" from an empty Up next, "open documents" from the
  // billing panel. Those set the parent's state; this carries the change into
  // the URL, which is where everything else reads it from.
  useEffect(() => {
    if (!activeTab || activeTab === openSection) return;
    if (!visibleTabs.some((tab) => tab.value === activeTab)) return;
    // The landing tab is the record's own page, not a section of it.
    if (activeTab === landingTab?.value) return;
    window.history.pushState(null, "", sectionHref(activeTab));
    // `sectionHref` closes over this render's params; re-running on every
    // render is what a dependency array would buy, and it is not wanted here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const currentTab = openSection
    ? visibleTabs.find((tab) => tab.value === openSection)
    : landingTab;

  // The URL is the source of truth, so a page holding its own `tab` state — the
  // lead's billing panel jumps to Documents, the deal's stage bar reads which
  // section is open — is told when it changes. The push effect above bails when
  // the two already agree, so this cannot ping-pong with it.
  const currentValue = currentTab?.value;
  useEffect(() => {
    if (currentValue && currentValue !== activeTab) onTabChange(currentValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue]);

  /**
   * The sections, as one vertical rail at every width.
   *
   * They were a horizontal strip, which is the wrong shape for this many:
   * thirteen sections wrapped onto two rows on a 1440px desktop and had to be
   * scrolled sideways on a phone. A segmented control — the grammar the
   * activity composer uses for Note / Call / Email — is right for three or
   * four peers in a fixed track and cannot hold thirteen; its columns are
   * equal-width by construction.
   *
   * So the rail the back office already uses for exactly this problem: a
   * column of 36px rows with the mark, the name and the count. On a desktop it
   * sits to the left of the section. On a phone it is the same rail at the
   * foot of the landing view, and tapping a row opens that section full-width.
   * One component, one grammar, two placements.
   */
  // Held lowercase and rendered through the binding, the way the sidebar does
  // it: a capitalised name assigned from a prop reads to the lint rule as a
  // component defined during render.
  const RecordIcon = icon;

  /**
   * The underline under the open section, as one bar that slides to the tab
   * pressed rather than a line on each tab that blinks off and on. Measured
   * after layout, and again when the strip changes size.
   */
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const currentTabValue = currentTab?.value;
  useLayoutEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const place = () => {
      const active = strip.querySelector<HTMLElement>("[data-active]");
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [currentTabValue, visibleTabs.length]);

  const sectionTabs = (
    <div className="crm-bk-tabs-bar" role="tablist" aria-label={`${title} sections`}>
      <div className="crm-bk-tabs" ref={tabsRef}>
        {visibleTabs.map((tab) => {
          const isCurrent = tab.value === currentTab?.value;
          const href = tab.value === landingTab?.value ? recordHref : sectionHref(tab.value);
          return (
            <Link
              key={tab.value}
              href={href}
              role="tab"
              aria-selected={isCurrent}
              className="crm-bk-tab no-underline hover:no-underline"
              data-active={isCurrent || undefined}
            >
              {tab.icon ? (
                <tab.icon className="size-4 shrink-0" data-current={isCurrent || undefined} />
              ) : (
                <CiGlyphIcon glyph={getSectionGlyph(tab.label)} size={16} className="shrink-0" />
              )}
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 ? (
                <span className="n">{tab.count}</span>
              ) : null}
              {tab.attention ? (
                <span aria-label="Needs attention" className="crm-bk-tab-dot" />
              ) : null}
            </Link>
          );
        })}
        {indicator ? (
          <i
            aria-hidden="true"
            className="crm-bk-tab-ind"
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
        ) : null}
      </div>
    </div>
  );

  const railSections = (
    <>
      {railHead}
      <RailSection title="Properties">
        {attributes ?? (
          <p className="text-sm text-[var(--color-ink-3)]">Nothing recorded on this one yet.</p>
        )}
      </RailSection>
      {related ? <RailSection title="Related">{related}</RailSection> : null}
      {rail}
    </>
  );

  const hasSectionRail = visibleTabs.length > 1;

  // The lifecycle control sits in the app bar beside the primary on a
  // desktop, where it stays in reach while the record scrolls; a phone's bar
  // has no room for it, so there it heads the record instead.
  const barStage = narrow ? null : stage;

  const barActions = useMemo(() => {
    if (!actions || actions.length === 0) {
      return barStage || primaryAction ? (
        <div className="inline-flex items-center gap-1.5">
          {barStage}
          {primaryAction}
        </div>
      ) : null;
    }

    if (narrow) {
      return (
        <>
          {primaryAction}
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              className={cn(
                "justify-start gap-2",
                action.destructive && "text-[var(--status-error-text)]",
              )}
              onClick={action.onSelect}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5">
        {barStage}
        {primaryAction}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="More actions">
              <DotsThree />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onSelect}
                variant={action.destructive ? "destructive" : "default"}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }, [actions, barStage, narrow, primaryAction]);

  return (
    <div className="record-shell space-y-4 md:space-y-0">
      <PageChrome
        title={title}
        reference={reference}
        titleInView={titleInView}
        backHref={
          openSection && narrow ? recordHref : (trailBack?.href ?? backHref)
        }
        backLabel={
          openSection && narrow ? title : (trailBack?.label ?? backLabel)
        }
      >
        {barActions}
      </PageChrome>

      <div
        ref={recordRef}
        className={cn(
          "crm-bk-rec rec-has-panel min-w-0 md:min-h-0 md:flex-1",
          panel.overlay ? "is-overlay" : "is-push",
          panel.resizing && "is-resizing",
          panel.snapping && "is-snapping",
        )}
        style={{ ["--pw" as string]: `${panel.width}px` }}
      >
        <div className="crm-bk-main md:overflow-y-auto">
          {finding ? <CrmFinding finding={finding} /> : null}

          <div className="crm-bk-hd">
            <div className="crm-bk-hd-row">
              <div className="crm-bk-hd-left">
                {leading ? (
                  <span className="crm-bk-hd-leading flex-none">{leading}</span>
                ) : RecordIcon ? (
                  <span className="crm-bk-hd-icon flex-none">
                    <RecordIcon className="size-4" aria-hidden="true" />
                  </span>
                ) : null}

                <div className="min-w-0 flex-1" ref={titleRef}>
                  <div className="crm-bk-hd-title-wrap">
                    {onTitleCommit ? (
                      <RecordTitleEditor title={title} onCommit={onTitleCommit} />
                    ) : (
                      <h1 className="crm-bk-title">{title}</h1>
                    )}
                    {status ? <StatusChip status={status.status} label={status.label} /> : null}
                  </div>
                  {reference || subtitle ? (
                    <div className="crm-bk-ml">
                      {reference ? <span className="ref font-mono">{reference}</span> : null}
                      {reference && subtitle ? <i>·</i> : null}
                      {subtitle ? <span>{subtitle}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {figure || (narrow && stage) || toolbar ? (
                <div className="crm-bk-hd-right">
                  {narrow ? stage : null}
                  {toolbar}
                  {figure ? (
                    <span className="crm-bk-hd-figure">
                      {figure}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {kpis && kpis.length > 0 ? (
            <div className="crm-bk-strip">
              <div
                className="crm-bk-kstrip"
                style={{ ["--kn" as string]: Math.min(kpis.length, 4) }}
              >
                {kpis.map((kpi, idx) => (
                  <div key={idx} className="crm-bk-kt">
                    <div className="crm-bk-kt-l">
                      {kpi.icon ? (
                        <span className="crm-bk-kt-i" aria-hidden="true">
                          {kpi.icon}
                        </span>
                      ) : null}
                      {kpi.label}
                    </div>
                    <div
                      className={cn(
                        "crm-bk-kt-v",
                        kpi.tone === "up" && "up",
                        kpi.tone === "warn" && "warn",
                        kpi.tone === "bad" && "bad",
                      )}
                    >
                      {kpi.value}
                    </div>
                    {kpi.sub || kpi.action ? (
                      <div className="crm-bk-kt-n">
                        {kpi.sub ? <span>{kpi.sub}</span> : null}
                        {kpi.action ? (
                          <button type="button" className="crm-bk-kt-act" onClick={kpi.action.onClick}>
                            {kpi.action.label}
                            <ChevronRight className="size-3" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {hasSectionRail ? sectionTabs : null}

          <div className="crm-bk-body">
            {/* Keyed by section, so the one opened fades up into place. */}
            <div key={currentTab?.value} className="crm-bk-section min-w-0">
              {currentTab?.content}
            </div>
          </div>
        </div>

        <RecordDetailsPanel
          panel={panel}
          title={title}
          reference={reference}
          quickActions={
            quickActions ? (
              // What these open is on the record underneath, so a floating
              // panel gets out of its way.
              <div
                className="contents"
                onClickCapture={() => {
                  if (panel.overlay) panel.setOpen(false);
                }}
              >
                {quickActions}
              </div>
            ) : null
          }
        >
          {railSections}
        </RecordDetailsPanel>

        <RecordDetailsFab panel={panel} />
      </div>

      {children}
    </div>
  );
}


/**
 * The record's name, edited where it is read.
 *
 * A textarea rather than an input: a deal is called "Plumtree Freight
 * second-site rollout" and a single-line field in a 22rem column shows about
 * a third of that, scrolling the rest out of sight while you try to fix a typo
 * in the middle of it. It grows to the text and commits on Enter, so it still
 * behaves like a name and not like a note.
 */
function RecordTitleEditor({
  title,
  onCommit,
}: {
  title: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(title)}
        title="Rename"
        className="-mx-1.5 rounded-[var(--radius-sm)] px-1.5 text-left crm-bk-title hover:bg-[var(--color-hover)]"
      >
        {title}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onCommit(trimmed);
    setDraft(null);
  };

  return (
    <textarea
      autoFocus
      rows={Math.min(4, Math.max(1, Math.ceil(draft.length / 28)))}
      value={draft}
      aria-label="Record name"
      className="-mx-1.5 block w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 crm-bk-title outline-none focus:border-[var(--color-ink)]"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}

/**
 * A titled block in the record page's rail.
 */
export function RailSection({
  title,
  action,
  meta,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** A figure the heading carries on its right — "30 · Cold", "4 open". */
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="crm-bk-rail-sec">
      <div className="crm-bk-rail-title flex items-center gap-2">
        <span>{title}</span>
        {meta ? (
          <span className="ml-auto font-mono text-sm font-medium tabular-nums text-[var(--color-ink-2)]">
            {meta}
          </span>
        ) : null}
        {action ? <span className={cn("flex items-center", meta ? "" : "ml-auto")}>{action}</span> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

/**
 * The rail's "Related" group — the records this one is attached to.
 *
 * The artboard puts a lead's company, its quote and its site here, under the
 * sections: three rows, a coloured dot each, no counts. They are places to go,
 * the same as a section, which is why they belong in the rail rather than in a
 * panel in the standing column — and why each is one line rather than a card.
 * This answers "what is this attached to", not "what has happened to it".
 *
 * Deliberately not `RelatedList` below, which is the boxed, subtitled list a
 * *tab* uses to show every person on a deal. This is the shortcut, not the
 * register.
 */
export function RecordRelated({
  items,
}: {
  items: Array<{ href: string; label: string; dot?: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="crm-bk-related-list">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="crm-bk-related-link"
          >
            <span
              aria-hidden="true"
              className={cn("size-[7px] shrink-0 rounded-[2px]", item.dot ?? "bg-[var(--brand)]")}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">
              {item.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A list of related records — people on a deal, sites at a company, and so on. */
export function RelatedList<T>({
  items,
  emptyMessage,
  renderItem,
  action,
}: {
  items: T[];
  emptyMessage: string;
  renderItem: (item: T) => { href: string; title: string; subtitle: string | null; meta?: string };
  action?: ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="py-4 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>
        {action}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bk-bleed">
        <table className="table" aria-label="Related records">
          <thead>
            <tr>
              <th>Record</th>
              <th>Details</th>
              <th className="num">Meta</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const rendered = renderItem(item);
              return (
                <tr key={`${rendered.href}-${index}`}>
                  <td>
                    <EntityLink href={rendered.href} className="ref font-medium hover:underline">
                      {rendered.title}
                    </EntityLink>
                  </td>
                  <td className="muted">{rendered.subtitle ?? "—"}</td>
                  <td className="num font-mono">{rendered.meta ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
