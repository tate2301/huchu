"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
} from "@corelithzw/react";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { useOfflineConnectivity } from "@/hooks/use-offline-connectivity";
import { fetchJson } from "@/lib/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

type Mark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type Row = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  isBoarding: boolean;
  status: Mark | null;
  remarks: string | null;
};

type Register = {
  classSubject: {
    id: string;
    termId: string;
    classId: string;
    className: string;
    streamId: string | null;
    streamName: string | null;
    subjectName: string;
    termName: string;
  };
  onDate: string;
  session: { id: string; status: string; notes: string | null } | null;
  rows: Row[];
};

const MARKS: Array<{ value: Mark; label: string }> = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
];

/** The narrowing above the roll, in the words a teacher would use for it. */
const SHOWING = [
  { value: "ALL", label: "Everyone" },
  { value: "UNMARKED", label: "Not marked" },
  { value: "AWAY", label: "Not present" },
] as const;

type Showing = (typeof SHOWING)[number]["value"];

/**
 * Taking the register.
 *
 * The demo's shape, and the right one: a counter that moves as you mark, one
 * quick action to say "everybody is here" because that is the true answer most
 * days, then a row per child that a teacher works down. Marking is a single
 * tap, not a dropdown, because it happens standing up with a class waiting.
 *
 * Unmarked is its own state rather than being silently treated as present.
 * "Mark everyone present" is a claim a teacher makes deliberately, and the
 * save summary says how many are still unanswered before it is made.
 */
