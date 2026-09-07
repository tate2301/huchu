"use client";

import type { ReactNode } from "react";
import { Button } from "@corelithzw/react";

import { MoreHorizontal } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { whoCan, type SchoolAction, type SchoolResource } from "@/lib/schools/access";

/**
 * The row verbs, gated by what the signed-in person may actually do.
 *
 * Two rules, and both come out of the same complaint: campus rendered every
 * verb for everybody and let the API refuse afterwards, so people learned the
 * permission model one red alert at a time.
 *
 *   - a verb somebody cannot use is DISABLED with the reason on it, not hidden.
 *     Hiding it makes the screen look different for every role and leaves a
 *     bursar wondering where the button they saw yesterday went; disabling it
 *     with "the warden does this" teaches the model once and stays put.
 *   - destroying anything confirms first, and the confirmation says what
 *     happens rather than asking whether you are sure.
 */

export type RecordVerb = {
  /** What the button says — an imperative: "Edit", "Archive", "Issue". */
  label: string;
  action: SchoolAction;
  onSelect: () => void;
  /** `danger` for irreversible, `warning` for serious but undoable. */
  tone?: "default" | "warning" | "danger";
  /** Shown in the confirmation. Omit for verbs that need no confirming. */
  confirm?: {
    title: string;
    description: ReactNode;
    confirmLabel: string;
  };
  /** A reason to disable that has nothing to do with permission. */
  unavailable?: string;
  loading?: boolean;
};

export function RecordActions({
  resource,
  verbs,
  size = "sm",
  layout = "inline",
}: {
  resource: SchoolResource;
  verbs: RecordVerb[];
  size?: "sm" | "md";
  /**
   * `inline` puts every verb on the row as a button. `menu` collapses them
   * behind a single "..." trigger.
   *
   * **Use `menu` in a table.** Three text buttons in the last cell is what made
   * the school tables unreadable: `/schools/students` came to 1,145px of
   * columns in 1,129px of space, so "Delete" was cut off at the window edge,
   * and `/people` came to 1,944px in 923px. The verbs are the widest thing in
   * the row and the least often used — the CRM tables, which are the standard
   * (see `docs/design-system/12-tables.md`), give the row a chevron and nothing
   * else.
   *
   * `inline` stays the default so the detail-page headers, where the verbs are
   * the point of the page, keep their buttons.
   *
   * Gating is identical in both: a verb somebody cannot use is DISABLED with
   * the reason on it, never hidden. Hiding it in a menu would quietly undo the
   * rule this component exists to enforce.
   */
  layout?: "inline" | "menu";
}) {
  const access = useSchoolAccess();

  const resolved = verbs.map((verb) => {
    const permitted = access.can(resource, verb.action);
    const who = permitted ? null : whoCan(resource, verb.action);
    const reason = !permitted
      ? who
        ? `This is ${who} to do.`
        : "Changing this is somebody else's job."
      : verb.unavailable;

    const run = async () => {
      if (!verb.confirm) {
        verb.onSelect();
        return;
      }
      const confirmed = await dsConfirm({
        title: verb.confirm.title,
        description: verb.confirm.description,
        confirmLabel: verb.confirm.confirmLabel,
        variant: verb.tone ?? "default",
      });
      if (confirmed) verb.onSelect();
    };

    return { verb, reason, run };
  });

  if (layout === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant="ghost"
            className="size-7 p-0"
            aria-label="Row actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {resolved.map(({ verb, reason, run }) => (
            <DropdownMenuItem
              key={verb.label}
              disabled={Boolean(reason) || verb.loading}
              title={reason ?? undefined}
              variant={verb.tone === "danger" ? "destructive" : "default"}
              onSelect={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              {verb.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {verbs.map((verb) => {
        const permitted = access.can(resource, verb.action);
        const who = permitted ? null : whoCan(resource, verb.action);
        const reason = !permitted
          ? who
            ? `This is ${who} to do.`
            : "Changing this is somebody else's job."
          : verb.unavailable;

        return (
          <Button
            key={verb.label}
            size={size}
            variant={verb.tone === "danger" ? "danger" : "secondary"}
            disabled={Boolean(reason) || verb.loading}
            loading={verb.loading}
            title={reason ?? undefined}
            onClick={async () => {
              if (!verb.confirm) {
                verb.onSelect();
                return;
              }
              const confirmed = await dsConfirm({
                title: verb.confirm.title,
                description: verb.confirm.description,
                confirmLabel: verb.confirm.confirmLabel,
                variant: verb.tone ?? "default",
              });
              if (confirmed) verb.onSelect();
            }}
          >
            {verb.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The one create button a list page carries, in its header.
 *
 * Same gating rule as the row verbs: disabled with the reason, never absent —
 * a registrar and a bursar should see the same page shape.
 */
export function CreateButton({
  resource,
  label,
  onSelect,
  action = "create",
  unavailable,
}: {
  resource: SchoolResource;
  /** "New student", "Add a hostel" — the noun, not "Create". */
  label: string;
  onSelect: () => void;
  action?: SchoolAction;
  unavailable?: string;
}) {
  const access = useSchoolAccess();
  const permitted = access.can(resource, action);
  const who = permitted ? null : whoCan(resource, action);
  const reason = !permitted
    ? who
      ? `This is ${who} to do.`
      : "Creating these is somebody else's job."
    : unavailable;

  return (
    <Button
      variant="primary"
      disabled={Boolean(reason)}
      title={reason ?? undefined}
      onClick={onSelect}
    >
      {label}
    </Button>
  );
}
