"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, MobileList } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { Home, LocalShipping, Printer } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import {
  fetchDetentionRegister,
  fetchDetentionSessions,
  markDetention,
  type RegisterRow,
} from "@/lib/schools/conduct-v2";
import { formatSchoolDate, formatSchoolDayTime } from "@/lib/schools/format";
import { DetentionSessionDialog } from "@/components/schools/conduct/detention-session-dialog";

/**
 * The detention register.
 *
 * Farai Moyo, English teacher, at 14:03 on Friday standing in Room 12 with a
 * phone, marking twelve names while the R2 bus idles outside. He is the only
 * classroom teacher this page is drawn for, and it is drawn for a person
 * standing up: the decision is in the row, where his thumb is.
 *
 * Two rules the screen enforces rather than explains:
 *
 *   - a **moved** row carries no `Here` button. You cannot mark somebody
 *     present at a session they are not serving, and the refusal is the absence
 *     of the verb rather than a sentence after the tap.
 *   - `Did not turn up` **does not** decrement what is owed. That is the whole
 *     reason `Still to serve` is a column on this register, totalled at its
 *     foot, and not a second list of the same names.
 */

function GetsHomeCell({ row }: { row: RegisterRow }) {
  const getsHome = row.getsHome;
  if (getsHome.kind === "boarder") {
    return (
      <span className="flex items-center gap-1.5 text-sm">
        <Home className="size-4 text-[color:var(--text-muted)]" aria-hidden="true" />
        Boarder
      </span>
    );
  }
  if (getsHome.kind === "bus") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-[color:var(--tone-warn)]">
        <LocalShipping className="size-4" aria-hidden="true" />
        {getsHome.label}
      </span>
    );
  }
  return <span className="text-sm text-[color:var(--text-muted)]">Day</span>;
}

