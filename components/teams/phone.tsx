import * as React from "react";

import { Button } from "@/components/workspace/button";

import { Glyph, type GlyphName } from "./glyph";

/** The phone's frame: a bar, a body and a tab bar, in the width a phone has. Presentational. */
export function Phone({ height = 720, children }: { height?: number; children: React.ReactNode }) {
  return (
    <div className="tl-phone" style={{ height }}>
      <div className="phone" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

/** Back, the record's code, and More: nothing else fits, and nothing else is needed. */
export function PhoneBar({ back, title, more = true }: { back: string; title: string; more?: boolean }) {
  return (
    <div className="pbar">
      <Button variant="ghost" iconOnly aria-label={back} icon={<Glyph name="caret-left" />} style={{ width: 44 }} />
      <span className="pbar__t">{title}</span>
      <span className="spacer" />
      {more ? <Button variant="ghost" iconOnly aria-label="More" icon={<Glyph name="more" />} style={{ width: 44 }} /> : null}
    </div>
  );
}

/** Timeline, Details, Documents: the record's tabs, each as wide as the phone allows. */
export function PhoneTabs({ tabs }: { tabs: Array<{ label: string; count?: number; selected?: boolean }> }) {
  return (
    <div className="tabs" role="tablist" style={{ padding: "0 var(--tm-s2)" }}>
      {tabs.map((t) => (
        <button
          key={t.label}
          type="button"
          className="tab"
          role="tab"
          aria-selected={!!t.selected}
          style={{ flex: 1, justifyContent: "center" }}
        >
          {t.label}
          {t.count != null ? <span className="tab__count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function PhoneTabbar({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; icon: GlyphName; current?: boolean; count?: number }>;
}) {
  return (
    <nav className="tabbar" aria-label={label}>
      {items.map((it) => (
        <a key={it.label} href="#" aria-current={it.current ? "page" : undefined}>
          <Glyph name={it.icon} />
          {it.label}
          {it.count ? <span className="tabbar__n">{it.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}
