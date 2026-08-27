"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { PageBand } from "@/components/schools/common/page-band";
import { ClassFilter, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { RegisterFormDialog, type RegisterDraft } from "@/components/schools/attendance/register-form-dialog";

/**
 * Which registers have been taken.
 *
 * The administrator's question, and a different one from the teacher's. Taking a
 * register is a class teacher's job and lives in their portal; what an office
 * needs at 09:15 is the list of classes that have not sent one in, and the name
 * of the person to go and ask.
 *
 * Absence of a register is the signal, so the board is built from the class
 * ladder outward rather than from the sessions that exist — a view listing only
 * submitted registers cannot show the ones that are missing, which is the only
 * thing anyone opens it for. `/api/v2/schools/attendance/oversight` does that
 * reading in one query and hands back the ladder, the form teachers and the
 * school-day verdict together.
 *
 * The verb is the point of the screen. Before this the board could tell you
 * Form 1B had sent nothing and then left you to find Mrs Banda's number
 * yourself; now the row sends her the reminder, as a notice addressed to the
 * teachers of that class.
 *
 * ── Why the office can open a register at all ──────────────────────────────
 *
 * A register belongs to a class teacher, and nothing here changes that. But a
 * teacher who is off sick leaves a class with no register and nobody able to
 * open one, and the office ends up keeping the day on a piece of paper. So the
 * board can start a register on a class's behalf, correct the date on one that
 * was filed against the wrong day, and take back one that should never have
 * existed — created, edited and deleted from the row that named the gap.
 */

type RegisterRow = {
  classId: string;
  classCode: string;
  className: string;
  level: number | null;
  streams: Array<{ id: string; code: string; name: string }>;
  formTeacher: { profileId: string; userId: string; name: string } | null;
  sessions: number;
  state: "MISSING" | "DRAFT" | "SUBMITTED";
  present: number;
  marked: number;
  onRoll: number;
  lastActivityAt: string | null;
};

type RegisterBoard = {
  date: string;
  schoolDay: { isSchoolDay: boolean; reason: string } | null;
  rows: RegisterRow[];
  summary: {
    yearGroups: number;
    withRegister: number;
    missing: number;
    present: number;
    marked: number;
    onRoll: number;
  };
  week: Array<{ date: string; withRegister: number; yearGroups: number }>;
};

/** The stored session behind a row, which is what edit and delete act on. */
type StoredSession = {
  id: string;
  classId: string;
  streamId: string | null;
  attendanceDate: string;
  status: "DRAFT" | "SUBMITTED" | "LOCKED";
  notes?: string | null;
};

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const WEEK_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const STATES = [
  { value: "MISSING", label: "Missing" },
  { value: "DRAFT", label: "Started, not sent" },
  { value: "SUBMITTED", label: "Submitted" },
];

/** Counts under eleven read better as words in a sentence somebody says aloud. */
const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
function inWords(count: number) {
  return WORDS[count] ?? String(count);
}

function today() {
  // Local parts, not `toISOString()`, which would ask for yesterday's registers
  // in any timezone ahead of UTC.
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function stepDay(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function RegisterOversightContent({
  initialDate,
}: {
  /** From `?date=`, already validated as ISO by the page. Defaults to today. */
  initialDate?: string;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(initialDate ?? today());
  const [yearGroup, setYearGroup] = useState<ClassFilterValue>({
    classId: "",
    streamId: "",
  });
  /**
   * The stream, held apart from the year group rather than inside it.
   *
   * `ClassFilter` offers streams as indented options under their class and
   * encodes the pair into one selected value, which is the right shape where a
   * stream is only ever reached through its class. The canvas draws two
   * dropdowns here, so the stream is its own state: folding it back into the
   * `ClassFilterValue` would hand that control a `stream:…` value it has no
   * option for, and the Year group trigger would go blank the moment somebody
   * picked a stream.
   */
  const [streamId, setStreamId] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [reminded, setReminded] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<RegisterDraft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const classId = yearGroup.classId;

  const boardQuery = useQuery({
    queryKey: ["schools", "attendance", "board", date],
    queryFn: () =>
      fetchJson<RegisterBoard>(`/api/v2/schools/attendance/oversight?date=${date}`),
  });

  /**
   * The stored sessions for the same day, keyed by class.
   *
   * The board is the ladder and cannot carry a session id — it has rows for
   * classes that have no session at all. Edit and delete need the id, so it is
   * read alongside rather than folded into the board, which would make the
   * one query that answers "who has not sent one" depend on the rows that do.
   */
  const sessionsQuery = useQuery({
    queryKey: ["schools", "attendance", "sessions", date],
    queryFn: () =>
      fetchJson<{ data: StoredSession[] }>(
        `/api/v2/schools/attendance/sessions?dateFrom=${date}&dateTo=${date}&limit=200`,
      ),
  });

  const sessionByClass = useMemo(() => {
    const map = new Map<string, StoredSession>();
    for (const row of sessionsQuery.data?.data ?? []) {
      // First one wins: a class with a morning and an afternoon register is
      // edited from the morning, which is the one the office filed wrongly.
      if (!map.has(row.classId)) map.set(row.classId, row);
    }
    return map;
  }, [sessionsQuery.data]);

  /**
   * A reminder is a notice to the teachers of that class, not a new kind of
   * message. Same route, same audience resolution, so a teacher reads it in the
   * same place as everything else the office sends them.
   */
  const remind = useMutation({
    mutationFn: (row: RegisterRow) =>
      fetchJson<{ recipients: number }>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: `${row.className} register for ${date}`,
          body:
            row.state === "DRAFT"
              ? `The ${row.className} register for ${date} has been started but not sent. Please submit it so the office can close the morning off.`
              : `No register has come in for ${row.className} on ${date}. Please take it and send it through.`,
          audience: "TEACHERS",
          classId: row.classId,
          severity: "WARNING",
        }),
      }),
    onSuccess: (result, row) => {
      setReminded(
        `Reminder sent to ${result.recipients} ${result.recipients === 1 ? "person" : "people"} who teach ${row.className}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  const remindAll = useMutation({
    mutationFn: async (rows: RegisterRow[]) => {
      // One notice per class rather than one to every teacher in the school:
      // the point of the reminder is that it names the class it is about.
      const results = await Promise.all(
        rows.map((row) =>
          fetchJson<{ recipients: number }>("/api/v2/schools/notices", {
            method: "POST",
            body: JSON.stringify({
              title: `${row.className} register for ${date}`,
              body: `No register has come in for ${row.className} on ${date}. Please take it and send it through.`,
              audience: "TEACHERS",
              classId: row.classId,
              severity: "WARNING",
            }),
          }).catch(() => null),
        ),
      );
      return results.filter(Boolean).length;
    },
    onSuccess: (sent, rows) => {
      setReminded(
        sent === rows.length
          ? `Reminder sent for all ${inWords(sent)} year groups.`
          : `Reminder sent for ${sent} of ${rows.length} year groups. The rest have nobody teaching them yet.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "attendance"] });
  };

  const startRegister = useMutation({
    mutationFn: (draft: RegisterDraft) =>
      draft.sessionId
        ? // Editing moves the day the register was filed against; the class it
          // belongs to is not a thing an office corrects, it is a different
          // register.
          fetchJson<StoredSession>(
            `/api/v2/schools/attendance/sessions/${draft.sessionId}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                attendanceDate: draft.attendanceDate,
                notes: draft.notes.trim() || null,
              }),
            },
          )
        : fetchJson<StoredSession>("/api/v2/schools/attendance/sessions", {
            method: "POST",
            body: JSON.stringify({
              classId: draft.classId,
              streamId: draft.streamId || null,
              attendanceDate: draft.attendanceDate,
              ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
            }),
          }),
    onSuccess: (_result, draft) => {
      setDrafting(null);
      setSaved(
        draft.sessionId
          ? `The ${draft.className} register now sits on ${draft.attendanceDate}.`
          : `A register is open for ${draft.className} on ${draft.attendanceDate}. The class teacher marks it from their portal.`,
      );
      setDate(draft.attendanceDate);
      invalidate();
    },
  });

  const takeBack = useMutation({
    mutationFn: (session: StoredSession) =>
      fetchJson(`/api/v2/schools/attendance/sessions/${session.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setSaved("The register has been taken back. The class reads as missing again.");
      invalidate();
    },
  });

  const board = boardQuery.data ?? null;
  const rows = useMemo(() => board?.rows ?? [], [board]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (classId && row.classId !== classId) return false;
      if (streamId && !row.streams.some((stream) => stream.id === streamId)) return false;
      if (state && row.state !== state) return false;
      if (needle) {
        const haystack = `${row.className} ${row.classCode} ${row.formTeacher?.name ?? ""}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, classId, streamId, state, search]);

  /**
   * The streams a Stream filter can offer, read off the ladder itself.
   *
   * The canvas draws Year group and Stream as two dropdowns, not as one with
   * the streams indented under their class. That is the right shape here and
   * the wrong one on a roll: an office asking "has Green sent its register?" is
   * asking across every year group at once, and a control that makes them pick
   * Form 1 first cannot answer it.
   *
   * The list narrows to the chosen year group when there is one, because a
   * stream only exists inside its class and offering Form 4's streams while
   * Form 1 is selected offers a filter that can only return nothing. Streams
   * are deduplicated by name rather than by id — "Green" is one choice to an
   * administrator even though every year group has its own row for it.
   */
  const streams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (classId && row.classId !== classId) continue;
      for (const stream of row.streams) {
        if (!seen.has(stream.id)) seen.set(stream.id, stream.name);
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, classId]);

  const missing = useMemo(() => rows.filter((row) => row.state === "MISSING"), [rows]);
  const unchaseable = useMemo(
    () => missing.filter((row) => !row.formTeacher),
    [missing],
  );
  const expectRegisters = board?.schoolDay?.isSchoolDay !== false;
  const anyFilter = Boolean(classId || streamId || state || search);

  const copyMissing = async () => {
    const list = missing.map((row) => row.className).join(", ");
    try {
      await navigator.clipboard.writeText(list);
      setCopied("The missing list is on your clipboard.");
    } catch {
      // A clipboard that refuses — an insecure origin, a browser that asks
      // first — must say so rather than look like it worked.
      setCopied(`Your browser would not let the page copy. The list is: ${list}`);
    }
  };

  const columns = useMemo<ColumnDef<RegisterRow>[]>(
    () => [
      {
        id: "className",
        header: "Year group",
        cell: ({ row }) => (
          <Link
            href={`/schools/classes/${row.original.classId}`}
            className="font-semibold hover:underline"
          >
            {row.original.className}
          </Link>
        ),
      },
      {
        id: "register",
        header: "Register",
        cell: ({ row }) => {
          const record = row.original;
          if (record.sessions === 0) {
            return (
              <span className="text-[color:var(--text-muted)]">
                {expectRegisters ? "No register yet" : "School closed"}
              </span>
            );
          }
          const count = `${record.sessions} register${record.sessions === 1 ? "" : "s"}`;
          if (record.state === "DRAFT") {
            return <span className="text-[color:var(--text-muted)]">{count} · started, not sent</span>;
          }
          if (record.sessions > 1) {
            return (
              <span className="text-[color:var(--text-muted)]">
                {count} · morning and afternoon
              </span>
            );
          }
          return (
            <span className="text-[color:var(--text-muted)]">
              {count} · {record.present} of {record.onRoll || record.marked} present
            </span>
          );
        },
      },
      {
        id: "formTeacher",
        header: "Form teacher",
        cell: ({ row }) =>
          row.original.formTeacher ? (
            <span>{row.original.formTeacher.name}</span>
          ) : (
            <span className="text-[color:var(--text-muted)]">
              Unassigned — no form teacher
            </span>
          ),
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) => {
          const record = row.original;
          if (record.state === "MISSING") {
            return expectRegisters ? (
              <Badge tone="danger">Missing</Badge>
            ) : (
              <Badge tone="outline">Not expected</Badge>
            );
          }
          if (record.state === "DRAFT") return <Badge tone="warn">Draft</Badge>;
          return <Badge tone="success">Submitted</Badge>;
        },
      },
      {
        id: "verb",
        header: "",
        cell: ({ row }) => {
          const record = row.original;
          const session = sessionByClass.get(record.classId) ?? null;

          return (
            <div className="flex items-center justify-end gap-2">
              {record.state === "SUBMITTED" ? (
                <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                  {record.lastActivityAt ? CLOCK.format(new Date(record.lastActivityAt)) : "—"}
                </span>
              ) : null}
              <RecordActions
                resource="schools.attendance"
                verbs={[
                  ...(record.state === "SUBMITTED"
                    ? []
                    : [
                        {
                          label: record.state === "DRAFT" ? "Nudge" : "Remind",
                          action: "create" as const,
                          tone: "default" as const,
                          loading:
                            remind.isPending && remind.variables?.classId === record.classId,
                          unavailable: record.formTeacher
                            ? undefined
                            : "Nobody teaches this year group yet, so there is nobody to remind.",
                          onSelect: () => {
                            setReminded(null);
                            remind.mutate(record);
                          },
                        },
                      ]),
                  ...(record.state === "MISSING"
                    ? [
                        {
                          // Create, from the row that named the gap. The office
                          // opens the register; the marks are still the class
                          // teacher's, taken from their own portal.
                          label: "Open a register",
                          action: "create" as const,
                          onSelect: () => {
                            setSaved(null);
                            startRegister.reset();
                            setDrafting({
                              classId: record.classId,
                              className: record.className,
                              streamId: "",
                              streams: record.streams,
                              attendanceDate: date,
                              notes: "",
                            });
                          },
                        },
                      ]
                    : [
                        {
                          label: "Edit the day",
                          action: "edit" as const,
                          unavailable: session
                            ? session.status === "LOCKED"
                              ? "This register has been locked. A locked day is the school's record and cannot be moved."
                              : undefined
                            : "The register for this class was filed under another day.",
                          onSelect: () => {
                            setSaved(null);
                            startRegister.reset();
                            setDrafting({
                              classId: record.classId,
                              className: record.className,
                              streamId: session?.streamId ?? "",
                              streams: record.streams,
                              attendanceDate: date,
                              notes: session?.notes ?? "",
                              sessionId: session?.id,
                            });
                          },
                        },
                        {
                          label: "Take it back",
                          action: "archive" as const,
                          tone: "danger" as const,
                          loading:
                            takeBack.isPending &&
                            takeBack.variables?.classId === record.classId,
                          unavailable: session
                            ? session.status === "LOCKED"
                              ? "This register has been locked and is the school's record for the day."
                              : undefined
                            : "The register for this class was filed under another day.",
                          confirm: {
                            title: `Take back the ${record.className} register`,
                            description: `Every mark on it for ${date} goes with it, and ${record.className} reads as missing again. The class teacher has to take the register afresh.`,
                            confirmLabel: "Take it back",
                          },
                          onSelect: () => {
                            if (session) takeBack.mutate(session);
                          },
                        },
                      ]),
                ]}
              />
            </div>
          );
        },
      },
    ],
    [expectRegisters, remind, takeBack, startRegister, sessionByClass, date],
  );

  if (boardQuery.error) {
    return (
      <LoadError
        what="the register board"
        error={boardQuery.error}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <PageChrome title="Attendance">
        <CreateButton
          resource="schools.attendance"
          label="Open a register"
          onSelect={() => {
            setSaved(null);
            startRegister.reset();
            setDrafting({
              classId: "",
              className: "",
              streamId: "",
              streams: [],
              attendanceDate: date,
              notes: "",
            });
          }}
        />
      </PageChrome>

      <PageBand
        chips={[
          {
            label: "Registers in",
            value: board ? `${board.summary.withRegister} of ${board.summary.yearGroups}` : "—",
            tone: board && board.summary.missing > 0 ? "warn" : "success",
          },
          {
            label: "Still to come",
            value: board ? board.summary.missing : "—",
            tone: board && board.summary.missing > 0 ? "danger" : "success",
          },
          { label: "Present", value: board ? board.summary.present.toLocaleString() : "—" },
        ]}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDate(stepDay(date, -1))}>
              Yesterday
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={missing.length === 0}
              title={missing.length === 0 ? "Every register is in." : undefined}
              onClick={() => void copyMissing()}
            >
              Copy the missing list
            </Button>
          </>
        }
      />

      {copied ? (
        <Alert tone="info" title="The missing list" onDismiss={() => setCopied(null)}>
          {copied}
        </Alert>
      ) : null}
      {reminded ? (
        <Alert tone="success" title="Reminder sent" onDismiss={() => setReminded(null)}>
          {reminded}
        </Alert>
      ) : null}
      {saved ? (
        <Alert tone="success" title="Saved" onDismiss={() => setSaved(null)}>
          {saved}
        </Alert>
      ) : null}
      {remind.error ? <SaveError what="The reminder" error={remind.error} /> : null}
      {remindAll.error ? <SaveError what="The reminders" error={remindAll.error} /> : null}
      {takeBack.error ? <SaveError what="The register" error={takeBack.error} /> : null}

      {board && !expectRegisters ? (
        <Alert
          tone="info"
          title={`Not a school day — ${board.schoolDay?.reason ?? "the school was closed"}`}
        >
          No registers are expected. Anything below was taken anyway.
        </Alert>
      ) : missing.length > 0 ? (
        <Alert
          tone="danger"
          title={`${missing.length} still to come in`}
          actions={
            <Button
              variant="secondary"
              size="sm"
              loading={remindAll.isPending}
              onClick={() => {
                setReminded(null);
                remindAll.mutate(missing.filter((row) => row.formTeacher));
              }}
              disabled={unchaseable.length === missing.length}
              title={
                unchaseable.length === missing.length
                  ? "None of them has a form teacher, so there is nobody to remind."
                  : undefined
              }
            >
              {missing.length === 1
                ? "Send a reminder"
                : `Send all ${inWords(missing.length)} a reminder`}
            </Button>
          }
        >
          {missing.map((row) => row.className).join(", ")}
        </Alert>
      ) : null}

      {board && expectRegisters ? (
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {board.summary.withRegister} of {board.summary.yearGroups} year groups have a
          register for {date}.
        </p>
      ) : null}

      {/*
        The date, the year group, the stream, the state and the search box all
        narrow the ladder underneath them and nothing else, so they are one row
        directly above it. The band keeps the counts, which do not move when a
        filter does.
      */}
      <TableControls
        search={
          <TableSearch
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search a year group"
          />
        }
        filters={
          <>
            <div className="min-w-0 flex-1 basis-[180px] sm:max-w-[200px]">
              <Label htmlFor="oversight-date" className="text-sm text-muted-foreground">
                Date
              </Label>
              <Input
                id="oversight-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <ClassFilter
              label="Year group"
              allLabel="Every year group"
              includeStreams={false}
              value={yearGroup}
              onChange={(next) => {
                setYearGroup(next);
                // A stream belongs to one class, so a stream chosen under the
                // old year group can only return nothing under the new one.
                setStreamId("");
              }}
            />
            <FilterSelect
              label="Stream"
              allLabel="Every stream"
              value={streamId}
              options={streams}
              onChange={setStreamId}
            />
            <FilterSelect
              label="State"
              allLabel="Anything"
              value={state}
              options={STATES}
              onChange={setState}
            />
          </>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          flush
          title="Year groups"
          subtitle={`${rows.length} on the ladder`}
        >
          {boardQuery.isPending ? (
            <TableRowsSkeleton
              rows={8}
              columns={[{ width: 120 }, {}, { width: 160 }, { width: 90 }, { width: 80 }]}
            />
          ) : (
            <DataTable
              data={filtered}
              columns={columns}
              pagination={{ enabled: true }}
              emptyState={
                rows.length === 0 ? (
                  <NothingYet
                    title="No year groups yet"
                    body="Registers are taken against a class, so the ladder fills once classes exist."
                    action={
                      <Button asChild variant="secondary">
                        <Link href="/schools/classes">Open classes</Link>
                      </Button>
                    }
                  />
                ) : (
                  <NothingMatched
                    what="year groups"
                    filters={[
                      classId ? rows.find((row) => row.classId === classId)?.className : null,
                      streamId
                        ? streams.find((row) => row.value === streamId)?.label
                        : null,
                      state ? STATES.find((row) => row.value === state)?.label : null,
                      search.trim() || null,
                    ].filter((value): value is string => Boolean(value))}
                    onClear={
                      anyFilter
                        ? () => {
                            setYearGroup({ classId: "", streamId: "" });
                            setStreamId("");
                            setState("");
                            setSearch("");
                          }
                        : undefined
                    }
                  />
                )
              }
            />
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="The week" flush>
            <div className="divide-y divide-[color:var(--border-subtle)]">
              {(board?.week ?? []).map((entry) => {
                const future = entry.date > today();
                return (
                  <button
                    key={entry.date}
                    type="button"
                    onClick={() => setDate(entry.date)}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-[color:var(--surface-muted)]"
                  >
                    <span className="text-[length:var(--type-body-sm)]">
                      {WEEK_DAY.format(new Date(`${entry.date}T00:00:00.000Z`))}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums">
                      {future || entry.withRegister === 0
                        ? "—"
                        : `${entry.withRegister} of ${entry.yearGroups}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/*
            The calendar is checked before the classes are counted. Without it a
            public holiday reads as every class failing to send a register,
            which is the wrong thing to chase — so the board says so when the
            day was closed, and says why here when it was not.
          */}
          <Card title="When the school was closed">
            {board && !expectRegisters ? (
              <Alert
                tone="info"
                title={`Not a school day — ${board.schoolDay?.reason ?? "the school was closed"}`}
              >
                No registers are expected. Anything above was taken anyway.
              </Alert>
            ) : (
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                {date} is a school day, so every year group is expected to send a
                register.
              </p>
            )}
            <p className="mt-2 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              The school calendar is read before the classes are counted, so a public
              holiday does not read as every class failing to send one in.
            </p>
          </Card>

          {unchaseable.length > 0 ? (
            <Card title="Nobody to chase">
              <p className="text-[length:var(--type-body-sm)]">
                {/*
                  One sentence naming the class, the way the canvas writes it,
                  rather than a list followed by a full stop. One name is the
                  common case and it is the one somebody acts on.
                */}
                {unchaseable.map((row) => row.className).join(", ")}{" "}
                {unchaseable.length === 1 ? "has" : "have"} no form teacher
              </p>
              <p className="mt-2 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                A missing register with nobody attached to it cannot be chased. Assign a
                form teacher under Classes.
              </p>
              <div className="mt-3">
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/schools/classes/${unchaseable[0].classId}`}>
                    Open {unchaseable[0].className}
                  </Link>
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {drafting ? (
        <RegisterFormDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setDrafting(null);
              startRegister.reset();
            }
          }}
          draft={drafting}
          isSubmitting={startRegister.isPending}
          error={startRegister.error}
          onSubmit={(next) => startRegister.mutate(next)}
        />
      ) : null}
    </div>
  );
}