export function ConductDetentionContent() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  // Everybody by default, including the pupils serving somewhere else: a
  // supervisor reading the register needs to see that a name was moved rather
  // than find it missing. `Not marked` is the cut he presses when he is halfway
  // down the room and wants only what is still owed to him.
  const [view, setView] = useState<"all" | "unmarked">("all");
  const [servingFilter, setServingFilter] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [onlyTwo, setOnlyTwo] = useState<string[] | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["schools", "conduct", "detention", "sessions"],
    queryFn: () => fetchDetentionSessions({ limit: 40 }),
  });

  const sessions = useMemo(() => sessionsQuery.data?.rows ?? [], [sessionsQuery.data]);
  // One clock for the whole render, hoisted the way `waitingFor` in
  // `sheet-state.tsx` takes its `now`: a component that read the clock inside a
  // memo would read a different one on the server than in the browser and tear
  // hydration, and a list of forty rows would read it forty times.
  const [now] = useState(() => Date.now());
  // The session in the filter, defaulting to the next one that has not
  // finished — which at 14:03 on a Friday is today's.
  const activeSessionId = useMemo(() => {
    if (sessionId) return sessionId;
    const upcoming = sessions.find((session) => new Date(session.endsAt).getTime() >= now);
    return upcoming?.id ?? sessions[0]?.id ?? "";
  }, [sessionId, sessions, now]);

  const registerQuery = useQuery({
    queryKey: ["schools", "conduct", "detention", "register", activeSessionId],
    queryFn: () => fetchDetentionRegister(activeSessionId),
    enabled: Boolean(activeSessionId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "conduct", "detention"] });
  };

  const mark = useMutation({
    mutationFn: (input: Parameters<typeof markDetention>[1]) =>
      markDetention(activeSessionId, input),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const register = registerQuery.data;
  const markDenial = register?.markDenial ?? null;

  const rows = useMemo(() => {
    let list = register?.rows ?? [];
    if (view === "unmarked") list = list.filter((row) => row.state === "NOT_MARKED");
    if (onlyTwo) list = list.filter((row) => onlyTwo.includes(row.student.id));
    // Compared against the chosen class and stream by id. Matching on "has any
    // class at all" reported an active filter and narrowed nothing, which is
    // worse than no filter: a reader trusts a control that says it is on.
    //
    // Narrowed here rather than in the request because a register is one
    // session's worth of rows and they are already in hand.
    if (classValue.classId) {
      list = list.filter((row) => row.student.classId === classValue.classId);
    }
    if (classValue.streamId) {
      list = list.filter((row) => row.student.streamId === classValue.streamId);
    }
    if (servingFilter) {
      list = list.filter((row) =>
        row.servingFor.toLowerCase().startsWith(servingFilter.toLowerCase()),
      );
    }
    return list;
  }, [register, view, onlyTwo, servingFilter, classValue.classId, classValue.streamId]);

  const servingOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of register?.rows ?? []) {
      names.add(row.servingFor.split(" — ")[0]);
    }
    return [...names].map((name) => ({ value: name, label: name }));
  }, [register]);

  const columns = useMemo<ColumnDef<RegisterRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "year",
        header: "Year",
        cell: ({ row }) => (
          <RecordCell
            value={
              [row.original.student.className, row.original.student.streamName]
                .filter(Boolean)
                .join(" ") || null
            }
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "servingFor",
        header: "Serving for",
        cell: ({ row }) => (
          <span className="block truncate text-sm">{row.original.servingFor}</span>
        ),
      },
      {
        id: "session",
        header: "Session",
        // Amber from the second one on: a pupil serving their second or third
        // Friday is a different conversation from one serving their first.
        cell: ({ row }) => (
          <span
            className={`font-mono text-xs ${
              row.original.session.index >= 2
                ? "text-[color:var(--tone-warn)]"
                : "text-[color:var(--text-body)]"
            }`}
          >
            {row.original.session.index} of {row.original.session.owed}
          </span>
        ),
      },
      {
        id: "getsHome",
        header: "Gets home",
        // The column the alert depends on. Without it the bus exception reads
        // as arbitrary; with it, a reader can see who 14:00 costs nothing.
        cell: ({ row }) => <GetsHomeCell row={row.original} />,
      },
      {
        id: "register",
        header: "Register",
        cell: ({ row }) => {
          const entry = row.original;
          if (entry.state === "HERE") {
            return (
              <span className="flex items-center gap-2">
                <Badge tone="success">Here</Badge>
                <span className="font-mono text-xs text-[color:var(--text-muted)]">
                  {entry.markedAt ? formatSchoolDayTime(entry.markedAt).split(" ").pop() : ""}
                </span>
              </span>
            );
          }
          if (entry.state === "MOVED") {
            return (
              <span className="flex items-center gap-2">
                <Badge tone="warn">
                  Moved to {entry.movedTo ? formatSchoolDate(entry.movedTo.startsAt).split(" ")[0] : "another session"}
                </Badge>
                <span className="font-mono text-xs text-[color:var(--text-muted)]">
                  {entry.movedTo ? formatSchoolDayTime(entry.movedTo.startsAt).split(" ").pop() : ""}
                </span>
              </span>
            );
          }
          if (entry.state === "DID_NOT_TURN_UP") {
            return <Badge tone="danger">Did not turn up</Badge>;
          }
          return (
            <span className="flex items-center gap-2">
              <Badge tone="warn">Not marked</Badge>
              <RecordActions
                layout="inline"
                size="sm"
                resource="schools.conduct"
                verbs={[
                  {
                    label: "Here",
                    action: "mark",
                    loading: mark.isPending,
                    unavailable: markDenial ?? undefined,
                    onSelect: () =>
                      mark.mutate({ attendanceId: entry.attendanceId, state: "HERE" }),
                  },
                  {
                    label: "Did not turn up",
                    action: "mark",
                    loading: mark.isPending,
                    unavailable: markDenial ?? undefined,
                    onSelect: () =>
                      mark.mutate({
                        attendanceId: entry.attendanceId,
                        state: "DID_NOT_TURN_UP",
                      }),
                  },
                ]}
              />
            </span>
          );
        },
      },
      {
        id: "stillToServe",
        header: "Still to serve",
        cell: ({ row }) => {
          const left = row.original.stillToServe;
          if (left.sessions <= 0) {
            return <span className="text-sm text-[color:var(--text-faint)]">—</span>;
          }
          return (
            <span className="text-sm text-[color:var(--tone-warn)]">
              {left.sessions} more
              {left.nextAt ? ` · ${formatSchoolDate(left.nextAt)}` : ""}
            </span>
          );
        },
      },
    ],
    [mark, markDenial],
  );

  const activeSession = register?.session ?? sessions.find((entry) => entry.id === activeSessionId);
  const chips = register?.chips;

  // Named for where they went rather than for the fact that they went: `Moved
  // to Saturday` tells a supervisor which register to look at, and `Moved
  // elsewhere` tells him to go and find out. Read at the foot of the register,
  // beside the count of who was actually here.
  const movedLabel = useMemo(() => {
    const moved = (register?.rows ?? []).filter((row) => row.state === "MOVED" && row.movedTo);
    const days = new Set(
      moved.map((row) =>
        new Date(row.movedTo!.startsAt).toLocaleDateString(undefined, { weekday: "long" }),
      ),
    );
    return days.size === 1 ? `Moved to ${[...days][0]}` : "Moved elsewhere";
  }, [register]);

  return (
    <SchoolsPage>
      <PageChrome title="Detention">
        <RecordActions
          layout="inline"
          resource="schools.conduct"
          verbs={[
            {
              label: "Take the register",
              action: "mark",
              unavailable: markDenial ?? undefined,
              onSelect: () => {
                const firstUnmarked = document.querySelector<HTMLElement>(
                  "[data-detention-first-unmarked]",
                );
                firstUnmarked?.scrollIntoView({ behavior: "smooth", block: "center" });
              },
            },
          ]}
        />
      </PageChrome>

      {/* Which session, where, and who is supervising. It changes with the
          filter, which is what a caption is for. */}
      {activeSession ? (
        <PageCaption>
          {[
            formatSchoolDate(activeSession.startsAt),
            formatSchoolDayTime(activeSession.startsAt).split(" ").pop(),
            activeSession.room?.name,
            activeSession.supervisor?.name ?? "Not yet supervised",
          ]
            .filter(Boolean)
            .join(" · ")}
        </PageCaption>
      ) : null}

      {actionError ? <SaveError what="That mark" error={actionError} /> : null}

      {/* Data-dependent, and absent until the conflict is known — it must not
          render a skeleton of itself. It sits at the top because it is the fact
          that changes what the supervisor does in the next seven minutes. */}
      {register?.busConflict ? (
        <Alert
          tone="warn"
          title={`The ${register.busConflict.routeCode} leaves before this ends — ${register.busConflict.students
            .map((student) => `${student.firstName} ${student.lastName}`)
            .join(" and ")} ${register.busConflict.students.length === 1 ? "serves" : "serve"} another session instead.`}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setOnlyTwo(
                  onlyTwo ? null : register.busConflict!.students.map((student) => student.id),
                )
              }
            >
              {onlyTwo ? "Show everybody" : `See the ${register.busConflict.students.length}`}
            </Button>
          }
        />
      ) : null}

      {sessionsQuery.error ? (
        <LoadError
          what="the detention sessions"
          error={sessionsQuery.error}
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : sessions.length === 0 && !sessionsQuery.isPending ? (
        <NothingYet
          title="No detention has been scheduled"
          body="A session is a time, a room and somebody standing at the front. Schedule one and the pupils who owe it appear here."
          action={
            <Button onClick={() => setScheduleOpen(true)}>Schedule a session</Button>
          }
        />
      ) : (
        <>
          <section className="space-y-2">
          {/* No count beside the name of the section: how many are named is the
              tab's number and the control row's, and it moves when the filters
              move, which a heading does not. */}
          <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
            Who is due
          </h2>
          <TableControls
            sticky
            tabs={
              <PopulationTabs<"all" | "unmarked">
                value={view}
                onChange={setView}
                tabs={[
                  {
                    id: "all",
                    label: "Everybody",
                    count: registerQuery.isPending ? undefined : register?.rows.length,
                  },
                  {
                    id: "unmarked",
                    label: "Not marked",
                    count: registerQuery.isPending ? undefined : chips?.notMarked,
                  },
                ]}
              />
            }
            filterCount={activeFilterCount(servingFilter, classValue.classId)}
            count={
              registerQuery.isPending
                ? null
                : `${rows.length} of ${register?.rows.length ?? 0} named`
            }
            actions={
              <>
                <RecordActions
                  layout="inline"
                  size="sm"
                  resource="schools.conduct"
                  verbs={[
                    {
                      label: "Mark everyone here",
                      action: "mark",
                      loading: mark.isPending,
                      unavailable: markDenial ?? undefined,
                      confirm: {
                        title: "Mark everybody who is still unmarked as here",
                        description:
                          "It skips anybody serving another session. Nobody who has already been marked changes.",
                        confirmLabel: "Mark them here",
                      },
                      onSelect: () => mark.mutate({ everyoneHere: true }),
                    },
                  ]}
                />
                {/* Printing acts on the table underneath, not on the page: the
                    supervisor who wants paper wants these rows, narrowed the way
                    he just narrowed them. */}
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer className="size-4" />
                  Print the list
                </Button>
              </>
            }
            filters={
              <>
                <FilterSelect
                  label="Session"
                  allLabel="The next session"
                  value={sessionId}
                  options={sessions.map((session) => ({
                    value: session.id,
                    label: [
                      formatSchoolDate(session.startsAt),
                      formatSchoolDayTime(session.startsAt).split(" ").pop(),
                      session.room?.name,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  onChange={(next) => {
                    setSessionId(next);
                    setOnlyTwo(null);
                  }}
                />
                <ClassFilter
                  label="Year group"
                  allLabel="Every year group"
                  value={classValue}
                  onChange={setClassValue}
                />
                <FilterSelect
                  label="Serving for"
                  allLabel="Anything"
                  value={servingFilter}
                  options={servingOptions}
                  onChange={setServingFilter}
                />
              </>
            }
          />

          <DataTable
            data={rows}
            columns={columns}
            features={{ sorting: false, globalFilter: false, pagination: false }}
            mobileListRenderer={({ rows: mobileRows }) => (
              <MobileList>
                {mobileRows.map(({ row }) => (
                  <MobileList.Row
                    key={row.attendanceId}
                    leading={
                      <RecordMark
                        kind="student"
                        name={`${row.student.firstName} ${row.student.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.student.lastName}, ${row.student.firstName}`}
                    subtitle={[
                      row.servingFor,
                      `${row.session.index} of ${row.session.owed}`,
                      row.getsHome.label,
                    ].join(" · ")}
                    trailing={
                      row.state === "NOT_MARKED" && !markDenial ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            mark.mutate({ attendanceId: row.attendanceId, state: "HERE" })
                          }
                        >
                          Here
                        </Button>
                      ) : (
                        <Badge
                          tone={
                            row.state === "HERE"
                              ? "success"
                              : row.state === "MOVED"
                                ? "warn"
                                : row.state === "DID_NOT_TURN_UP"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {row.state === "HERE"
                            ? "Here"
                            : row.state === "MOVED"
                              ? "Moved"
                              : row.state === "DID_NOT_TURN_UP"
                                ? "Did not turn up"
                                : "Not marked"}
                        </Badge>
                      )
                    }
                  />
                ))}
              </MobileList>
            )}
            emptyState={
              registerQuery.isPending ? (
                <TableRowsSkeleton
                  rows={8}
                  headers={[
                    "Pupil",
                    "Year",
                    "Serving for",
                    "Session",
                    "Gets home",
                    "Register",
                    "Still to serve",
                  ]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 58 },
                    {},
                    { width: 72 },
                    { width: 96 },
                    { width: 186, badge: true },
                    { width: 162, badge: true },
                  ]}
                />
              ) : servingFilter || onlyTwo ? (
                <NothingMatched
                  what="pupils"
                  filters={[servingFilter, onlyTwo ? "the bus pupils" : null].filter(
                    (entry): entry is string => Boolean(entry),
                  )}
                  onClear={() => {
                    setServingFilter("");
                    setOnlyTwo(null);
                  }}
                />
              ) : (chips?.notMarked ?? 0) === 0 && (register?.rows.length ?? 0) > 0 ? (
                // The state Farai Moyo is trying to reach at 14:06.
                <NothingLeftToDo
                  title="Everybody due today has been marked"
                  body="Nothing is waiting on you."
                />
              ) : (
                <NothingYet
                  title="Nobody is named on this session"
                  body="Award a detention from an incident and the pupil appears on the register they are serving."
                />
              )
            }
          />

          {/* The foot of the register: how today went, and what is owed after
              it. Both are totals of the rows above rather than a second list of
              the same eleven names, and both are read here rather than in a
              strip over the table — the numbers mean nothing without the rows
              they are counting. */}
          {register ? (
            <div className="space-y-1 border-t-2 border-[color:var(--border)] px-1 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[color:var(--text-strong)]">
                  Marked here
                </span>
                <span className="font-mono text-xs">
                  <span className="text-[color:var(--tone-success)]">
                    {chips?.here ?? 0} of {chips?.dueHere ?? 0} due
                  </span>
                  {(chips?.movedAway ?? 0) > 0 ? (
                    <span className="text-[color:var(--tone-warn)]">
                      {" · "}
                      {chips?.movedAway} {movedLabel.toLowerCase()}
                    </span>
                  ) : null}
                </span>
              </div>
              {register.stillToServeAfterToday.sessions > 0 ? (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[color:var(--text-strong)]">
                    Still to serve after today
                  </span>
                  <span className="font-mono text-xs text-[color:var(--tone-warn)]">
                    {register.stillToServeAfterToday.sessions}{" "}
                    {register.stillToServeAfterToday.sessions === 1 ? "session" : "sessions"}{" "}
                    · {register.stillToServeAfterToday.pupils}{" "}
                    {register.stillToServeAfterToday.pupils === 1 ? "pupil" : "pupils"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          </section>

          <section className="mt-6 space-y-2">
            {/* The button is beside the heading, not inside it. Scheduling is
                something you do, and a verb read out as part of a section's
                name — "The coming sessions Schedule a session" — is a verb
                nobody hears. */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-1.5">
              <h2 className="text-sm font-semibold text-[color:var(--text-strong)]">
                The coming sessions
              </h2>
              <Button variant="secondary" size="sm" onClick={() => setScheduleOpen(true)}>
                Schedule a session
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[130px] py-1 font-normal">When</th>
                  <th className="w-[160px] py-1 font-normal">Where</th>
                  <th className="py-1 font-normal">Supervised by</th>
                  <th className="w-[80px] py-1 text-right font-normal">Named</th>
                  <th className="w-[190px] py-1 text-right font-normal">
                    <span className="sr-only">Standing</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5 font-mono text-xs font-bold text-[color:var(--text-strong)]">
                      {formatSchoolDayTime(session.startsAt)}
                    </td>
                    <td className="py-1.5">{session.room?.name ?? "—"}</td>
                    <td
                      className={`py-1.5 ${
                        session.needsSupervisor ? "text-[color:var(--status-error-text)]" : ""
                      }`}
                    >
                      {session.supervisor?.name ?? "Not yet supervised"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {session.named}
                    </td>
                    <td className="py-1.5 text-right">
                      {session.needsSupervisor ? (
                        <Badge tone="danger">Needs a supervisor</Badge>
                      ) : session.movedHere > 0 ? (
                        <Badge tone="warn">Moved here from another session</Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {sessions.length > 0 ? (
                  <tr className="border-t-2 border-[color:var(--border)]">
                    <td className="py-1.5 text-xs font-semibold" colSpan={3}>
                      {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs font-bold">
                      {sessions.reduce((total, session) => total + session.named, 0)}
                    </td>
                    <td />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      )}

      <DetentionSessionDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSaved={() => {
          setScheduleOpen(false);
          invalidate();
        }}
      />
    </SchoolsPage>
  );
}
