import * as React from "react";

import { Teams } from "@/components/teams/teams-root";

/** One board of the kit: its anchor, and the kit's own layout around the parts. */
export function Board({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Teams>
      <section id={id.toLowerCase()} data-board={id} className="tk-board">
        {children}
      </section>
    </Teams>
  );
}

/** A section with its heading on the left, the parts on the right. */
export function Sec({ title, children, narrow }: { title: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className={narrow ? "tk-sec tk-sec--narrow" : "tk-sec"}>
      <div>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Top({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tk-top">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  return <div className={cols === 2 ? "tk-grid" : cols === 3 ? "tk-grid tk-grid--3" : "tk-grid tk-grid--4"}>{children}</div>;
}

export function Cell({ name, span, children }: { name?: string; span?: 1 | 2 | "all"; children: React.ReactNode }) {
  return (
    <div className={span === "all" ? "tk-cell tk-span" : span === 2 ? "tk-cell tk-span2" : "tk-cell"}>
      {name ? <span className="tk-name">{name}</span> : null}
      {children}
    </div>
  );
}

export function Frame({
  variant,
  children,
  style,
}: {
  variant?: "col" | "stack" | "row" | "float" | "pad" | "bar";
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className={variant ? `tk-frame tk-frame--${variant}` : "tk-frame"} style={style}>
      {children}
    </div>
  );
}

/** The workspace's mark: its initial's crown, drawn on the action colour. */
export function WsMark({ size = 40 }: { size?: 40 | 28 | 24 }) {
  return (
    <span className={size === 28 ? "wsmark" : `wsmark wsmark-${size}`} style={{ background: "var(--action-fill)" }}>
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3 20V5l5 6 4-6 4 6 5-6v15h-4v-7l-5 6-5-6v7z" />
      </svg>
    </span>
  );
}
