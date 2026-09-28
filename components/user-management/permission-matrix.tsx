"use client";

import * as React from "react";

/*
  The file rather than the barrel: `@/components/management/ui` re-exports
  `SettingsSurface`, which pulls Radix's Dialog in behind it, and this block
  also renders on two ordinary pages that have no surface. A client barrel is
  not reliably tree-shaken.
*/
import { SectionHeading } from "@/components/management/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "@/lib/icons";
import type {
  PermissionEntry,
  PermissionGroup,
  PermissionState,
} from "@/lib/user-management-api";

import styles from "./permission-matrix.module.css";

/**
 * One person's permissions, all of them, in one searchable list.
 *
 * The two things that make this usable rather than exhausting are the search
 * — nobody scrolls two hundred rows to find "export" — and the third state.
 * "Role default" has to be a visible, choosable state, not the absence of a
 * choice, because otherwise an admin cannot tell "she may export because reps
 * may" apart from "she may export because somebody decided so in March", and
 * those two behave differently the day her role changes.
 *
 * Drawn as a section of the Users record (`Main.dc.html`), which is what it
 * has always been and never looked like. Three changes carry that:
 *
 *   - **A group is a list, so it is drawn as one.** Section heading with its
 *     count (rule 7), the 11px column header line over an #E5E8EE hairline
 *     (rule 6), then one-line rows on #EEF0F4 at the lists' own 470 cap. It
 *     used to be an `h3` at 14px over a bare `divide-y` stack.
 *   - **The state is a state, not a chip.** A 6px dot and the word in that
 *     state's ink, which is how the contract expresses a status value inside
 *     a record list. A column of `Badge`s reads as a column of buttons.
 *   - **The control is the design system's.** A three-option `Select` in the
 *     row's value column replaces a horizontal `RadioGroup` that could not
 *     fit on one line and so forced every row to two or three.
 *
 * Both descriptions — the group's and the entry's — stop being drawn. Rule 1:
 * no descriptive helper text; if a control needs explaining its name is
 * wrong. They are still read, by the search, which is the one place the extra
 * words earn their keep.
 */

/** What the reader is told, per state. */
type StateTone = "neutral" | "success" | "danger";

const STATES: PermissionState[] = ["DEFAULT", "ALLOW", "DENY"];

/**
 * The words the old badges used, kept — they are the right ones. What moved
 * is that they are now the *choices* as well as the readout, so the trigger
 * says what the row's access actually is rather than naming a mechanism.
 *
 * Following the role is the norm and stays grey whichever way the role
 * answers; the word carries the difference. Colour is spent on the two
 * exceptions, an admin's grant and an admin's denial (rule 5).
 */
function describe(
  entry: PermissionEntry,
  state: PermissionState,
): { label: string; tone: StateTone } {
  if (state === "ALLOW") return { label: "Granted", tone: "success" };
  if (state === "DENY") return { label: "Denied", tone: "danger" };
  return {
    label: entry.roleDefault ? "Allowed by role" : "Not in role",
    tone: "neutral",
  };
}

function matches(entry: PermissionEntry, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${entry.label} ${entry.description} ${entry.key}`.toLowerCase();
  return haystack.includes(needle);
}

function PermissionRow({
  entry,
  canEdit,
  pending,
  onChange,
}: {
  entry: PermissionEntry;
  canEdit: boolean;
  pending: boolean;
  onChange: (entry: PermissionEntry, state: PermissionState) => void;
}) {
  const current = describe(entry, entry.state);

  return (
    <li
      className={styles.row}
      data-editable={canEdit ? "true" : "false"}
      data-pending={pending ? "true" : "false"}
    >
      <span className={styles.rowName} title={entry.label}>
        {entry.label}
      </span>
      <span className={styles.rowValue}>
        {canEdit ? (
          <Select
            value={entry.state}
            disabled={pending}
            onValueChange={(value) => onChange(entry, value as PermissionState)}
          >
            <SelectTrigger
              size="sm"
              aria-label={`${entry.label} access`}
              className={styles.stateTrigger}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((state) => {
                const option = describe(entry, state);
                return (
                  <SelectItem key={state} value={state}>
                    <span className={styles.state} data-tone={option.tone}>
                      {option.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          /*
            Rule 9, read the other way round: where the admin may not change
            this, there is no disabled control to explain — there is a fact.
          */
          <span className={styles.state} data-tone={current.tone}>
            {current.label}
          </span>
        )}
      </span>
    </li>
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
  const searchId = React.useId();
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

  const filtered = needle.length > 0 || onlyOverrides;

  return (
    <div className={styles.block}>
      {/* Rule 2: the block's controls sit at the top of the block. */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <label htmlFor={searchId} className={styles.srOnly}>
            Search permissions
          </label>
          <Search className="size-3.5" />
          <input
            id={searchId}
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search permissions"
          />
        </div>

        <button
          type="button"
          className={styles.button}
          aria-pressed={onlyOverrides}
          onClick={() => setOnlyOverrides((current) => !current)}
        >
          Changed from role
          {overrideCount > 0 ? (
            <span className={styles.buttonCount}>{overrideCount}</span>
          ) : null}
        </button>

        {/* Rule 9: an admin who may not reset, or has nothing to reset, is
            shown no button rather than a dead one. */}
        {canEdit && onReset && overrideCount > 0 ? (
          <button
            type="button"
            className={styles.button}
            onClick={onReset}
            disabled={isResetting}
          >
            {isResetting ? "Resetting…" : "Reset to role"}
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <span>
            {onlyOverrides && needle.length === 0
              ? "Nothing differs from the role"
              : "No matches"}
          </span>
          {filtered ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setSearch("");
                setOnlyOverrides(false);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {visible.map((group) => (
        <section key={group.id}>
          <SectionHeading count={group.entries.length}>{group.label}</SectionHeading>

          {/* Rule 6: every list names its columns. */}
          <div className={styles.columns}>
            <span className={styles.columnName}>Permission</span>
            <span className={styles.columnValue}>Access</span>
          </div>

          <ul className={styles.rows}>
            {group.entries.map((entry) => (
              <PermissionRow
                key={entry.id}
                entry={entry}
                canEdit={canEdit}
                pending={pendingKey === entry.id}
                onChange={onChange}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
