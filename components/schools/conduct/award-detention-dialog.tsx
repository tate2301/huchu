"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api-client";
import { awardDetention, fetchDetentionSessions } from "@/lib/schools/conduct-v2";
import { formatSchoolDayTime } from "@/lib/schools/format";

/**
 * `Award a detention`, from the incident it follows.
 *
 * ## Why this had to exist
 *
 * `awardDetention` shipped in `conduct-v2.ts` and was imported by nothing.
 * `POST /api/v2/schools/conduct/detention/awards` shipped and had no caller.
 * The detention screen's own empty state read "Award a detention from an
 * incident and the pupil appears on the register they are serving" — and the
 * incident page had no such verb, so the sentence named a path that did not
 * exist and the whole detention surface was a register nothing could put a
 * name on.
 *
 * ## Sessions are chosen, not generated
 *
 * A detention is owed in sessions and served at sittings the school has
 * already set up — Friday after school, Saturday morning. So this picks from
 * the sittings that exist rather than inventing dates: a school that runs
 * detention on Fridays does not want a Wednesday conjured for it, and the
 * register a supervisor marks is the sitting's, not the award's.
 *
 * `sessionsOwed` and the number of sittings picked are separate on purpose. Two
 * owed and one picked is a real state — the second is set later, when next
 * week's sitting exists — and the register carries "1 of 2" for exactly that.
 */
export function AwardDetentionDialog({
  open,
  onOpenChange,
  studentId,
  pupilName,
  incidentId,
  defaultReason,
  onAwarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  pupilName: string;
  incidentId: string;
  defaultReason: string;
  onAwarded: () => void;
}) {
  const [owed, setOwed] = useState("1");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["schools", "conduct", "detention", "sessions", "upcoming"],
    queryFn: () => fetchDetentionSessions({ limit: 30 }),
    enabled: open,
  });

  /*
    Only sittings that have not happened. A detention awarded into last
    Friday's register is a pupil marked absent from a sitting they were never
    told about, and the register is the document a school is asked for later.

    The cutoff is taken once, when the dialog mounts, rather than read during
    render. Reading the clock in a `useMemo` is impure — and the behaviour is
    better this way too: a list that re-sorted itself under the reader's cursor
    because a sitting started while they were choosing is how the wrong box
    gets ticked. The dialog is remounted per open, so every open takes a fresh
    reading.
  */
  const [openedAt] = useState(() => Date.now());

  const upcoming = useMemo(
    () =>
      (sessionsQuery.data?.rows ?? []).filter(
        (row) => new Date(row.startsAt).getTime() > openedAt,
      ),
    [sessionsQuery.data, openedAt],
  );

  const save = useMutation({
    mutationFn: () =>
      awardDetention({
        studentId,
        incidentId,
        reason: defaultReason || null,
        sessionsOwed: Number(owed || 1),
        sessionIds: picked,
      }),
    onSuccess: () => {
      setError(null);
      onAwarded();
      onOpenChange(false);
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const ready = picked.length > 0 && Number(owed) >= 1;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Award a detention"
      description={`${pupilName} appears on the register for each sitting you pick.`}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Awarding…" : "Award it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="rounded-md bg-[color:var(--tone-danger-surface)] px-3 py-2 text-sm text-[color:var(--tone-danger)]">
            {error}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="detention-owed">Sessions owed</Label>
          <Input
            id="detention-owed"
            type="number"
            min={1}
            max={10}
            className="w-[110px]"
            value={owed}
            onChange={(event) => setOwed(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Sittings</Label>
          {sessionsQuery.isPending ? (
            <p className="text-xs text-[color:var(--text-muted)]">Reading the sittings…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-xs text-[color:var(--text-muted)]">
              No detention sitting is set up ahead of today, and a detention is served at
              one.{" "}
              <Link
                href="/schools/conduct/detention"
                className="underline underline-offset-2 hover:text-[color:var(--text-body)]"
              >
                Set one up
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-md border border-[color:var(--border-subtle)] p-2">
              {upcoming.map((row) => {
                const checked = picked.includes(row.id);
                return (
                  <label
                    key={row.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[color:var(--surface-muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPicked((current) =>
                          checked
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                    />
                    <span className="font-mono text-xs">
                      {formatSchoolDayTime(row.startsAt)}
                    </span>
                    {row.room ? (
                      <span className="text-xs text-[color:var(--text-muted)]">
                        {row.room.name}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
          {picked.length > 0 && picked.length < Number(owed || 1) ? (
            // Said before the click. Half-awarding is legitimate — next week's
            // sitting may not exist yet — but it should be a decision, not a
            // surprise on the register.
            <p className="text-xs text-[color:var(--text-muted)]">
              {picked.length} of {owed} picked. The rest can be set once those sittings
              exist.
            </p>
          ) : null}
        </div>
      </div>
    </RecordDialog>
  );
}
