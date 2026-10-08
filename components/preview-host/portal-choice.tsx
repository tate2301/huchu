"use client";

import * as React from "react";

import { Segmented } from "@/components/retail/till/parts";
import { Check } from "@/lib/icons";

/** Which of a workspace's addresses: a segmented choice that names the button after it. */
export function PortalChoice({
  portals,
  initialSlug,
  initialPortal,
  rootDomain,
  disabled,
  quiet,
}: {
  portals: Array<{ prefix: string; label: string }>;
  initialSlug: string;
  initialPortal: string;
  rootDomain: string | null;
  disabled: boolean;
  quiet: boolean;
}) {
  const [slug, setSlug] = React.useState(initialSlug);
  const [portal, setPortal] = React.useState(initialPortal);
  const id = React.useId();
  const clean = slug.trim().toLowerCase();
  const label = portals.find((entry) => entry.prefix === portal)?.label ?? "Workspace";
  // The placeholder stands in while the field is empty, so the help and the button always show the shape.
  const name = clean || "acme";
  const example = rootDomain ? `${portal ? `${portal}.` : ""}${name}.${rootDomain}` : null;

  return (
    <form method="get" action="/preview-host" className="stack-16">
      <div className="field">
        <label htmlFor={id}>Workspace</label>
        <input
          id={id}
          name="ws"
          className="input input-lg num text-left"
          placeholder="acme"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={slug}
          disabled={disabled}
          onChange={(event) => setSlug(event.target.value)}
        />
        <span className="help">
          {example ? (
            <>
              Becomes <span className="num">{example}</span>
            </>
          ) : (
            "PLATFORM_ROOT_DOMAIN is not set here, so use a whole address below."
          )}
        </span>
      </div>
      <input type="hidden" name="portal" value={portal} />
      <Segmented
        label="Which address"
        className="self-start"
        value={portal}
        options={portals.map((entry) => ({ value: entry.prefix, label: entry.label }))}
        onChange={setPortal}
        disabled={disabled}
      />
      <div>
        <button type="submit" className={quiet ? "btn" : "btn btn-primary"} disabled={disabled || !clean || !rootDomain}>
          <Check className="ic" />
          {clean ? `Use ${clean}’s ${label.toLowerCase()}` : `Type a workspace for its ${label.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
