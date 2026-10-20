"use client";

import * as React from "react";

import { Segmented } from "@/components/workspace/segmented";
import { cn } from "@/lib/utils";

import { Glyph, type GlyphName } from "./glyph";
import { Teams } from "./teams-root";

/**
 * The standard right panel (K6, K7), for records, invoices, quotes and builders. A switch at its head, the
 * position figure first, Vane's cards on this record, details edited in place, linked records, people, files,
 * and a footer with who made it and the code. When Vane is open it takes the panel's place (`VanePanel`).
 */

export type PanelTab = { id: string; label: string; icon: GlyphName; note?: string };

export function Panel({
  head,
  children,
  foot,
  className,
  style,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Teams>
      <aside className={cn("pn", className)} style={style}>
        {head}
        <div className="pn__body">
          {children}
          {foot}
        </div>
      </aside>
    </Teams>
  );
}

/** The switch at the panel's head: Details and Comments on a record, This field and The form in a builder. */
export function PanelHead({
  tabs,
  tab,
  onTab,
  onHide,
}: {
  tabs: PanelTab[];
  tab: string;
  onTab?: (id: string) => void;
  onHide?: () => void;
}) {
  return (
    <div className="pn__head">
      <Segmented
        aria-label="Panel"
        className="pn__switch"
        value={tab}
        onValueChange={onTab}
        items={tabs.map((t) => ({
          value: t.id,
          label: (
            <>
              <Glyph name={t.icon} size="sm" />
              {t.label}
              {t.note ? <span className="chip__n">{t.note}</span> : null}
            </>
          ),
        }))}
      />
      <button type="button" className="ibtn" aria-label="Hide the panel, ]" onClick={onHide}>
        <Glyph name="caret-right" size="sm" />
      </button>
    </div>
  );
}

/** A section: its heading folds it. A count rides beside the heading; one action sits at the far end. */
export function PanelSection({
  title,
  count,
  action,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  gap,
  children,
}: {
  title?: React.ReactNode;
  count?: number;
  action?: { label: string; icon: GlyphName; onClick?: () => void };
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wider spacing for the position section. */
  gap?: "wide";
  children?: React.ReactNode;
}) {
  const [inner, setInner] = React.useState(defaultOpen);
  const open = openProp ?? inner;
  const toggle = () => {
    setInner(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className={cn("pn__sec", !open && "pn__sec--closed")} style={gap === "wide" ? { gap: "var(--tm-s4)" } : undefined}>
      {title != null ? (
        <div className="pn__sh">
          <button type="button" className="pn__fold" aria-expanded={open} onClick={toggle}>
            <Glyph name="caret-down" />
            {title}
            {count != null ? <span className="pn__n">{count}</span> : null}
          </button>
          {action ? (
            <button type="button" className="pn__act" onClick={action.onClick}>
              <Glyph name={action.icon} />
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Who made it, and its code. */
export function PanelFoot({
  made,
  code,
  onCopy,
  action,
}: {
  made: string;
  code: string;
  onCopy?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="pn__foot">
      <span>{made}</span>
      <span className="spacer" />
      {action ?? (
        <>
          <span className="code">{code}</span>
          <button type="button" className="ibtn" style={{ width: 28, height: 28 }} aria-label="Copy link" onClick={onCopy}>
            <Glyph name="copy" size="sm" />
          </button>
        </>
      )}
    </div>
  );
}

/** The panel hidden: a strip of icons, with a dot where something is waiting. */
export function PanelStrip({
  items,
  onShow,
}: {
  items: Array<{ id: string; label: string; icon: GlyphName; dot?: boolean }>;
  onShow?: () => void;
}) {
  return (
    <Teams>
      <div className="strip">
        <button type="button" className="ibtn" aria-label="Show the panel, ]" onClick={onShow}>
          <Glyph name="caret-left" size="sm" />
        </button>
        {items.map((i) => (
          <button key={i.id} type="button" className="ibtn" aria-label={i.label}>
            <Glyph name={i.icon} />
            {i.dot ? <span className="ibtn__dot" /> : null}
          </button>
        ))}
      </div>
    </Teams>
  );
}

/** The panel while it loads: the shapes of what will be there. */
export function PanelSkeleton() {
  const row = (label: number, value: number, key: number) => (
    <div key={key} className="sk-row">
      <span className="sk" style={{ width: label }} />
      <span className="sk" style={{ width: value }} />
    </div>
  );
  return (
    <>
      <section className="pn__sec" aria-busy="true">
        <span className="sk" style={{ width: 60 }} />
        <span className="sk" style={{ width: 180, height: 28 }} />
        <span className="sk" style={{ width: 260 }} />
        <span className="sk" style={{ width: "100%", height: 6, marginTop: 8 }} />
      </section>
      <section className="pn__sec">
        <span className="sk" style={{ width: 110 }} />
        {[90, 150, 120, 170, 80].map((v, i) => row(70, v, i))}
      </section>
    </>
  );
}
