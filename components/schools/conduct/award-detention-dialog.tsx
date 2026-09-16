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
/**
 * What `POST /conduct/detention/awards` will accept in `reason`.
 *
 * The caller builds this from the incident's category and summary, and an
 * incident summary is allowed 500 characters while a category name is allowed
 * 80 — so the obvious `${category} — ${summary}` overruns this by a factor of
 * three on a wordy incident. The route answers 400, and this dialog has no
 * reason field to correct, so the award became impossible for exactly the
 * incidents most likely to need one.
 */
const REASON_MAX = 200;

/** Clip on a word where there is one, so the register reads as a sentence. */
function clipReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length <= REASON_MAX) return trimmed;
  const cut = trimmed.slice(0, REASON_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > REASON_MAX - 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

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

  /*
    The cutoff is taken once, when the dialog mounts, rather than read during
    render. Reading the clock in a `useMemo` is impure — and the behaviour is
    better this way too: a list that re-sorted itself under the reader's cursor
    because a sitting started while they were choosing is how the wrong box
    gets ticked. The dialog is remounted per open, so every open takes a fresh
    reading.
  */
  const [openedAt] = useState(() => Date.now());
  const from = new Date(openedAt).toISOString();

  /*
    `from` is sent to the SERVER, not applied afterwards.

    `detentionSessions` orders `startsAt: "asc"` and takes the first `limit`, so
    asking for 30 and filtering to future ones in the browser fetches the
    term's EARLIEST thirty — which by half term are all in the past. The list
    then came back empty and the dialog said "no sitting is set up ahead of
    today" to a school with a sitting every Friday.

    The client-side filter below stays as belt and braces for the boundary
    case where a sitting starts between the request and the render.
  */
  const sessionsQuery = useQuery({
    queryKey: ["schools", "conduct", "detention", "sessions", "upcoming", from],
    queryFn: () => fetchDetentionSessions({ from, limit: 30 }),
    enabled: open,
  });

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
        reason: defaultReason ? clipReason(defaultReason) : null,
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
          ) : sessionsQuery.error ? (
            /*
              A failed fetch is not an empty term. Rendering the "nothing is set
              up" copy on an error is the false-empty defect this whole branch
              exists to fix, and it would have told a head of year to create a
              sitting that already exists.
            */
            <p className="text-xs text-[color:var(--tone-danger)]">
              The sittings could not be read, so there is nothing to choose from yet.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void sessionsQuery.refetch()}
              >
                Try again
              </button>
            </p>
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
