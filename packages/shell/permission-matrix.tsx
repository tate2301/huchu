"use client";

import * as React from "react";
import { Badge, Input, Radio, RadioGroup } from "@corelithzw/react";

import { Button } from "@corelithzw/ui/components/button";
import { Search } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import type {
  PermissionEntry,
  PermissionGroup,
  PermissionState,
} from "@corelithzw/platform/user-management-api";

/**
 * One person's permissions, all of them, in one searchable list.
 *
 * The two things that make this usable rather than exhausting are the search
 * — nobody scrolls two hundred rows to find "export" — and the third radio.
 * "Role default" has to be a visible, choosable state, not the absence of a
 * choice, because otherwise an admin cannot tell "she may export because reps
 * may" apart from "she may export because somebody decided so in March", and
 * those two behave differently the day her role changes.
 */

const STATE_OPTIONS: Array<{ value: PermissionState; label: string; hint: string }> = [
  { value: "DEFAULT", label: "Role default", hint: "Follows the role" },
  { value: "ALLOW", label: "Allow", hint: "Granted to this person" },
  { value: "DENY", label: "Deny", hint: "Taken away from this person" },
];

function matches(entry: PermissionEntry, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${entry.label} ${entry.description} ${entry.key}`.toLowerCase();
  return haystack.includes(needle);
}

function StateBadge({ entry }: { entry: PermissionEntry }) {
  if (entry.state === "DEFAULT") {
    return (
      <Badge tone="neutral">
        {entry.roleDefault ? "Allowed by role" : "Not in role"}
      </Badge>
    );
  }
  return (
    <Badge tone={entry.state === "ALLOW" ? "success" : "danger"}>
      {entry.state === "ALLOW" ? "Granted" : "Denied"}
    </Badge>
  );
}

function PermissionRow({
  entry,
  disabled,
  pending,
  onChange,
}: {
  entry: PermissionEntry;
  disabled: boolean;
  pending: boolean;
  onChange: (entry: PermissionEntry, state: PermissionState) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6",
        pending && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{entry.label}</span>
          <StateBadge entry={entry} />
        </div>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{entry.description}</p>
      </div>

      <RadioGroup
        orientation="horizontal"
        value={entry.state}
        disabled={disabled || pending}
        onChange={(value) => onChange(entry, value as PermissionState)}
        aria-label={`${entry.label} access`}
        className="flex shrink-0 flex-wrap items-center gap-4"
      >
        {STATE_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            title={option.hint}
          />
        ))}
      </RadioGroup>
    </div>
  );
}

export function PermissionMatrix({
  groups,
  canEdit,
  pendingKey,
  onChange,
  onReset,
  overrideCount,
  isResetting,
}: {
  groups: PermissionGroup[];
  canEdit: boolean;
  pendingKey: string | null;
  onChange: (entry: PermissionEntry, state: PermissionState) => void;
  onReset?: () => void;
  overrideCount: number;
  isResetting?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [onlyOverrides, setOnlyOverrides] = React.useState(false);

  const needle = search.trim().toLowerCase();

  const visible = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter(
            (entry) =>
              matches(entry, needle) && (!onlyOverrides || entry.state !== "DEFAULT"),
          ),
        }))
        .filter((group) => group.entries.length > 0),
    [groups, needle, onlyOverrides],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search permissions"
            aria-label="Search permissions"
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          variant={onlyOverrides ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setOnlyOverrides((current) => !current)}
        >
          Changed from role
          {overrideCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-[var(--surface-subtle)] px-1.5 text-sm">
              {overrideCount}
            </span>
          ) : null}
        </Button>

        {canEdit && onReset && overrideCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={isResetting}>
            {isResetting ? "Resetting…" : "Reset to role"}
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          {onlyOverrides
            ? "Nothing here differs from the role."
            : "No permission matches that search."}
        </p>
      ) : null}

      {visible.map((group) => (
        <section key={group.id} className="space-y-1">
          <div>
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <p className="text-sm text-[var(--text-muted)]">{group.description}</p>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {group.entries.map((entry) => (
              <PermissionRow
                key={entry.id}
                entry={entry}
                disabled={!canEdit}
                pending={pendingKey === entry.id}
                onChange={onChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
