"use client";

import * as React from "react";
import { Tooltip } from "@corelithzw/react";

import { VaneMark } from "@/components/core/vane-mark";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { cn } from "@/lib/utils";

import { Glyph, type GlyphName } from "./glyph";
import { PresenceFaces, type Here } from "./presence";
import { Teams } from "./teams-root";

/**
 * The top bar (K7): the shipped 56px bar with the owner's rules on it.
 * Left: back link, title, favourite, previous and next with "3 of 9". Right: who is here, the page's actions
 * (the primary last, the rest folded into More with their shortcuts), then search, the bell and Vane as 36px
 * icon buttons. Counts ride on badges; names live in the tooltip with the shortcut.
 * Below 720px it is back, title, the three tools and More, which then holds the primary as well.
 */

export type BarAction = {
  id: string;
  label: string;
  icon: GlyphName;
  shortcut?: string;
  onSelect?: () => void;
};

export type VaneStatus = "idle" | "working" | "paused";

export type TopBarProps = {
  /** A record page: where Back goes. A list page has an icon and no back. */
  back?: { label: string; href: string };
  icon?: GlyphName;
  title: string;
  /** A fact beside a list page's title: "9 open". */
  count?: string;
  favourite?: { on: boolean; onToggle?: () => void };
  step?: { position: number; total: number; noun: string; onPrevious?: () => void; onNext?: () => void };
  presence?: Here[];
  /** Folded into More, in groups. */
  more?: BarAction[][];
  /** One per page, shown last among the actions. */
  primary?: BarAction;
  search?: { shortcut: string; onOpen?: () => void; hintOpen?: boolean };
  bell?: { count?: number; onOpen?: () => void };
  vane?: { count?: number; status?: VaneStatus; open?: boolean; onToggle?: () => void };
  /** Keep More open: for a board that draws it so. */
  moreOpen?: boolean;
  className?: string;
};

export function useNarrow(ref: React.RefObject<HTMLElement | null>, below = 720) {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < below));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, below]);
  return narrow;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}

function Tip({ name, shortcut, open, children }: { name: string; shortcut?: string; open?: boolean; children: React.ReactElement }) {
  return (
    <Tooltip
      side="bottom"
      open={open}
      content={
        <span className="tip-body">
          {name}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

function Badge({ count }: { count?: number }) {
  const before = React.useRef(count);
  const [pop, setPop] = React.useState(0);
  React.useEffect(() => {
    if (before.current !== count) {
      before.current = count;
      setPop((n) => n + 1);
    }
  }, [count]);
  if (!count) return null;
  return (
    <span key={pop} className={cn("ibtn__badge", pop > 0 && "ibtn__badge--pop")} aria-hidden="true">
      {count}
    </span>
  );
}

export function TopBar({
  back,
  icon,
  title,
  count,
  favourite,
  step,
  presence,
  more,
  primary,
  search = { shortcut: "Ctrl K" },
  bell,
  vane,
  moreOpen,
  className,
}: TopBarProps) {
  const ref = React.useRef<HTMLElement>(null);
  const narrow = useNarrow(ref);
  const groups = (more ?? []).filter((g) => g.length > 0);
  const phoneGroups = narrow && primary ? [[primary], ...groups] : groups;
  const hasMore = phoneGroups.length > 0;
  const vaneCount = vane?.count ?? 0;
  const bellLabel = bell?.count ? `Notifications, ${bell.count} need you` : "Notifications";
  const vaneLabel = vane?.status === "working" ? "Vane, working" : vaneCount ? `Vane, ${vaneCount} waiting for you` : "Vane";

  return (
    <Teams>
      <header ref={ref} className={cn("tb", narrow && "tb--narrow", className)}>
        {back ? (
          <a className="tb__back" href={back.href} aria-label={narrow ? `Back to ${back.label}` : undefined}>
            <Glyph name="caret-left" />
            <span className="tb__back-label">{back.label}</span>
          </a>
        ) : icon ? (
          <Glyph name={icon} className="tb__icon" />
        ) : null}
        {back ? <span className="tb__sep">/</span> : null}
        <h1 className="tb__title">{title}</h1>
        {favourite ? (
          <button
            type="button"
            className="tb__fav"
            aria-pressed={favourite.on}
            aria-label={favourite.on ? "Remove from favourites" : "Add to favourites"}
            onClick={favourite.onToggle}
          >
            <Glyph name="star" size="sm" />
          </button>
        ) : null}
        {step ? (
          <span className="tb__step">
            <button type="button" aria-label={`Previous ${step.noun}, K`} onClick={step.onPrevious} disabled={step.position <= 1}>
              <Glyph name="caret-left" size="sm" />
            </button>
            <button type="button" aria-label={`Next ${step.noun}, J`} onClick={step.onNext} disabled={step.position >= step.total}>
              <Glyph name="caret-right" size="sm" />
            </button>
            <span className="tb__pos">
              {step.position} of {step.total}
            </span>
          </span>
        ) : null}
        {count ? (
          <span className="tb__pos" style={{ paddingLeft: 2 }}>
            {count}
          </span>
        ) : null}
        <span className="spacer" />
        {presence?.length ? (
          <span className="tb__presence">
            <PresenceFaces faces={presence} />
          </span>
        ) : null}
        <div className="tb__acts">
          {hasMore ? (
            <Menu open={moreOpen}>
              <MenuTrigger asChild>
                <Button iconOnly aria-label="More" icon={<Glyph name="more" />} />
              </MenuTrigger>
              <MenuContent align="end" style={{ minWidth: 256 }}>
                {phoneGroups.map((group, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 ? <MenuSeparator /> : null}
                    {group.map((a) => (
                      <MenuItem key={a.id} icon={<Glyph name={a.icon} />} hint={a.shortcut} onSelect={a.onSelect}>
                        {a.label}
                      </MenuItem>
                    ))}
                  </React.Fragment>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
          {primary && !narrow ? (
            <Button variant="primary" icon={<Glyph name={primary.icon} />} onClick={primary.onSelect}>
              {primary.label}
              {primary.shortcut ? <Kbd>{primary.shortcut}</Kbd> : null}
            </Button>
          ) : null}
        </div>
        <span className="tb__div" />
        <div className="tb__tools">
          <Tip name="Search everything" shortcut={search.shortcut} open={search.hintOpen}>
            <button type="button" className="ibtn" aria-label={`Search everything, ${search.shortcut}`} onClick={search.onOpen}>
              <Glyph name="search" />
            </button>
          </Tip>
          <Tip name="Notifications" shortcut="G N">
            <button type="button" className="ibtn" aria-label={bellLabel} onClick={bell?.onOpen}>
              <Glyph name="bell" />
              <Badge count={bell?.count} />
            </button>
          </Tip>
          <Tip name="Vane" shortcut="V">
            <button
              type="button"
              className={cn("ibtn", "ibtn--vane", vane?.status === "working" && "ibtn--working")}
              aria-pressed={!!vane?.open}
              aria-label={vaneLabel}
              onClick={vane?.onToggle}
            >
              <span style={vane?.status === "paused" ? { opacity: 0.45, display: "flex" } : { display: "flex" }}>
                <VaneMark size={20} />
              </span>
              <Badge count={vaneCount} />
            </button>
          </Tip>
        </div>
      </header>
    </Teams>
  );
}