export function TeacherRegisterScreen() {
  const queryClient = useQueryClient();
  const { selectedClass } = useTeacherPortal();
  const { isOffline } = useOfflineConnectivity();
  /**
   * Empty means "the school's today", which the server decides.
   *
   * An earlier version seeded this from `new Date()` during render. The server
   * renders in UTC and the tablet does not, so the two disagreed about the
   * date and React threw away the whole subtree on hydration — the screen came
   * back blank. Whose "today" it is was also the wrong question: a school day
   * belongs to the school, not to the device in the room.
   */
  const [onDate, setOnDate] = useState("");
  const [edits, setEdits] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * Thirty names on a phone is four screens of scrolling. Searching for the
   * one child who walked in late beats thumbing past everybody else, and
   * "Not marked" is the question a teacher asks the roll right before saving.
   */
  const [search, setSearch] = useState("");
  const [showing, setShowing] = useState<Showing>("ALL");

  const classSubjectId = selectedClass?.classSubjectId ?? null;

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "register", classSubjectId, onDate],
    queryFn: () =>
      fetchJson<Register>(
        `/api/v2/schools/portal/teacher/me/register?classSubjectId=${classSubjectId}${
          onDate ? `&onDate=${onDate}` : ""
        }`,
      ),
    enabled: Boolean(classSubjectId),
  });

  const register = query.data ?? null;
  const rows = useMemo(() => register?.rows ?? [], [register]);

  /** What is on screen: the saved mark unless the teacher has changed it. */
  const markFor = (row: Row): Mark | null => edits[row.studentId] ?? row.status;

  // Counted from what is on screen, not from what is saved: the numbers have
  // to move as the teacher taps, which is the whole point of showing them.
  const live = rows.map(markFor);
  const counts = {
    present: live.filter((mark) => mark === "PRESENT").length,
    absent: live.filter((mark) => mark === "ABSENT").length,
    late: live.filter((mark) => mark === "LATE").length,
    excused: live.filter((mark) => mark === "EXCUSED").length,
    unmarked: live.filter((mark) => mark === null).length,
  };

  const locked = register?.session?.status === "LOCKED";
  const dirty = Object.keys(edits).length > 0;

  /**
   * The narrowing runs over the roll, never over what gets saved. A teacher
   * who searched for one name and then pressed Save would otherwise file a
   * register naming one child and forgetting thirty.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const mark = edits[row.studentId] ?? row.status;
      if (showing === "UNMARKED" && mark !== null) return false;
      if (showing === "AWAY" && (mark === null || mark === "PRESENT")) return false;
      if (needle) {
        const haystack = `${row.firstName} ${row.lastName} ${row.studentNo}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, edits, showing, search]);

  const narrowed = showing !== "ALL" || search.trim().length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!register) throw new Error("Nothing to save");
      const entries = rows
        .map((row) => ({ studentId: row.studentId, status: markFor(row) }))
        .filter((entry): entry is { studentId: string; status: Mark } =>
          Boolean(entry.status),
        );
      if (entries.length === 0) throw new Error("Nobody has been marked yet");
      return fetchJson("/api/v2/schools/portal/teacher/me/attendance", {
        method: "POST",
        body: JSON.stringify({
          termId: register.classSubject.termId,
          classId: register.classSubject.classId,
          streamId: register.classSubject.streamId,
          attendanceDate: register.onDate,
          entries,
        }),
      });
    },
    onSuccess: () => {
      setSaved(
        `Register saved — ${counts.present} present, ${counts.absent} absent, ${counts.late} late`,
      );
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const markAll = (value: Mark) => {
    setSaved(null);
    setEdits(Object.fromEntries(rows.map((row) => [row.studentId, value])));
  };

  const clearNarrowing = () => {
    setSearch("");
    setShowing("ALL");
  };

  if (!classSubjectId) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its register opens here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError what="the register" error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {save.error ? <SaveError what="The register" error={save.error} /> : null}
      {saved ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}
      {locked ? (
        <Alert tone="info" title="This register is locked">
          The office has closed this day. Ask them to reopen it if something needs
          changing.
        </Alert>
      ) : null}
      {/*
        A register gets marked in a classroom, and a classroom is where the
        signal goes. Nothing here queues the save — the teacher portal is not
        one of the offline modules — so the honest thing to say is that the
        marks are still on screen and the sending is what has to wait. Claiming
        they were safely stored on the device would be a lie that costs a day's
        attendance.
      */}
      {isOffline ? (
        <Alert tone="warn" title="You are working offline">
          Everything you tap stays on this screen, but it cannot be sent until the
          school&apos;s connection is back. Do not close the page — press Save the
          register again once the bar at the top says Online.
        </Alert>
      ) : null}

      <Card
        title={
          register
            ? `${register.classSubject.className}${register.classSubject.streamName ? ` ${register.classSubject.streamName}` : ""} · ${register.classSubject.subjectName}`
            : "Loading the roll…"
        }
        subtitle={
          register
            ? `${register.classSubject.termName} · ${rows.length} pupil${rows.length === 1 ? "" : "s"} on the class list`
            : undefined
        }
        actions={
          <div className="w-[10rem]">
            <Label htmlFor="register-date" className="sr-only">
              Register date
            </Label>
            <Input
              id="register-date"
              type="date"
              value={onDate || register?.onDate || ""}
              onChange={(event) => {
                setOnDate(event.target.value);
                setEdits({});
                setSaved(null);
              }}
            />
          </div>
        }
      >
        {/* The counter carries its meaning in the tint as well as the number:
            present green, absent red, late amber, the rest neutral. A row of
            four grey tiles makes the teacher read four labels to find the one
            that matters. */}
        <div className="te-counts">
          {[
            { label: "Present", value: counts.present, tone: "success" as const },
            { label: "Absent", value: counts.absent, tone: "danger" as const },
            { label: "Late", value: counts.late, tone: "warn" as const },
            { label: "Not marked", value: counts.unmarked, tone: "neutral" as const },
          ].map((cell) => (
            <div key={cell.label} className={`te-count ${cell.tone}`}>
              <p className="v">{cell.value}</p>
              <p className="lbl">{cell.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          Quick mark
        </span>
        <Button variant="secondary" disabled={locked} onClick={() => markAll("PRESENT")}>
          Everyone present
        </Button>
        <Button variant="secondary" disabled={locked} onClick={() => markAll("ABSENT")}>
          Everyone absent
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setEdits({});
            setSaved(null);
          }}
        >
          Undo my changes
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-[220px]">
          <TableSearch
            label="Find a pupil"
            value={search}
            onChange={setSearch}
            placeholder="Search a name or number"
          />
        </div>
        <SegmentedControl<Showing>
          size="sm"
          fullWidth={false}
          aria-label="Which pupils to show"
          options={SHOWING.map((option) => ({ ...option }))}
          value={showing}
          onValueChange={setShowing}
        />
      </div>

      {query.isPending ? (
        <TableRowsSkeleton
          headers={["Pupil", "", "Mark"]}
          columns={[{ avatar: true, twoLine: true }, { width: 84, badge: true }, { width: 240 }]}
          rows={10}
        />
      ) : rows.length === 0 ? (
        <NothingYet
          title="Nobody is on this class list"
          body="No active pupil has this class as their year group, so there is no register to take. The office puts pupils into a year group under Classes."
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="pupils"
          filters={[
            showing === "ALL" ? null : SHOWING.find((row) => row.value === showing)?.label,
            search.trim() || null,
          ].filter((value): value is string => Boolean(value))}
          onClear={clearNarrowing}
        />
      ) : (
        /*
          From the canvas: "The register dims to 50% and stops taking taps. A
          save that accepts more marks halfway through is a save that loses
          them." The whole roll goes under the overlay, not just the button,
          because the taps are the thing that would be lost.
        */
        <SavingOverlay saving={save.isPending} label="Sending the register…">
          <ul className="flex flex-col rounded-[var(--radius-md)] border border-[color:var(--border)]">
            {visible.map((row) => {
              const mark = markFor(row);
              return (
                <li
                  key={row.studentId}
                  className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 last:border-b-0"
                >
                  <PersonAvatar firstName={row.firstName} lastName={row.lastName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                      {row.lastName}, {row.firstName}
                    </p>
                    <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {row.studentNo}
                      {row.isBoarding ? " · boarder" : ""}
                    </p>
                  </div>
                  {mark === null ? <Badge tone="neutral">Not marked</Badge> : null}
                  <SegmentedControl<Mark>
                    size="sm"
                    fullWidth={false}
                    aria-label={`Attendance for ${row.firstName} ${row.lastName}`}
                    options={MARKS}
                    {...(mark ? { value: mark } : {})}
                    onValueChange={(value) => {
                      if (locked) return;
                      setSaved(null);
                      setEdits((current) => ({ ...current, [row.studentId]: value }));
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </SavingOverlay>
      )}

      {narrowed && visible.length > 0 && visible.length < rows.length ? (
        <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
          Showing {visible.length} of {rows.length}. Saving files the whole roll, not
          only what is on screen.
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
        <p className="flex-1 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
          {counts.present} present · {counts.absent} absent · {counts.late} late
          {counts.unmarked > 0 ? (
            <span className="text-[color:var(--tone-warn-strong)]">
              {" "}
              · {counts.unmarked} still unmarked
            </span>
          ) : null}
        </p>
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={locked || rows.length === 0}
          onClick={() => save.mutate()}
        >
          Save the register
        </Button>
      </div>
    </div>
  );
}
