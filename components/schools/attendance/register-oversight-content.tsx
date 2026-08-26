"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";

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
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [state, setState] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [reminded, setReminded] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["schools", "attendance", "board", date],
    queryFn: () =>
      fetchJson<RegisterBoard>(`/api/v2/schools/attendance/oversight?date=${date}`),
  });

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

  const board = boardQuery.data ?? null;
  const rows = useMemo(() => board?.rows ?? [], [board]);

  const streams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (classId && row.classId !== classId) continue;
      for (const stream of row.streams) seen.set(stream.id, stream.name);
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows, classId]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (classId && row.classId !== classId) return false;
        if (streamId && !row.streams.some((stream) => stream.id === streamId)) return false;
        if (state && row.state !== state) return false;
        return true;
      }),
    [rows, classId, streamId, state],
  );

  const missing = useMemo(() => rows.filter((row) => row.state === "MISSING"), [rows]);
  const unchaseable = useMemo(
    () => missing.filter((row) => !row.formTeacher),
    [missing],
  );
  const expectRegisters = board?.schoolDay?.isSchoolDay !== false;
  const anyFilter = Boolean(classId || streamId || state);

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
          if (record.state === "SUBMITTED") {
            return (
              <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                {record.lastActivityAt ? CLOCK.format(new Date(record.lastActivityAt)) : "—"}
              </span>
            );
          }
          return (
            <RecordActions
              resource="schools.reports"
              verbs={[
                {
                  label: record.state === "DRAFT" ? "Nudge" : "Remind",
                  action: "create",
                  tone: "default",
                  loading: remind.isPending && remind.variables?.classId === record.classId,
                  unavailable: record.formTeacher
                    ? undefined
                    : "Nobody teaches this year group yet, so there is nobody to remind.",
                  onSelect: () => {
                    setReminded(null);
                    remind.mutate(record);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [expectRegisters, remind],
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

      <FilterBar>
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
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classId}
          options={rows.map((row) => ({ value: row.classId, label: row.className }))}
          onChange={(value) => {
            setClassId(value);
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
      </FilterBar>

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
      {remind.error ? <SaveError what="The reminder" error={remind.error} /> : null}
      {remindAll.error ? <SaveError what="The reminders" error={remindAll.error} /> : null}

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
          title={`${inWords(missing.length)} still to come in`}
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
              searchPlaceholder="Search a year group"
              searchSubmitLabel="Search"
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
                      streamId ? streams.find((row) => row.value === streamId)?.label : null,
                      state ? STATES.find((row) => row.value === state)?.label : null,
                    ].filter((value): value is string => Boolean(value))}
                    onClear={
                      anyFilter
                        ? () => {
                            setClassId("");
                            setStreamId("");
                            setState("");
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

          {unchaseable.length > 0 ? (
            <Card title="Nobody to chase">
              <p className="text-[length:var(--type-body-sm)]">
                {unchaseable.map((row) => row.className).join(", ")}{" "}
                {unchaseable.length === 1 ? "has" : "have"} no form teacher.
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
    </div>
  );
}
