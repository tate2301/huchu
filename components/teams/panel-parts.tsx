"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/workspace/menu";
import { cn } from "@/lib/utils";

import { WhatsAppMark } from "./brand-marks";
import { Face, type Person } from "./face";
import { Glyph, type GlyphName } from "./glyph";

/** Position: the figure that says where the record stands. */
export function Position({
  label,
  figure,
  of,
  muted,
  note,
  progress,
  children,
}: {
  label: string;
  figure: React.ReactNode;
  of?: React.ReactNode;
  /** A figure that is not there yet. */
  muted?: boolean;
  note?: React.ReactNode;
  /** A bar of how much is done, with its legend. */
  progress?: {
    percent: number;
    label: string;
    legend: Array<{ label: string; open?: boolean }>;
  };
  children?: React.ReactNode;
}) {
  return (
    <div className="pos">
      <span className="pn__label">{label}</span>
      <div className="pos__row">
        <span
          className="figure"
          style={muted ? { color: "var(--faint)" } : undefined}
        >
          {figure}
        </span>
        {of ? <span className="pos__of">{of}</span> : null}
      </div>
      {note ? (
        <div className="figure-note" style={{ marginTop: 0 }}>
          {note}
        </div>
      ) : null}
      {progress ? (
        <>
          <div
            className="track"
            style={{ marginTop: 6 }}
            role="img"
            aria-label={progress.label}
          >
            <i style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="legend">
            {progress.legend.map((l) => (
              <span key={l.label}>
                <i className={l.open ? "legend__open" : undefined} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {children}
    </div>
  );
}

/** Where a record is on its way: bars for the steps done, the one now, and the rest. */
export function StagePath({
  steps,
  now,
  label,
  sub,
}: {
  steps: number;
  now: number;
  label: string;
  sub: string;
}) {
  return (
    <div className="stagepath">
      <div
        className="steps"
        role="img"
        aria-label={`${label}, ${now + 1} of ${steps}`}
      >
        {Array.from({ length: steps }, (_, i) => (
          <i
            key={i}
            className={i < now ? "on" : i === now ? "now" : undefined}
          />
        ))}
      </div>
      <div className="stagepath__l">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/** What is coming up on this record, in the one colour that says it is due. */
export function NextUp({
  when,
  title,
  actions,
}: {
  when: string;
  title: string;
  actions: Array<{
    label: string;
    icon: GlyphName;
    shortcut?: string;
    onClick?: () => void;
  }>;
}) {
  return (
    <div className="next">
      <div className="next__m">{when}</div>
      <div className="next__t">{title}</div>
      {actions.length ? (
        <div className="cx-group next__acts">
          {actions.map((a) => (
            <Button
              key={a.label}
              icon={<Glyph name={a.icon} />}
              onClick={a.onClick}
            >
              {a.label}
              {a.shortcut ? <span className="kbd">{a.shortcut}</span> : null}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One of Vane's cards on this record: a suggestion or an issue, what it noticed, and what it offers. */
export function VaneCard({
  kind,
  from,
  title,
  body,
  actions,
}: {
  kind: "suggestion" | "issue";
  from: string;
  title: string;
  body?: string;
  actions?: Array<{
    label: string;
    icon?: GlyphName;
    quiet?: boolean;
    onClick?: () => void;
  }>;
}) {
  return (
    <article className={cn("vc", kind === "issue" && "vc--issue")}>
      <div className="vc__k">
        <Glyph name={kind === "issue" ? "alert" : "note"} />
        {kind === "issue" ? "Issue" : "Suggestion"} · from {from}
      </div>
      <div className="vc__h">{title}</div>
      {body ? <div className="vc__b">{body}</div> : null}
      {actions?.length ? (
        <div className="vc__acts">
          {actions.map((a) => (
            <Button
              key={a.label}
              variant={a.quiet ? "ghost" : "secondary"}
              icon={a.icon ? <Glyph name={a.icon} /> : undefined}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export type KVState = "empty" | "locked" | "changed" | "hover";

/** Key and value, edited in place. Label beside value; an empty value says Add; a locked one says why by its lock. */
export function KV({ children }: { children: React.ReactNode }) {
  return <dl className="kv">{children}</dl>;
}

export function KVRow({
  icon,
  label,
  state,
  editing,
  lock,
  children,
}: {
  icon: GlyphName;
  label: string;
  state?: KVState;
  editing?: boolean;
  /** Shows the lock at the end: this value cannot be changed by this person. */
  lock?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      <dt>
        <Glyph name={icon} />
        {label}
      </dt>
      <dd
        className={cn(
          state === "empty" && "is-empty",
          state === "locked" && "is-locked",
          state === "changed" && "is-changed",
          state === "hover" && "is-hover",
          editing && "is-editing",
        )}
        data-editable={state === "locked" ? undefined : ""}
      >
        {state === "empty" ? "Add" : children}
        {lock ? <Glyph name="lock" size="sm" className="kv__lock" /> : null}
        {state !== "locked" && state !== "empty" && !editing && !lock ? (
          <Glyph name="pencil" size="sm" className="kv__edit" />
        ) : null}
      </dd>
    </>
  );
}

/** A value picked from a list, in place: the value takes a ring and the choices open under it. */
export function KVSelect({
  icon,
  label,
  value,
  options,
  caption,
  addLabel,
  onChange,
  defaultOpen,
}: {
  icon: GlyphName;
  label: string;
  value: string;
  options: string[];
  caption: string;
  addLabel?: string;
  onChange?: (value: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  return (
    <>
      <dt>
        <Glyph name={icon} />
        {label}
      </dt>
      <dd className={cn(open && "is-editing")} data-editable="">
        <Menu open={open} onOpenChange={setOpen}>
          <MenuTrigger asChild>
            <button type="button" className="kv__pick">
              {value}
              <Glyph
                name="caret-down"
                size="sm"
                style={{ marginLeft: "auto", color: "var(--ink-3)" }}
              />
            </button>
          </MenuTrigger>
          <MenuContent align="start" style={{ minWidth: 232 }}>
            <div className="pn__label" style={{ padding: "8px 10px 4px" }}>
              {caption}
            </div>
            <MenuRadioGroup value={value} onValueChange={onChange}>
              {options.map((o) => (
                <MenuRadioItem key={o} value={o}>
                  {o}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            {addLabel ? (
              <>
                <MenuSeparator />
                <MenuItem icon={<Glyph name="plus" />}>{addLabel}</MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      </dd>
    </>
  );
}

/** A link to another record: what it is, what it is about, and its figure or date. */
export function LinkRow({
  icon,
  tone,
  title,
  sub,
  end,
  href,
}: {
  icon: GlyphName;
  tone?: "ok";
  title: string;
  sub?: string;
  end?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span
        className="lk__mark"
        style={
          tone === "ok"
            ? { background: "var(--ok-soft)", color: "var(--ok)" }
            : undefined
        }
      >
        <Glyph name={icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <div className="lk__t">{title}</div>
        {sub ? <div className="lk__s">{sub}</div> : null}
      </span>
      <span className="lk__end">{end}</span>
    </>
  );
  return href ? (
    <a className="lk" href={href}>
      {body}
    </a>
  ) : (
    <div className="lk">{body}</div>
  );
}

/** A person on the record: their face, role and how to reach them. */
export function ContactRow({
  person,
  sub,
  call,
  whatsapp,
}: {
  person: Person;
  sub: string;
  call?: boolean;
  whatsapp?: boolean;
}) {
  return (
    <div className="person">
      <Face person={person} size={32} label={person.name} />
      <div>
        <div className="person__name">{person.name}</div>
        <div className="person__sub">{sub}</div>
      </div>
      <div className="person__end">
        {call ? (
          <button
            type="button"
            className="ibtn"
            style={{ width: 28, height: 28 }}
            aria-label={`Call ${person.name}`}
          >
            <Glyph name="phone" />
          </button>
        ) : null}
        {whatsapp ? (
          <button
            type="button"
            className="ibtn"
            style={{ width: 28, height: 28 }}
            aria-label={`WhatsApp ${person.name}`}
          >
            <WhatsAppMark />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A file: its kind, name, who added it and when, and what it belongs to. */
export function FileRow({
  kind,
  name,
  sub,
  end,
}: {
  kind: "pdf" | "xls" | "img" | "file";
  name: string;
  sub: string;
  end?: string;
}) {
  const label = { pdf: "PDF", xls: "XLS", img: "JPG", file: "" }[kind];
  return (
    <div className="fl">
      <span className={cn("fl__mark", kind !== "file" && `fl__mark--${kind}`)}>
        {label}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="lk__t">{name}</div>
        <div className="lk__s">{sub}</div>
      </div>
      {end ? <span className="lk__s">{end}</span> : null}
    </div>
  );
}

/** A tick list: what has happened, and what has not yet. */
export function Tick({
  done,
  children,
  when,
}: {
  done?: boolean;
  children: React.ReactNode;
  when?: string;
}) {
  return (
    <div className={cn("tick", !done && "off")}>
      <Glyph name={done ? "check" : "wait"} size="sm" />
      {children}
      <span className="spacer" />
      {when ? <span className="muted">{when}</span> : null}
    </div>
  );
}

/** A setting of the selected field: its label above, its value in a box. */
export function PanelField({
  label,
  children,
  quiet,
}: {
  label: string;
  children: React.ReactNode;
  quiet?: boolean;
}) {
  return (
    <div className="fld">
      <span className="fld__l">{label}</span>
      <span
        className="inp"
        style={quiet ? { color: "var(--ink-2)" } : undefined}
      >
        {children}
      </span>
    </div>
  );
}

/** Two settings side by side. */
export function PanelPair({ children }: { children: React.ReactNode }) {
  return <div className="row2">{children}</div>;
}

/** A choice made by a switch, named by what it does. */
export function PanelSwitch({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange?: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="tick" style={{ color: "var(--ink)" }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={typeof children === "string" ? children : undefined}
        className={cn("sw", on && "on")}
        onClick={() => onChange?.(!on)}
        style={{ border: 0, padding: 0, cursor: "pointer" }}
      />
      {children}
    </div>
  );
}

/** A rule in words: the parts that matter in bold. */
export function PanelCondition({ children }: { children: React.ReactNode }) {
  return <div className="cond">{children}</div>;
}
