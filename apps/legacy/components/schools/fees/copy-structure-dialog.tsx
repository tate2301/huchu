"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import { formatSchoolMoney } from "@/lib/schools/format";
import type { SchoolFeeStructureRecord } from "@/lib/schools/fees-v2";

/**
 * Copy one year group's fee sheet to the others.
 *
 * The gap this closes is not a bug anybody would file: `provisionSchool` leaves a
 * starter structure on the first rung of the ladder, and a combined school has
 * sixteen rungs. Every term, a bursar was re-typing identical lines fifteen times
 * — and a mis-keyed levy on Form 4 looks exactly like a fee policy until a parent
 * queries it.
 *
 * The copies land as drafts. This is a bulk change to what families owe, so it is
 * proposed here and activated after somebody has read it — the same reason a fee
 * structure has a DRAFT state at all. The checkbox is for the bursar who has
 * already read the source and means it.
 */

type CloneResponse = {
  created: number;
  skipped: string[];
  term: { code: string; name: string };
};

export function CopyStructureDialog({
  structure,
  open,
  onOpenChange,
}: {
  structure: SchoolFeeStructureRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [activate, setActivate] = useState(false);
  const [result, setResult] = useState<CloneResponse | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
    enabled: open,
  });

  // The source's own class is pulled out of the dependency list rather than read
  // through the optional chain inside it: the compiler cannot see that
  // `structure?.class.id` is stable, and refuses to keep the memo.
  const sourceClassId = structure?.class.id ?? null;
  const targets = useMemo(
    () => (classesQuery.data?.data ?? []).filter((row) => row.id !== sourceClassId),
    [classesQuery.data, sourceClassId],
  );

  const copy = useMutation({
    mutationFn: async () => {
      if (!structure) throw new Error("No fee structure chosen");
      return fetchJson<CloneResponse>(
        `/api/v2/schools/fees/structures/${structure.id}/clone`,
        {
          method: "POST",
          body: JSON.stringify({
            classIds: selected,
            status: activate ? "ACTIVE" : "DRAFT",
          }),
        },
      );
    },
    onSuccess: (response) => {
      setResult(response);
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
    },
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setSelected([]);
      setActivate(false);
      setResult(null);
      copy.reset();
    }
  };

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy this fee sheet</DialogTitle>
          <DialogDescription>
            {structure
              ? `${structure.name} — ${structure._count.lines} lines, ${formatSchoolMoney(
                  structure.totals?.amount ?? 0,
                  structure.currency,
                )} a term. The copies keep the same lines and land in ${structure.term.name}.`
              : "Choose a fee structure first."}
          </DialogDescription>
        </DialogHeader>

        {copy.error ? (
          <Alert variant="destructive">
            <AlertTitle>Nothing was copied</AlertTitle>
            <AlertDescription>{getApiErrorMessage(copy.error)}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <AlertTitle>
              {result.created === 0
                ? "Nothing to copy"
                : `Copied to ${result.created} year group${result.created === 1 ? "" : "s"}`}
            </AlertTitle>
            <AlertDescription>
              {/* The skipped ones are named. A bursar who asked for fifteen and
                  got thirteen needs to know which two the school had already
                  decided for itself, not a count. */}
              {result.skipped.length > 0
                ? `${result.skipped.join(", ")} already had a live fee sheet for ${result.term.name} and were left alone.`
                : activate
                  ? "They are active and can be invoiced against."
                  : "They are drafts — activate each one when you have read it."}
            </AlertDescription>
          </Alert>
        ) : null}

        {classesQuery.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-2">
            {/* The canvas heads the list "Year groups" and hangs Select all off
                the same line. It matters on a sixteen-rung ladder: without a
                heading the checkbox column reads as the dialog's whole subject
                rather than as the choice inside it. */}
            <div className="flex items-center gap-2">
              <h3 className="text-[length:var(--type-caption)] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Year groups
              </h3>
              <div className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelected(
                    selected.length === targets.length ? [] : targets.map((row) => row.id),
                  )
                }
              >
                {selected.length === targets.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {targets.map((row) => (
                <label
                  key={row.id}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--surface-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggle(row.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1 font-medium">{row.name}</span>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--text-muted)]">
                    {row._count.students} {row._count.students === 1 ? "pupil" : "pupils"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
            className="h-4 w-4"
          />
          Make them active straight away
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0 || copy.isPending || !structure}
            onClick={() => copy.mutate()}
          >
            {copy.isPending
              ? "Copying…"
              : `Copy to ${selected.length || "no"} year group${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
