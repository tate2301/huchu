"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { ListRowsSkeleton, LoadError, SaveError } from "@/components/records/states";
import { RecordActions } from "@/components/schools/common/record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { reverseMerit, type MeritPupilRow } from "@/lib/schools/conduct-v2";
import { formatSchoolDayShort } from "@/lib/schools/format";

/**
 * One pupil's merit ledger, and the correction.
 *
 * Reversing is a stamp rather than a delete, and the reason is required —
 * `reverseMeritEntry` refuses without one. A point that counted towards a prize
 * and then stopped counting is a decision somebody has to be able to account
 * for, and "deleted by somebody, at some point" is not an account.
 */

type Entry = {
  id: string;
  kind: "MERIT" | "DEMERIT";
  points: number;
  note: string | null;
  awardedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  reason: { name: string };
  incidentId: string | null;
};

export function PupilLedgerDialog({
  pupil,
  onOpenChange,
}: {
  /** Null closes the dialog. */
  pupil: MeritPupilRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = pupil != null;
  const queryClient = useQueryClient();
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "conduct", "merits", "pupil", pupil?.student.id],
    queryFn: () =>
      fetchJson<{ rows: Entry[] }>(
        `/api/v2/schools/conduct/merits/pupil?studentId=${pupil?.student.id}`,
      ),
    enabled: open,
  });

  const reverse = useMutation({
    mutationFn: (input: { id: string; reason: string }) => reverseMerit(input.id, input.reason),
    onSuccess: () => {
      setReversing(null);
      setReason("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "conduct"] });
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const rows = query.data?.rows ?? [];

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        pupil
          ? `${pupil.student.firstName} ${pupil.student.lastName} — this term's ledger`
          : "Ledger"
      }
      description="Every merit and demerit recorded this term, and what was taken back."
      size="lg"
      errors={error ? [error] : undefined}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      }
    >
      {query.isPending ? (
        <ListRowsSkeleton rows={6} label="Reading the ledger" />
      ) : query.error ? (
        <LoadError
          what="the ledger"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--text-muted)]">
          Nothing has been recorded against this pupil this term.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {rows.map((entry) => (
            <li key={entry.id} className="space-y-1 py-2">
              <div className="flex items-start gap-2">
                <Badge tone={entry.kind === "MERIT" ? "success" : "warn"}>
                  {entry.kind === "MERIT" ? "Merit" : "Demerit"}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {entry.reason.name}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </span>
                  <span className="block text-xs text-[color:var(--text-muted)]">
                    {formatSchoolDayShort(entry.awardedAt)} · {entry.points}{" "}
                    {entry.points === 1 ? "point" : "points"}
                    {entry.incidentId ? " · from an incident" : ""}
                  </span>
                </span>
                <span className="shrink-0">
                  {entry.reversedAt ? (
                    <Badge tone="neutral">Taken back</Badge>
                  ) : (
                    <RecordActions
                      layout="inline"
                      size="sm"
                      resource="schools.conduct"
                      verbs={[
                        {
                          label: "Take it back",
                          action: "edit",
                          onSelect: () => {
                            setReversing(entry.id);
                            setReason("");
                          },
                        },
                      ]}
                    />
                  )}
                </span>
              </div>
              {entry.reversedAt ? (
                <p className="pl-1 text-xs text-[color:var(--text-muted)]">
                  Taken back {formatSchoolDayShort(entry.reversedAt)}
                  {entry.reversalReason ? ` — ${entry.reversalReason}` : ""}
                </p>
              ) : null}
              {reversing === entry.id ? (
                <div className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-2">
                  <Label htmlFor={`reverse-${entry.id}`}>Why it is being taken back</Label>
                  <Input
                    id={`reverse-${entry.id}`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Recorded against the wrong pupil"
                  />
                  <p className="text-xs text-[color:var(--text-muted)]">
                    The entry stays on the record and stops counting. The pupil will be told
                    something — this is it.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!reason.trim() || reverse.isPending}
                      onClick={() => reverse.mutate({ id: entry.id, reason: reason.trim() })}
                    >
                      {reverse.isPending ? "Saving…" : "Take it back"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReversing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {reverse.isError ? <SaveError what="That reversal" error={reverse.error} /> : null}
    </RecordDialog>
  );
}
