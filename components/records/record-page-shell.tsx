"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Stack } from "@corelithzw/react";
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
import { useIsBelow, useIsMobile } from "@/hooks/use-mobile";
import { EntityLink } from "@/components/records/entity-link";
import { useRecordTrail } from "@/components/records/record-trail";
import { DotsThree, SidebarRight, type LucideIcon } from "@/lib/icons";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";
import { cn } from "@/lib/utils";
import { useShellIfAny } from "@/components/layout/shell-state";
import type { RegisterKpi } from "@/components/crm/registers/register-shell";

/** The query parameter that says which section of a record is open. */
const SECTION_PARAM = "section";

/** Where the standing column's open state is remembered. */
const INFO_COLUMN_KEY = "record-info-column";

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
  /** Optional Books KPI strip rendered below the record header. */
  kpis?: RegisterKpi[];
  /** Optional Books finding callout rendered above the record header. */
  finding?:
    | { label?: string; text?: ReactNode; children?: ReactNode; action?: ReactNode | { label: string; onClick: () => void }; tone?: string }
    | null;
  /** Sheets and dialogs the page owns — mounted outside the tab content so
   *  they survive a tab change. */
  children?: ReactNode;
  /**
   * The record's properties. The shell puts them under a Properties band at
   * the head of the pane on a desktop, and at the head of the landing view on
   * a phone — so the objection that put them above the tabs in the first place
   * still holds: they are the first thing a phone shows, not the last.
   *
   * Given as the rows themselves, not wrapped in a `RailSection`; the shell
   * owns the band, because the band also carries the pane's collapse control.
   */
  attributes?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Whether the standing column is open, remembered across records.
   *
   * Read in an effect rather than during render: `localStorage` does not exist
   * on the server, and seeding state from it directly is a hydration mismatch.
   * Open is the honest default — a reader who has never collapsed it should see
   * what the record is.
   */
  const [infoOpen, setInfoOpen] = useState(true);
  useEffect(() => {
    setInfoOpen(window.localStorage.getItem(INFO_COLUMN_KEY) !== "closed");
  }, []);
  // With Vane's panel open on a screen under 1600px there is no room for the
  // record, its sections and the properties pane at once: the pane folds
  // while Vane is open, and "Show properties" brings it back regardless.
  const vaneOpen = useShellIfAny()?.vaneOpen ?? false;
  const crowded = useIsBelow(1600) && vaneOpen;
  const [unfolded, setUnfolded] = useState(false);
  if (!crowded && unfolded) setUnfolded(false);
  const infoShown = infoOpen && (!crowded || unfolded);
  const toggleInfo = () => {
    if (crowded && infoOpen && !unfolded) return setUnfolded(true);
    setInfoOpen((open) => {
      window.localStorage.setItem(INFO_COLUMN_KEY, open ? "closed" : "open");
      return !open;
    });
  };

  /**
   * The control that shuts the properties pane, and the one that brings it
   * back.
   *
   * A panel glyph, not a chevron. A chevron promises to move you forward —
   * it is what a row does when it opens the next thing — and this control
   * moves nothing: it hides a pane and leaves you where you are. The app bar's
   * own sidebar control is Phosphor's `SidebarSimple`, so this is the same
   * glyph mirrored, and collapsing a pane reads as one gesture wherever the
   * pane happens to be.
   *
   * The state shows in the fill rather than in a second glyph: the panel is
   * solid while it is there and an outline once it is gone. Mirroring it back
   * to the left would have been the other way to flip it, and it would have
   * read as the app's own sidebar sitting on the wrong edge of the screen.
   */
  const railToggle = (
    <IconButton
      size="sm"
      aria-label={infoShown ? "Hide properties" : "Show properties"}
      onClick={toggleInfo}
      // There is no pane to collapse below `lg` — the same sections are the
      // landing view there — and a control that visibly does nothing is worse
      // than one that is not offered.
      className="-mr-1 hidden lg:inline-flex"
    >
      <SidebarRight weight={infoShown ? "fill" : "regular"} />
    </IconButton>
  );

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

  const sectionTabs = (
    <div className="crm-bk-tabs-bar" role="tablist" aria-label={`${title} sections`}>
      <div className="crm-bk-tabs">
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
              <span>{tab.label}</span>
              {tab.count && tab.count > 0 ? <span className="cnt">{tab.count}</span> : null}
              {tab.attention ? (
                <span
                  aria-label="Needs attention"
                  className="size-1.5 rounded-full bg-[var(--action-primary-bg)]"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
      {!infoShown ? <div className="ml-auto flex items-center">{railToggle}</div> : null}
    </div>
  );

  const railSections = (
    <>
      <RailSection title="Properties" action={railToggle}>
        {attributes ?? (
          <p className="text-sm text-[var(--text-muted)]">Nothing recorded on this one yet.</p>
        )}
      </RailSection>
      {related ? <RailSection title="Related">{related}</RailSection> : null}
      {rail}
    </>
  );

  const hasSectionRail = visibleTabs.length > 1;

  const barActions = useMemo(() => {
    if (!actions || actions.length === 0) return primaryAction;

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
      <>
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
      </>
    );
  }, [actions, narrow, primaryAction]);

  return (
    <div className="record-shell space-y-4 md:space-y-0">
      <PageChrome
        title={title}
        reference={reference}
        backHref={
          openSection && narrow ? recordHref : (trailBack?.href ?? backHref)
        }
        backLabel={
          openSection && narrow ? title : (trailBack?.label ?? backLabel)
        }
      >
        {barActions}
      </PageChrome>

      <div className="crm-bk-rec min-w-0 md:min-h-0 md:flex-1">
        <div className="crm-bk-main md:overflow-y-auto">
          {finding ? (
            <div className="crm-bk-finding">
              <span className="fl">{finding.label ?? "Finding"}</span>
              <span className="min-w-0 flex-1">{finding.text ?? finding.children}</span>
              {finding.action ? (
                <div className="ml-auto shrink-0">
                  {typeof finding.action === "object" && "label" in finding.action && "onClick" in finding.action ? (
                    <button type="button" className="fl-act" onClick={finding.action.onClick}>
                      {finding.action.label}
                    </button>
                  ) : (
                    finding.action
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="crm-bk-hd">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {leading ? (
                <span className="mt-0.5 flex-none">{leading}</span>
              ) : RecordIcon ? (
                <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] text-[var(--color-muted)]">
                  <RecordIcon className="size-4" aria-hidden="true" />
                </span>
              ) : null}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  {onTitleCommit ? (
                    <RecordTitleEditor title={title} onCommit={onTitleCommit} />
                  ) : (
                    <h1>{title}</h1>
                  )}
                  {status ? <StatusChip status={status.status} label={status.label} /> : null}
                </div>
                {reference || subtitle ? (
                  <div className="crm-bk-ml">
                    {reference ? <span className="mono">{reference}</span> : null}
                    {reference && subtitle ? <span>·</span> : null}
                    {subtitle ? <span>{subtitle}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>

            {figure || stage || toolbar ? (
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {stage}
                {toolbar}
                {figure ? (
                  <span className="font-mono text-[18px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--color-ink)]">
                    {figure}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {kpis && kpis.length > 0 ? (
            <div className="crm-bk-strip">
              <div
                className="crm-bk-kstrip"
                style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, minmax(0, 1fr))` }}
              >
                {kpis.map((kpi, idx) => (
                  <div key={idx} className="crm-bk-kt">
                    <div className="l">{kpi.label}</div>
                    <div
                      className={cn(
                        "v",
                        kpi.tone === "up" && "up",
                        kpi.tone === "warn" && "warn",
                        kpi.tone === "bad" && "bad",
                      )}
                    >
                      {kpi.value}
                    </div>
                    {kpi.sub ? <div className="d">{kpi.sub}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {hasSectionRail ? sectionTabs : null}

          <div className="crm-bk-body">
            {!openSection ? (
              <div className="mb-5 space-y-4 lg:hidden">{railSections}</div>
            ) : null}

            <div className="min-w-0">{currentTab?.content}</div>
          </div>
        </div>

        {infoShown ? (
          <aside className="crm-bk-rail hidden shrink-0 overflow-y-auto lg:block">
            {railSections}
          </aside>
        ) : null}
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
        className="-mx-1.5 rounded-[var(--radius-sm)] px-1.5 text-left text-[19px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ink)] hover:bg-[var(--color-hover)]"
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
      className="-mx-1.5 block w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[19px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ink)] outline-none focus:border-[var(--color-ink)]"
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
    <section className="crm-bk-rsec">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-muted)]">
          {title}
        </h3>
        {meta ? (
          <span className="ml-auto font-mono text-[12px] font-semibold tabular-nums text-[var(--color-ink)]">
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
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex h-[27px] items-center gap-2 rounded-[var(--radius-md)] px-2 hover:bg-[var(--surface-hover)]"
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
    <div className="space-y-2">
      <Stack as="ul" gap="xs">
        {items.map((item, index) => {
          const rendered = renderItem(item);
          return (
            <li key={`${rendered.href}-${index}`}>
              {/*
                `EntityLink`, not `Link`: these rows are the record's edges, and
                they are where the reader does most of their moving about. As
                plain links they were the only references in the product that
                neither carried a trail back nor knew what they pointed at.

                The supporting line steps down in size as well as ink. At the
                title's size it read as a second title, which on a guardian's
                children — two names, one under the other — is the one place
                that ambiguity actually costs something.
              */}
              <EntityLink
                href={rendered.href}
                className="group/row flex items-center justify-between gap-3 p-3 no-underline hover:bg-[var(--surface-hover)] hover:no-underline"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium underline decoration-[var(--border)] underline-offset-2 group-hover/row:decoration-[var(--text)]">
                    {rendered.title}
                  </span>
                  {rendered.subtitle ? (
                    <span className="acct-caption block truncate text-[var(--text-muted)]">
                      {rendered.subtitle}
                    </span>
                  ) : null}
                </span>
                {rendered.meta ? (
                  <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">
                    {rendered.meta}
                  </span>
                ) : null}
              </EntityLink>
            </li>
          );
        })}
      </Stack>
      {action}
    </div>
  );
}
