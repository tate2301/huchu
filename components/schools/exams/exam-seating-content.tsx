"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls } from "@/components/records/table-controls";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { getApiErrorMessage } from "@/lib/api-client";
import { assignSeats, fetchSeating } from "@/lib/schools/exams-v2";
import { formatSchoolDate, formatSchoolDayTime } from "@/lib/schools/format";
import { ExamSeriesTabs } from "@/components/schools/exams/exam-series-tabs";
import { AllocateRoomDialog } from "@/components/schools/exams/allocate-room-dialog";
import { RenumberHallDialog } from "@/components/schools/exams/renumber-hall-dialog";

/**
 * Seating and invigilation.
 *
 * The unit is the **session** rather than the paper, because a school seats a
 * room for a sitting: two papers at nine o'clock on Tuesday are one hall, one
 * set of desks and one invigilator.
 *
 * The clash — a candidate down for two overlapping sessions — is the one number
 * here that cannot be fixed by moving a chair, so it is an alert naming the
 * papers rather than a figure folded into `Still to seat`, where it would look
 * like work somebody could finish.
 *
 * Everything else the sitting knows is read off the thing it describes: how
 * many candidates are in it sits on the control row, beside the filter that
 * chose the sitting; seated and still-to-seat sit on "Where everyone sits",
 * which is the list they count.
 */
