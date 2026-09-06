"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Stack } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { NavRail, NavRailItem } from "@corelithzw/ui/components/nav-rail";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { useIsMobile } from "@corelithzw/ui/hooks/use-mobile";
import { useRecordTrail } from "./record-trail";
import { DotsThree, SidebarRight, type LucideIcon } from "@corelithzw/ui/lib/icons";
import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";
import { cn } from "@corelithzw/ui/lib/utils";

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
  content: ReactNode;
};

export type RecordAction = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
};

/**
 * One record-page structure for people, companies, deals, sites and reps.
 *
 * The record's name and its actions live in the top app bar, the same as
 * every other page — so moving from a list to a record does not move the
 * controls. What stays on the page is the part the bar cannot carry: the
 * identity strip, which is the reference, the status and the one line that
 * says what this record is, sitting directly above the tabs.
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
  bandValue,
  related,
  leading,
  primaryAction,
  actions,
  tabs,
  activeTab,
  onTabChange,
  rail,
  attributes,
  beforeTabs,
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
  reference?: string | null;
  status?: { label: string; status: CanonicalUiStatus } | null;
  subtitle?: ReactNode;
  /**
   * The record's headline figure, pinned in the band — a lead's worth, a
   * deal's value, a company's balance.
   *
   * The artboards put it between the identity and the stage controls, for the
   * same reason the stage ladder came back to the band: it is the number you
   * are deciding *against* while working the record, and in the standing
   * column it was three screens above a long conversation by the time you had
   * read enough to decide anything.
   */
  bandValue?: ReactNode;
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
   * A record-specific band between the properties and the tabs. A lead's
   * stage stepper lives here: its stages are a fixed enum you click along,
   * which is neither a property nor a tab.
   */
  beforeTabs?: ReactNode;
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
  const toggleInfo = () => {
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
      aria-label={infoOpen ? "Hide properties" : "Show properties"}
      onClick={toggleInfo}
      // There is no pane to collapse below `lg` — the same sections are the
      // landing view there — and a control that visibly does nothing is worse
      // than one that is not offered.
      className="-mr-1 hidden lg:inline-flex"
    >
      <SidebarRight weight={infoOpen ? "fill" : "regular"} />
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
  const sectionRail = (
    <NavRail label={`${title} sections`}>
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavRailItem
            key={tab.value}
            to={tab.value === landingTab?.value ? recordHref : sectionHref(tab.value)}
            active={tab.value === currentTab?.value}
            icon={Icon ? <Icon className="size-4" aria-hidden="true" /> : undefined}
            // A zero is not a count — it is a column of grey noise. Only a
            // section with something in it says how much.
            count={tab.count && tab.count > 0 ? tab.count : undefined}
            trailing={
              tab.attention ? (
                <span
                  aria-label="Needs attention"
                  className="size-1.5 rounded-full bg-[var(--action-primary-bg)]"
                />
              ) : undefined
            }
          >
            {tab.label}
          </NavRailItem>
        );
      })}
    </NavRail>
  );

  /**
   * Everything the record *is*, in one column.
   *
   * The mark, the name, the reference, the status, the one line that says what
   * this is, the properties, and whatever summary the page supplies. All of it
   * used to be a band stretched across the top of the page, between the app bar
   * and the columns — which meant the identity of the record scrolled away the
   * moment you started reading a section, and the widest thing on the page was
   * a status chip with three centimetres of nothing beside it.
   *
   * Gathered into the standing column it is in view the whole time, and the
   * band is gone, so a section starts where the page starts.
   */
  // Held lowercase and rendered through the binding, the way the sidebar does
  // it: a capitalised name assigned from a prop reads to the lint rule as a
  // component defined during render.
  const RecordIcon = icon;

  /**
   * The record's identity — mark, name, reference, status, standfirst.
   *
   * Phone only. Above `md` all of this is in the band across the top of the
   * shell, and the artboard's right rail starts at the Properties strip: a
   * record whose name is in the app bar, whose status and reference are in the
   * band, and whose name and status are *also* at the top of the rail is
   * saying the same three things three times inside 200px of each other.
   */
  const identityBlock = (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-start gap-2.5">
          {leading ? (
            <span className="flex-none">{leading}</span>
          ) : RecordIcon ? (
            <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <RecordIcon className="size-4" aria-hidden="true" />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            {/* The name, editable in place like every other property. It was
                the one fact on a record with no way to correct it: a lead
                typed in wrong stayed wrong, and "rename" existed nowhere in
                the module. Same grammar as the property list — press the thing
                you are looking at, Enter or blur commits, Escape abandons. */}
            {onTitleCommit ? (
              <RecordTitleEditor title={title} onCommit={onTitleCommit} />
            ) : (
              <h2 className="text-base font-semibold leading-snug text-[var(--text-strong)]">
                {title}
              </h2>
            )}
            {reference ? (
              <p className="font-mono text-sm text-[var(--text-muted)]">{reference}</p>
            ) : null}
          </div>
        </div>

        {status ? <StatusChip status={status.status} label={status.label} /> : null}

        {subtitle ? (
          <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>

      {/* Phone only — above `md` this is in the band, and rendering it twice
          would put two stage ladders on one page. */}
      {beforeTabs ? (
        <div className="border-t border-[var(--border-subtle)] pt-4 md:hidden">{beforeTabs}</div>
      ) : null}
    </div>
  );

  /**
   * The rail's contents: banded sections, one after another, no cards.
   *
   * Properties always opens it, whether or not the page supplied any. The band
   * is the pane's own heading — it says what this column is — and it is where
   * the collapse control lives, so a rail with an empty property list still
   * has a way to shut itself.
   */
  const railSections = (
    <>
      <RailSection title="Properties" action={railToggle}>
        {attributes ?? (
          <p className="text-sm text-[var(--text-muted)]">Nothing recorded on this one yet.</p>
        )}
      </RailSection>
      {rail}
    </>
  );

  const hasSectionRail = visibleTabs.length > 1;

  // Columns, and the dividers between them. No gap: the rule *is* the gap, and
  // the padding either side of it is what keeps the columns off it.
  //
  // `min-h` because grid tracks are only as tall as their tallest child, and
  // the rules are drawn on the columns. A section with little in it — an empty
  // Documents list, a record with four tasks — left two vertical lines that
  // stopped a third of the way down the screen and a page that looked cropped.
  // The columns fill whatever the viewport has left after the app bar and
  // `main`'s padding, which is what `--content-viewport` is; longer content
  // still grows past it, since this is a floor and not a height.
  /*
    The panes row.

    Not a grid any more. The artboard's three columns are not tracks on a
    scrolling page — they are three scroll containers side by side inside a
    shell that does not scroll at all, and a grid cell cannot be one without a
    height to bound it. Flex gives each pane `min-h-0` against a parent that
    already has the viewport's height, which is what makes `overflow-y: auto`
    inside them mean anything.

    11rem and 21.25rem are the artboard's 176 and 340. The section rail was
    13rem: the longest label a record carries is "Conversation", and the two
    rem came off the middle column, which is the one holding the timeline.
  */
  const panes = "min-w-0 md:flex md:min-h-0 md:flex-1 md:overflow-hidden";

  /**
   * The record's actions, in the top app bar.
   *
   * Two shapes, because the bar has two.
   *
   * On a desktop the bar renders whatever it is given, side by side, so the
   * secondary actions are collected into a menu here — a row of five buttons
   * beside the record's name is not a bar, it is a toolbar.
   *
   * On a phone the bar does its own collecting: it shows the first action and
   * folds the rest behind a "More actions" button of its own. Handing it a
   * menu, as this used to, meant the phone put a menu inside a menu — you
   * pressed `···` and got a panel containing a single unlabelled `···` to
   * press again, with two controls on screen both called "More actions". So
   * the phone gets the actions flat and the bar folds them once.
   */
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
    // A page below `md`, a fixed shell above it — see `.record-shell`.
    <div className="record-shell space-y-4 md:space-y-0">
      {/* Drilled into a section on a phone, "up" is the record — not the list
          it came from. Getting that wrong is what makes a drilldown feel like
          a trapdoor: you open Documents, press back, and you are in the leads
          list with the record gone.

          Only on a phone, though. A desktop never leaves the record — the
          rail and the section sit side by side — so "up" stays the list, and
          pointing it at the record would put the record's name in the bar
          twice, once as the back link and once as the title.

          Otherwise "up" is wherever the reader actually came from. Three hops
          into a graph — a deal, its company, another deal there — the list
          this record belongs to is not up, it is sideways, and an arrow
          pointing at it throws away the path. The trail knows the path; the
          list is what it falls back to when there isn't one. */}
      <PageChrome
        title={title}
        icon={icon}
        backHref={
          openSection && narrow ? recordHref : (trailBack?.href ?? backHref)
        }
        backLabel={
          openSection && narrow ? title : (trailBack?.label ?? backLabel)
        }
      >
        {barActions}
      </PageChrome>

      {/*
        The record band.

        The properties still live in the standing column — that decision holds,
        and a phone still leads with them. What comes back to the top is the
        part you act on: where the record is in its lifecycle, and the move to
        the next stage. Those were in the column too, which meant that on a long
        conversation the ladder was three screens above the thing you had just
        read before deciding to advance it.

        So this is not the old identity band returning. It carries the status,
        the reference and the stage controls only — the facts you need *while*
        working the record, pinned — and nothing that the column already says
        better. Hidden below `md`, where the column is the landing view anyway.
      */}
      {status || reference || bandValue || beforeTabs ? (
        /* Not sticky any more, and it does not need to be: it is a row of the
           shell rather than the first thing in a scroller, so there is nothing
           for it to scroll away from. White, as the artboard draws it — the
           panes below carry the canvas tint, and the band reads as part of the
           chrome with them. */
        <div className="hidden min-h-[var(--page-band-h)] shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface-base)] px-[var(--content-gutter-x)] md:flex">
          {status ? <StatusChip status={status.status} label={status.label} /> : null}
          {reference ? (
            <span className="font-mono text-sm text-[var(--text-muted)]">{reference}</span>
          ) : null}
          {subtitle ? (
            <>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border)]" />
              <span className="min-w-0 truncate text-sm text-[var(--text-muted)]">{subtitle}</span>
            </>
          ) : null}
          {/* The figure, mono and heavy, with its own rule before it. It is the
              one thing in the band that is a number rather than a name, and
              without the rule it read as the end of the subtitle. */}
          {bandValue ? (
            <>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border)]" />
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">
                {bandValue}
              </span>
            </>
          ) : null}
          {beforeTabs ? (
            <div className="ml-auto flex min-w-0 shrink items-center justify-end">{beforeTabs}</div>
          ) : null}
        </div>
      ) : null}

      <div className={panes}>
        {/* The sections, in a pane of their own. It scrolls independently, so a
            record with thirteen sections keeps every one reachable without
            scrolling the conversation back to the top to get at them. */}
        {hasSectionRail ? (
          // 176 wide on 10/8 of padding, against the subtle hairline — the
          // artboard's rail exactly. White, because the pane beside it carries
          // the canvas tint and the seam between them is what makes it a rail.
          <aside className="hidden shrink-0 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-2.5 md:block md:w-[11rem]">
            {sectionRail}
            {/* Records this one points at. Under the sections rather than
                beside them: these are places to go, the same as a section, and
                a second rail on the other side of the page would be two lists
                of destinations facing each other. */}
            {related ? (
              <div className="mt-4">
                <p className="acct-rail-heading px-3 pb-1.5">Related</p>
                {related}
              </div>
            ) : null}
          </aside>
        ) : null}

        {/* The section being read. The canvas tint, so the cards inside it read
            as raised off something; the rails either side stay white.

            `scroll-padding-top` is the artboard's 130: a composer or a table
            header pinned inside this pane must never be what keyboard focus
            lands underneath. */}
        <div
          className={cn(
            "min-w-0 space-y-4",
            "md:flex-1 md:space-y-0 md:overflow-y-auto md:bg-[var(--canvas)] md:px-4 md:py-3 md:[scroll-padding-top:130px]",
          )}
        >
          {/* The record, at the head of the landing view, where a phone has no
              column to stand it in — identity first, then the same banded
              sections the pane on a desktop carries. */}
          {!openSection ? (
            <div className="space-y-5 lg:hidden">
              {identityBlock}
              {railSections}
            </div>
          ) : null}

          {/* Drilled in on a phone, the section names itself — the bar is
              still carrying the record's name. */}
          {openSection ? (
            <h2 className="text-base font-semibold text-[var(--text-strong)] md:hidden">
              {currentTab?.label}
            </h2>
          ) : null}

          <div className="min-w-0">{currentTab?.content}</div>

          {/* The same rail, at the foot of the landing view, where a phone
              has no column to put it in. One component either way, so a
              section reads the same whichever width you meet it at. */}
          {hasSectionRail && !openSection ? (
            <div className="border-t border-[var(--border-subtle)] pt-4 md:hidden">
              {sectionRail}
            </div>
          ) : null}
        </div>

        {/* The properties pane: what this record holds, beside whichever
            section is being read. Banded sections rather than a stack of
            cards — Properties, then whatever the page adds. Collapsible,
            because a reader working through a long document list wants the
            width.

            Its own scrollport, which is what lets the headings inside it pin.
            `RailSection` draws each heading as a band that sticks to the top of
            this pane — the artboard's Properties / How warm / Up next / Contact
            so far strips — and a sticky child only pins against the nearest
            scrolling ancestor. Without the overflow here that ancestor is the
            page, and the headings do nothing. */}
        {infoOpen ? (
          // 340 wide on 14 of padding, against the card hairline rather than
          // the subtle one — this seam separates two panes, where the rail's
          // only separates a rail from its content.
          <aside className="hidden shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-base)] px-3.5 lg:block lg:w-[21.25rem]">
            {/* No padding above the first band: it is the pane's own heading
                and it pins to the top of the scrollport, so anything stacked
                over it is a strip that slides underneath on the first
                scroll. */}
            <div className="pb-5">{railSections}</div>
          </aside>
        ) : (
          <aside className="hidden shrink-0 border-l border-[var(--border)] bg-[var(--surface-base)] px-2 pt-2 lg:block">
            {railToggle}
          </aside>
        )}
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
        className="-mx-1.5 block w-full rounded-[var(--radius-sm)] px-1.5 text-left text-base font-semibold leading-snug text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]"
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
      className="-mx-1.5 block w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-base)] px-1.5 py-0.5 text-base font-semibold leading-snug text-[var(--text-strong)] outline-none focus:border-[var(--action-primary-bg)]"
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
 *
 * No frame. A record has seven or eight of these — the value, the score, what
 * is next, the last email, what is owed — and a border around each turned the
 * rail into a column of boxes that all shout equally, which on a phone is the
 * first thing anybody sees. The heading already says where one section stops
 * and the next starts; a box around it says the same thing twice, louder.
 *
 * Headings are small and quiet on purpose. They are signposts for the figures
 * beneath them, and the figures are the content.
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
    <section>
      {/* A band, not a line of text.

          Uppercase and letter-spaced rather than merely small: at this size a
          lowercase grey heading reads as another line of body text, which is
          what left the rail looking like one undifferentiated column. The tint
          and the hairlines are what make it a boundary, and it pins to the top
          of the column so you can still see which block you are reading eight
          properties down. Bleeds out by the column's padding so the rules reach
          both edges instead of floating inside it. */}
      <div className="sticky top-0 z-10 -mx-3.5 mb-2 flex h-[30px] items-center gap-2 border-y border-[var(--border-subtle)] bg-[var(--canvas)] px-3.5">
        {/* `--text-muted`, not the subtle ink the rail headings elsewhere use.
            This one sits on the canvas tint rather than on white, and at 10px
            the lighter grey stopped reading as a heading and started reading as
            a disabled label. */}
        <h3 className="acct-rail-heading text-[var(--text-muted)]">{title}</h3>
        {meta ? <span className="ml-auto font-mono text-sm font-bold">{meta}</span> : null}
        {action ? <span className={cn("flex items-center", meta ? "" : "ml-auto")}>{action}</span> : null}
      </div>
      {/* The artboard's body inset. Without it the last row of one section and
          the band opening the next are 8px apart, which reads as the row
          belonging to the section below it. */}
      <div className="pb-3">{children}</div>
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
              <Link
                href={rendered.href}
                className="flex items-center justify-between gap-3 p-3 hover:bg-[var(--surface-hover)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{rendered.title}</span>
                  {rendered.subtitle ? (
                    <span className="block truncate text-sm text-[var(--text-muted)]">
                      {rendered.subtitle}
                    </span>
                  ) : null}
                </span>
                {rendered.meta ? (
                  <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">
                    {rendered.meta}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </Stack>
      {action}
    </div>
  );
}
