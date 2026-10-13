"use client";

import * as React from "react";

import { Tabs, type TabItem } from "@/components/core";

/**
 * The builder's inspector: the selected block's settings, split by tabs
 * (Block, Look, When clicked), or with no tabs a heading over one panel.
 */
export function BuilderInspector<V extends string>({
  tabs,
  tab,
  onTab,
  heading,
  children,
}: {
  tabs?: TabItem<V>[];
  tab?: V;
  onTab?: (tab: V) => void;
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {tabs && tab ? <Tabs label="Settings" items={tabs} value={tab} onChange={onTab} /> : null}
      {!tabs && heading ? <div className="rb-ins-h">{heading}</div> : null}
      <div className="rb-pan">{children}</div>
    </>
  );
}

/** A setting that is on or off, with what it does under its name. */
export function SwitchRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="rb-swrow">
      <span>
        <b id={`${id}-l`}>{label}</b>
        {help ? <span className="muted" style={{ fontSize: 13 }}>{help}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        aria-labelledby={`${id}-l`}
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