export function ExamSeatingContent({ seriesId }: { seriesId: string }) {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [paperFilter, setPaperFilter] = useState("");
  const [scope, setScope] = useState<"session" | "timetable">("session");
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [renumberOpen, setRenumberOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const seatingQuery = useQuery({
    queryKey: ["schools", "exams", "seating", seriesId, sessionId],
    queryFn: () => fetchSeating(seriesId, sessionId || undefined),
  });

  const seat = useMutation({
    mutationFn: (candidateIds?: string[]) =>
      assignSeats(seriesId, plan?.session.id ?? "", candidateIds),
    onSuccess: (result) => {
      setActionError(null);
      setNote(result.message ?? `${result.seated} seated.`);
      void queryClient.invalidateQueries({ queryKey: ["schools", "exams", "seating"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const page = seatingQuery.data;
  const plan = page?.plan ?? null;

  return (
    <SchoolsPage>
      <PageChrome
        title="Seating and invigilation"
        backHref="/schools/exams"
        backLabel="Exam series"
      >
        <RecordActions
          layout="inline"
          resource="schools.exams"
          verbs={[
            {
              label: "Assign seats",
              action: "edit",
              loading: seat.isPending,
              unavailable:
                plan == null
                  ? "Pick a session first."
                  : plan.rooms.length === 0
                    ? "No room has been given to this session yet, so there is nowhere to seat anybody."
                    : plan.chips.stillToSeat === 0
                      ? "Everybody in this session already has a seat."
                      : undefined,
              onSelect: () => seat.mutate(undefined),
            },
          ]}
        />
      </PageChrome>

      {plan ? (
        <PageCaption>
          {[
            plan.session.subject && plan.session.paperCode
              ? `${plan.session.subject} (${plan.session.paperCode})`
              : plan.session.label,
            formatSchoolDate(plan.session.startsAt),
            formatSchoolDayTime(plan.session.startsAt).split(" ").pop(),
            plan.session.durationMinutes
              ? `${Math.round(plan.session.durationMinutes / 60)} hours`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </PageCaption>
      ) : null}

      <ExamSeriesTabs seriesId={seriesId} />

      {actionError ? <SaveError what="The seating" error={actionError} /> : null}
      {note ? <Alert tone="info" title={note} /> : null}

      {seatingQuery.error ? (
        <LoadError
          what="the seating plan"
          error={seatingQuery.error}
          onRetry={() => void seatingQuery.refetch()}
        />
      ) : (page?.sessions.length ?? 0) === 0 && !seatingQuery.isPending ? (
        <NothingYet
          title="This series has no sittings yet"
          body="A sitting is a paper on a date at a time. Seating hangs off it, and so does the invigilation list — so the timetable is written first."
          action={
            <Button asChild variant="primary">
              <Link href={`/schools/exams/${seriesId}/timetable`}>Open the timetable</Link>
            </Button>
          }
        />
      ) : (
        <>
          <TableControls
            /* This session, or the whole timetable. A seating plan is read one
               sitting at a time and checked across all of them — "is anybody
               down for two papers at once" is a question about the timetable
               rather than about a hall. */
            tabs={
              <PopulationTabs<"session" | "timetable">
                value={scope}
                onChange={setScope}
                tabs={[
                  { id: "session", label: "This session" },
                  { id: "timetable", label: "The whole timetable", count: page?.sessions.length },
                ]}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Session"
                  allLabel="The first sitting"
                  value={sessionId}
                  options={(page?.sessions ?? []).map((session) => ({
                    value: session.id,
                    label: [
                      formatSchoolDate(session.startsAt),
                      formatSchoolDayTime(session.startsAt).split(" ").pop(),
                      session.paper?.code,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  onChange={setSessionId}
                />
                {/* The paper, where a sitting carries more than one. It narrows
                    what the list is about without changing which hall it is in. */}
                <FilterSelect
                  label="Paper"
                  allLabel="Every paper in it"
                  value={paperFilter}
                  options={[
                    ...new Set(
                      (page?.sessions ?? [])
                        .map((entry) => entry.paper?.code)
                        .filter((code): code is string => Boolean(code)),
                    ),
                  ].map((code) => ({ value: code, label: code }))}
                  onChange={setPaperFilter}
                />
              </>
            }
            /* How many people the session has to seat. It belongs beside the
               session filter because it is that filter's answer — pick another
               sitting and it is a different hall of candidates. */
            count={plan ? `${plan.chips.candidates} candidates` : null}
            actions={
              <Button variant="secondary" size="sm" onClick={() => setAllocateOpen(true)}>
                Give a room to this session
              </Button>
            }
          />

          {/* The clash. Two papers at once cannot be seated away. */}
          {plan && plan.clashes.length > 0 && plan.chips.sittingTwoAtOnce > 0 ? (
            <Alert
              tone="danger"
              title={`${plan.chips.sittingTwoAtOnce} ${plan.chips.sittingTwoAtOnce === 1 ? "candidate is" : "candidates are"} down for another paper at the same time — ${plan.clashes
                .map((clash) => clash.paperCode ?? clash.subject ?? "another paper")
                .join(", ")}`}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setSessionId(plan.clashes[0].id)}>
                  Open the clash
                </Button>
              }
            />
          ) : null}

          {scope === "timetable" ? (
            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
                <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                  The whole timetable
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {page?.sessions.length ?? 0} sittings
                </span>
              </h2>
              {paperFilter &&
              (page?.sessions ?? []).every((entry) => entry.paper?.code !== paperFilter) ? (
                <NothingMatched
                  what="sittings"
                  filters={[paperFilter]}
                  onClear={() => setPaperFilter("")}
                />
              ) : null}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-muted)]">
                    <th className="w-[200px] py-1 font-normal">When</th>
                    <th className="py-1 font-normal">Paper</th>
                    <th className="w-[120px] py-1 text-right font-normal">
                      <span className="sr-only">Open it</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(page?.sessions ?? [])
                    .filter((entry) => !paperFilter || entry.paper?.code === paperFilter)
                    .map((entry) => (
                      <tr key={entry.id} className="border-t border-[color:var(--border-subtle)]">
                        <td className="py-1.5 font-mono text-xs font-bold">
                          {formatSchoolDayTime(entry.startsAt)}
                        </td>
                        <td className="py-1.5">
                          {entry.paper
                            ? `${entry.paper.examSubject.name} (${entry.paper.code})`
                            : (entry.label ?? "No paper named")}
                        </td>
                        <td className="py-1.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSessionId(entry.id);
                              setScope("session");
                            }}
                          >
                            Open it
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
                <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                  Rooms in this session
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {plan ? `${plan.rooms.length} rooms` : ""}
                </span>
              </h2>
              {seatingQuery.isPending ? (
                <TableRowsSkeleton
                  rows={3}
                  headers={["Room or candidate", "Seats", "Capacity or arrangement", "Invigilator"]}
                  columns={[{}, { width: 70, align: "right" }, { width: 160 }, {}]}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[color:var(--text-muted)]">
                      <th className="py-1 font-normal">Room or candidate</th>
                      <th className="w-[70px] py-1 text-right font-normal">Seats</th>
                      <th className="w-[170px] py-1 font-normal">Capacity or arrangement</th>
                      <th className="py-1 font-normal">Invigilator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(plan?.rooms ?? []).map((room) => (
                      <tr key={room.id} className="border-t border-[color:var(--border-subtle)]">
                        <td className="py-1.5">
                          <span className="block text-[12.5px] font-semibold">{room.name}</span>
                          {room.purpose ? (
                            <span className="block text-[11px] text-[color:var(--text-muted)]">
                              {room.purpose}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs">{room.seats}</td>
                        <td className="py-1.5 font-mono text-xs text-[color:var(--text-muted)]">
                          {room.capacity == null
                            ? "No limit set"
                            : `${room.seats} of ${room.capacity}`}
                        </td>
                        <td
                          className={`py-1.5 text-xs ${
                            room.invigilator ? "" : "text-[color:var(--status-error-text)]"
                          }`}
                        >
                          {room.invigilator ?? "Nobody invigilating"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
                <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                  Access arrangements
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {plan ? `${plan.arrangements.length} candidates` : ""}
                </span>
              </h2>
              {(plan?.arrangements.length ?? 0) === 0 ? (
                <p className="py-3 text-sm text-[color:var(--text-muted)]">
                  Nobody in this series has an arrangement recorded. Extra time, a separate room
                  and a reader are all granted for a sitting and have to be re-granted for the
                  next one.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)]">
                  {(plan?.arrangements ?? []).map((arrangement) => (
                    <li key={arrangement.id} className="flex items-baseline gap-2 py-1.5">
                      <span className="w-[70px] shrink-0 font-mono text-xs">
                        {arrangement.candidate.candidateNumber ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {arrangement.candidate.name}
                      </span>
                      <span className="shrink-0 text-xs text-[color:var(--text-muted)]">
                        {arrangement.kind}
                        {arrangement.extraTimePercent
                          ? ` · ${arrangement.extraTimePercent}% extra`
                          : ""}
                      </span>
                      {arrangement.approved ? (
                        <Badge tone="success">Approved</Badge>
                      ) : (
                        <Badge tone="warn">Asked for</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
              <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                Where everyone sits
              </span>
              <span className="text-xs text-[color:var(--text-muted)]">
                {plan ? `${plan.seats.length} seated · ${plan.chips.stillToSeat} still to seat` : ""}
              </span>
            </h2>
            {plan && plan.chips.stillToSeat === 0 && plan.seats.length > 0 ? (
              <NothingLeftToDo
                title="Everybody in this sitting has a seat"
                body="The hall is numbered in candidate order, which is what an invigilator walks down with a list."
              />
            ) : null}
            {plan && plan.stillToSeat.length > 0 ? (
              <div className="space-y-1.5 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">
                    Still to seat — {plan.stillToSeat.length}
                  </p>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={seat.isPending || plan.rooms.length === 0}
                      onClick={() => seat.mutate(undefined)}
                    >
                      Seat all {plan.stillToSeat.length}
                    </Button>
                    {/* Renumbering is a deliberate act with a cost: a hall
                        already numbered in candidate order is one an
                        invigilator has walked with a list, and redoing it on
                        the morning loses that. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={seat.isPending || plan.seats.length === 0}
                      onClick={() => setRenumberOpen(true)}
                    >
                      Renumber the hall
                    </Button>
                  </span>
                </div>
                <p className="text-xs text-[color:var(--text-muted)]">
                  {plan.stillToSeat
                    .slice(0, 12)
                    .map((candidate) => `${candidate.candidateNumber ?? "—"} ${candidate.name}`)
                    .join(" · ")}
                  {plan.stillToSeat.length > 12 ? " …" : ""}
                </p>
              </div>
            ) : null}
            {plan && plan.seats.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-muted)]">
                    <th className="w-[80px] py-1 font-normal">Seat</th>
                    <th className="w-[90px] py-1 font-normal">Cand no</th>
                    <th className="py-1 font-normal">Candidate</th>
                    <th className="w-[200px] py-1 font-normal">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.seats.map((seatRow) => (
                    <tr key={seatRow.id} className="border-t border-[color:var(--border-subtle)]">
                      <td className="py-1.5 font-mono text-xs font-semibold">
                        {seatRow.seatNumber ?? "—"}
                      </td>
                      <td className="py-1.5 font-mono text-xs">
                        {seatRow.candidate.candidateNumber ?? "—"}
                      </td>
                      <td className="py-1.5">{seatRow.candidate.name}</td>
                      <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                        {plan.rooms.find((room) => room.id === seatRow.allocationId)?.name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </>
      )}

      <RenumberHallDialog
        open={renumberOpen}
        onOpenChange={setRenumberOpen}
        seats={plan?.seats.length ?? 0}
        isSaving={seat.isPending}
        onConfirm={() => {
          setRenumberOpen(false);
          seat.mutate(undefined);
        }}
      />

      <AllocateRoomDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        seriesId={seriesId}
        sessionId={plan?.session.id ?? null}
        onSaved={() => {
          setAllocateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams", "seating"] });
        }}
      />
    </SchoolsPage>
  );
}
