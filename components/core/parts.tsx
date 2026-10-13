import * as React from "react";

import { Icon, type IconName } from "./icon";

const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

export type Tone = "success" | "warning" | "danger" | "info" | "live";

/** A status dot and its word: the table's way of showing state. */
export function Status({ tone, children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={join("status", tone && `status-${tone}`)}>{children}</span>;
}

export type PillTone = "ok" | "warn" | "bad" | "info" | "plain" | "n";

/** A pill: a status with more weight, or a count (`n`). */
export function Pill({ tone = "plain", children }: { tone?: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Count({ urgent = false, children }: { urgent?: boolean; children: React.ReactNode }) {
  return <span className={join("count", urgent && "count-urgent")}>{children}</span>;
}

/** A thin bar for a share of a whole: 0 to 100. */
export function Meter({ value, warning = false, label }: { value: number; warning?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={join("meter", warning && "meter-warning")}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * The finding a list or board opens with: one sentence in ink that states the
 * fact in figures, then one in grey that says what is behind it.
 */
export function Finding({ fact, rest }: { fact: React.ReactNode; rest?: React.ReactNode }) {
  return (
    <div className="finding">
      <p className="lede-figure">
        {fact}
        {rest ? <span className="q"> {rest}</span> : null}
      </p>
    </div>
  );
}

export function GroupHead({ title, sum, id }: { title: React.ReactNode; sum?: React.ReactNode; id?: string }) {
  return (
    <div className="group-head">
      <h2 id={id}>{title}</h2>
      {sum !== undefined ? <span className="sum">{sum}</span> : null}
    </div>
  );
}

/** A settings section: its title and one line on the left, its rows on the right. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="form-sec">
      <header>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="body">{children}</div>
    </section>
  );
}

/** One row of a settings section: what it is, one line under it, its control. */
export function Setting({
  title,
  description,
  control,
  htmlFor,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="setting" htmlFor={htmlFor}>
      <span className="t">
        <b>{title}</b>
        {description ? <span>{description}</span> : null}
      </span>
      {control}
    </label>
  );
}

/** What a place shows when there is nothing in it yet, and the one act that fills it. */
export function Empty({
  icon = "list",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} className="glyph" />
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** A banner across the top of a region: a warning, an error, or a plain note. */
export function Banner({
  tone,
  icon = "warn",
  children,
  actions,
}: {
  tone?: "warning" | "danger";
  icon?: IconName;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={join("banner", tone && `banner-${tone}`)} role={tone ? "alert" : "status"}>
      <Icon name={icon} />
      <span>{children}</span>
      {actions ? <span className="end">{actions}</span> : null}
    </div>
  );
}

/** A row of figure tiles, as the retail data tables draw them. */
export function FigureStrip({
  figures,
}: {
  figures: Array<{ label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode; tone?: "success" | "warning" | "danger" }>;
}) {
  return (
    <div className="kstrip" style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
      {figures.map((figure, index) => (
        <div className="kt" key={index}>
          <span className="kt-l">{figure.label}</span>
          <span className="kt-v">{figure.value}</span>
          {figure.note ? (
            <span className="kt-n" style={figure.tone ? { color: `var(--color-${figure.tone})` } : undefined}>
              {figure.note}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A figure tile on a dashboard grid. `span` is its width out of 12. */
export function Kpi({
  label,
  icon,
  value,
  note,
  foot,
  span = 3,
  bars,
}: {
  label: React.ReactNode;
  icon?: IconName;
  value: React.ReactNode;
  note?: React.ReactNode;
  foot?: React.ReactNode;
  span?: number;
  bars?: Array<{ value: number; tone?: "accent" | "muted" }>;
}) {
  const top = bars ? Math.max(1, ...bars.map((bar) => bar.value)) : 1;
  return (
    <div className="kpi" style={{ gridColumn: `span ${span}` }}>
      <span className="kpi-l">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </span>
      <span className="kpi-v">{value}</span>
      {note ? <span className="kpi-n">{note}</span> : null}
      {bars ? (
        <span className="kpi-b" aria-hidden="true">
          {bars.map((bar, index) => (
            <i
              key={index}
              style={{
                height: `${Math.max(6, (bar.value / top) * 100)}%`,
                background: bar.tone === "accent" ? "var(--color-accent)" : "var(--color-rule)",
              }}
            />
          ))}
        </span>
      ) : null}
      {foot ? <span className="kpi-f">{foot}</span> : null}
    </div>
  );
}
