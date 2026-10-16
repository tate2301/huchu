"use client";

import { useEffect, useState } from "react";
import type { Vertical } from "@prisma/client";

import { findLibraryWorkspaces } from "@/app/portal/admin/(all)/library/actions";
import type { LibraryReach } from "@/lib/library/store";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";

type Workspace = { id: string; name: string; slug: string };

export type ReachDraft = { audience: LibraryReach["audience"]; verticals: Vertical[]; workspaces: Workspace[] };

export function reachOf(draft: ReachDraft): LibraryReach {
  if (draft.audience === "VERTICALS") return { audience: "VERTICALS", verticals: draft.verticals };
  if (draft.audience === "WORKSPACES") return { audience: "WORKSPACES", companyIds: draft.workspaces.map((workspace) => workspace.id) };
  return { audience: "EVERYONE" };
}

const AUDIENCES: Array<[ReachDraft["audience"], string, string]> = [
  ["EVERYONE", "Every workspace", "Each one sees it, now and as new ones are set up."],
  ["VERTICALS", "Workspaces in chosen verticals", "A workspace that adds the vertical later sees it then."],
  ["WORKSPACES", "Chosen workspaces", "Only the ones named here."],
];

const choice =
  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]";

/** Who a published item reaches: everyone, chosen verticals, or chosen workspaces. */
export function ReachPicker({ value, onChange }: { value: ReachDraft; onChange: (next: ReachDraft) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Workspace[]>([]);

  useEffect(() => {
    if (value.audience !== "WORKSPACES") return;
    let live = true;
    const timer = setTimeout(() => {
      void findLibraryWorkspaces(q).then((rows) => live && setFound(rows));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, value.audience]);

  const picked = new Set(value.workspaces.map((workspace) => workspace.id));

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="t-label mb-1.5 text-[var(--ink)]">Who gets it</legend>
        {AUDIENCES.map(([audience, label, help]) => (
          <label key={audience} className={choice}>
            <input
              type="radio"
              name="audience"
              className="mt-1"
              checked={value.audience === audience}
              onChange={() => onChange({ ...value, audience })}
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
              <span className="block text-[13px] text-[var(--text-muted)]">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {value.audience === "VERTICALS" ? (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Verticals</legend>
          {VERTICAL_ORDER.map((vertical) => (
            <label key={vertical} className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={value.verticals.includes(vertical)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    verticals: event.target.checked ? [...value.verticals, vertical] : value.verticals.filter((held) => held !== vertical),
                  })
                }
              />
              {VERTICALS[vertical].label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {value.audience === "WORKSPACES" ? (
        <div className="space-y-2">
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Find a workspace"
            aria-label="Find a workspace"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]">
            {[...value.workspaces, ...found.filter((workspace) => !picked.has(workspace.id))].map((workspace) => (
              <li key={workspace.id}>
                <label className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--hover)]">
                  <input
                    type="checkbox"
                    checked={picked.has(workspace.id)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        workspaces: event.target.checked
                          ? [...value.workspaces, workspace]
                          : value.workspaces.filter((held) => held.id !== workspace.id),
                      })
                    }
                  />
                  <span className="font-medium text-[var(--ink)]">{workspace.name}</span>
                  <span className="ml-auto font-mono text-xs text-[var(--text-muted)]">{workspace.slug}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="t-body-sm text-[var(--text-muted)]">{value.workspaces.length} chosen</p>
        </div>
      ) : null}
    </div>
  );
}
