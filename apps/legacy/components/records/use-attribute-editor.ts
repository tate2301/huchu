"use client";

import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * Editing a record's properties in place.
 *
 * The attribute list has always been able to write through — `RecordAttribute`
 * takes an `onCommit` — but no page passed one, so every property on every
 * record was read-only and the only way to change a phone number was the
 * create form it was first typed into. This is the missing half: one mutation
 * per record, and helpers that turn a field name into the `{ value, onCommit }`
 * pair the list wants.
 *
 * Writes go straight through on blur or Enter. There is no save button here
 * because there is no save button anywhere else on a record page, and a
 * property somebody changed and forgot to save is worse than one they never
 * changed at all.
 */
export function useAttributeEditor({
  path,
  invalidate,
}: {
  /** The record's API route, e.g. /api/v2/crm/people/<id>. */
  path: string;
  /** Query keys to refresh once the write lands. */
  invalidate: unknown[][];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      fetchJson(path, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      for (const key of invalidate) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) =>
      toast({
        title: "Could not save that change",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  /** A field that may be emptied — the server takes null for "not known". */
  const text = (field: string, value: string | null | undefined) => ({
    value: value ?? null,
    onCommit: (next: string) => {
      const trimmed = next.trim();
      save.mutate({ [field]: trimmed === "" ? null : trimmed });
    },
  });

  /** A field the record cannot be without — a name. Blank is refused, not sent. */
  const required = (field: string, value: string | null | undefined) => ({
    value: value ?? null,
    onCommit: (next: string) => {
      const trimmed = next.trim();
      if (trimmed === "") {
        toast({
          title: "That one cannot be empty",
          description: "The record needs it to be nameable in a list.",
          variant: "destructive",
        });
        return;
      }
      save.mutate({ [field]: trimmed });
    },
  });

  /** A number. Anything unparseable is refused rather than silently zeroed. */
  const numeric = (field: string, value: number | null | undefined) => ({
    value: value == null ? null : String(value),
    onCommit: (next: string) => {
      const trimmed = next.trim();
      if (trimmed === "") {
        save.mutate({ [field]: null });
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        toast({
          title: "That is not a number",
          description: `"${trimmed}" cannot be stored as ${field}.`,
          variant: "destructive",
        });
        return;
      }
      save.mutate({ [field]: parsed });
    },
  });

  /**
   * A field whose value has to be one of a known set — an owner, a status, a
   * stage. Empty means null: "unassigned" is a real answer, not a blank.
   */
  const choice = (
    field: string,
    value: string | null | undefined,
    options: Array<{ value: string; label: string; leading?: ReactNode }>,
    clearLabel?: string,
  ) => ({
    value: value ?? null,
    options,
    clearLabel,
    onCommit: (next: string) => save.mutate({ [field]: next === "" ? null : next }),
  });

  return { save, text, required, numeric, choice };
}
