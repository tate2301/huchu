"use client";

import { useState } from "react";
import Link from "next/link";

import { FieldInput } from "@/components/forms/field-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { validateAnswers } from "@/lib/forms/fields";
import { MoreHorizontal } from "@/lib/icons";
import { answersToBody, fillTemplate } from "@/lib/reports/actions";
import type { ReportRow, ReportRowAction } from "@/lib/reports/types";

type EditAction = Extract<ReportRowAction, { kind: "edit" }>;

/**
 * What can be done to one row, in one menu at its end.
 *
 * The actions come from the report's definition, already cut to what this
 * person's role may do; an action whose target cannot be filled from this row —
 * a quote with no deal to open — is left out rather than offered and refused.
 */
export function ReportRowActions({
  row,
  actions,
  onChanged,
}: {
  row: ReportRow;
  actions: ReportRowAction[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<EditAction | null>(null);

  const usable = actions.filter((action) =>
    action.kind === "open" ? fillTemplate(action.href, row) !== null : fillTemplate(action.endpoint, row) !== null,
  );
  if (usable.length === 0) return null;

  const remove = async (action: Extract<ReportRowAction, { kind: "delete" }>) => {
    const confirmed = await dsConfirm({
      title: fillTemplate(action.confirm, row, false) ?? action.label,
      confirmLabel: action.label,
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await fetchJson(fillTemplate(action.endpoint, row)!, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" });
      onChanged();
    } catch (error) {
      toast({ title: "Not deleted", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const destructive = usable.filter((action) => action.kind === "delete");
  const rest = usable.filter((action) => action.kind !== "delete");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Row actions"
            className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--canvas)] hover:text-[var(--text)] data-[state=open]:bg-[var(--canvas)]"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {rest.map((action) =>
            action.kind === "open" ? (
              <DropdownMenuItem key={action.id} asChild>
                <Link href={fillTemplate(action.href, row)!}>{action.label}</Link>
              </DropdownMenuItem>
            ) : action.kind === "edit" ? (
              <DropdownMenuItem key={action.id} onSelect={() => setEditing(action)}>
                {action.label}
              </DropdownMenuItem>
            ) : null,
          )}
          {rest.length && destructive.length ? <DropdownMenuSeparator /> : null}
          {destructive.map((action) => (
            <DropdownMenuItem key={action.id} variant="destructive" onSelect={() => void remove(action)}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {editing ? (
        <EditRowDialog
          row={row}
          action={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function EditRowDialog({
  row,
  action,
  onClose,
  onSaved,
}: {
  row: ReportRow;
  action: EditAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      action.fields.map((field) => [field.key, row[action.values[field.key] ?? field.key] ?? ""]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const checked = validateAnswers(action.fields, answers);
    if (checked.problems.length > 0) {
      setErrors(Object.fromEntries(checked.problems.map((problem) => [problem.key, problem.message])));
      return;
    }
    setSaving(true);
    try {
      await fetchJson(fillTemplate(action.endpoint, row)!, {
        method: "PATCH",
        body: JSON.stringify(answersToBody(action.fields, checked.values)),
      });
      toast({ title: "Saved", variant: "success" });
      onSaved();
    } catch (error) {
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {action.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              idPrefix="row-edit"
              value={answers[field.key]}
              error={errors[field.key]}
              onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
