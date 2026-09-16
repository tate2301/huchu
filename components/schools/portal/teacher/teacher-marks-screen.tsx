"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, EmptyState, Select } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { TableSearch } from "@/components/records/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/records/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { whoCan } from "@/lib/schools/access";
import { useTeacherPortal } from "./teacher-portal-context";

type Assessment = {
  id: string;
  title: string;
  kind: string;
  maxScore: string | number;
  assessedOn: string | null;
  status: string;
};

type SheetRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  score: string | number | null;
  isAbsent: boolean;
  marked: boolean;
};

type Sheet = {
  assessment: Assessment & {
    classSubject: {
      class: { name: string };
      stream: { name: string } | null;
      subject: { name: string };
    };
  };
  rows: SheetRow[];
};

type Band = { grade: string; minScore: number; maxScore: number };

type Scheme = { id: string; name: string; isDefault: boolean; isActive: boolean; bands: Band[] };

const KINDS = [
  { value: "CONTINUOUS", label: "Coursework" },
  { value: "EXAM", label: "Exam" },
  { value: "PRACTICAL", label: "Practical" },
] as const;

/** The grade a percentage falls in, or null when the school has no band for it. */
function gradeFor(bands: Band[], percent: number | null) {
  if (percent === null) return null;
  return (
    bands.find((band) => percent >= band.minScore && percent <= band.maxScore)?.grade ?? null
  );
}

/**
 * Entering marks for one assessment.
 *
 * A column of scores against the class roll, "out of N" said in the open
 * rather than hidden in a dialog description, and a running count of what is
 * still blank. Absent is a state of its own: a child who was not there did not
 * score zero, and the term mark leaves them out of the average rather than
 * dragging it down.
 *
 * Marking is typing, not clicking: Enter carries the caret to the next child
 * on the roll, so a teacher marking thirty papers never leaves the keyboard.
 */
export function TeacherMarksScreen() {
  const queryClient = useQueryClient();
  const { selectedClass } = useTeacherPortal();
  const access = useSchoolAccess();
  const mayCreate = access.can("schools.results", "capture");
  const [assessmentId, setAssessmentId] = useState<string>("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({
    kind: "CONTINUOUS",
    title: "",
    maxScore: "",
    assessedOn: "",
  });
  /**
   * Thirty names on a phone is four screens of thumbing. "Still blank" is the
   * question a teacher asks the sheet just before saving it, so it is a view
   * rather than something they have to scroll to work out.
   */
  const [search, setSearch] = useState("");
  const [blankOnly, setBlankOnly] = useState(false);

  /** The boxes, in the order they are on screen, so Enter knows where next is. */
  const boxes = useRef<Record<string, HTMLInputElement | null>>({});

  const classSubjectId = selectedClass?.classSubjectId ?? null;

  /*
    `{ termId, assessments }`, which is what the endpoint actually answers.

    This asked for `{ data: Assessment[] }` and read `list.data?.data`.
    `successResponse` does not wrap — it is `NextResponse.json(data)` — and
    `GET /api/v2/schools/assessments` returns `{ termId, assessments }`, so
    `.data` was always undefined and the list was permanently empty.

    Nothing anywhere said so. The screen renders "No assessments for this class
    yet" on an empty list, which is a sentence a teacher believes, and it kept
    saying it immediately after that same teacher created an assessment on that
    same screen. This is the only mark-entry surface in the shipped product, so
    while it read the wrong key no mark could be entered anywhere: no scores, no
    term marks, no result lines, a Submit button permanently disabled on
    "Nothing has been marked on this sheet yet", no moderation, no publication
    and no report card. The whole assessment half of the product hung off this
    one property name.
  */
  const list = useQuery({
    queryKey: ["schools", "portal", "teacher", "assessments", classSubjectId],
    queryFn: () =>
      fetchJson<{ termId: string | null; assessments: Assessment[] }>(
        `/api/v2/schools/assessments?classSubjectId=${classSubjectId}&limit=100`,
      ),
    enabled: Boolean(classSubjectId),
  });

  /**
   * The school's grade table, so a mark reads as a grade while it is typed.
   * Marks are entered against a band scheme the office set; showing 14 out of
   * 20 without saying it is a C makes the teacher do the school's arithmetic.
   */
  const schemes = useQuery({
    queryKey: ["schools", "grading-schemes"],
    queryFn: () => fetchJson<{ schemes: Scheme[] }>("/api/v2/schools/grading-schemes"),
  });

  const scheme =
    schemes.data?.schemes.find((row) => row.isDefault && row.isActive) ??
    schemes.data?.schemes[0] ??
    null;
  const bands = useMemo(
    () => [...(scheme?.bands ?? [])].sort((a, b) => b.minScore - a.minScore),
    [scheme],
  );

  const assessments = list.data?.assessments ?? [];
  const active = assessmentId || assessments[0]?.id || "";

  const sheet = useQuery({
    queryKey: ["schools", "portal", "teacher", "sheet", active],
    queryFn: () => fetchJson<Sheet>(`/api/v2/schools/assessments/${active}/scores`),
    enabled: Boolean(active),
  });

  // Memoised because the filter below depends on it: a fresh `[]` every render
  // would make that dependency change forever.
  const rows = useMemo(() => sheet.data?.rows ?? [], [sheet.data]);
  const maxScore = Number(sheet.data?.assessment.maxScore ?? 0);

  const valueFor = (row: SheetRow) =>
    edits[row.student.id] ?? (row.score === null ? "" : String(Number(row.score)));
  const absentFor = (row: SheetRow) => absent[row.student.id] ?? row.isAbsent;

  const entered = rows.filter(
    (row) => absentFor(row) || valueFor(row).trim() !== "",
  ).length;
  const outstanding = rows.length - entered;

  /**
   * What the class has done so far, from what is on screen rather than from
   * what is saved — the numbers move as the marks are typed, which is the only
   * reason to show them while marking.
   */
  const stats = useMemo(() => {
    const scored = rows
      .map((row) => {
        const away = absent[row.student.id] ?? row.isAbsent;
        const raw = edits[row.student.id] ?? (row.score === null ? "" : String(Number(row.score)));
        if (away || raw.trim() === "") return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      })
      .filter((value): value is number => value !== null);
    if (scored.length === 0 || maxScore === 0) return null;
    const percent = (value: number) => Math.round((value / maxScore) * 100);
    return {
      count: scored.length,
      average: percent(scored.reduce((total, value) => total + value, 0) / scored.length),
      top: percent(Math.max(...scored)),
      lowest: percent(Math.min(...scored)),
    };
  }, [rows, edits, absent, maxScore]);

  /**
   * The narrowing decides what is on screen, never what is written. The save
   * walks the whole roll below, because a teacher who searched for one name
   * and pressed Save must not file a sheet that forgets the rest of the class.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const away = absent[row.student.id] ?? row.isAbsent;
      const raw = edits[row.student.id] ?? (row.score === null ? "" : String(Number(row.score)));
      if (blankOnly && (away || raw.trim() !== "")) return false;
      if (needle) {
        const haystack = `${row.student.firstName} ${row.student.lastName} ${row.student.studentNo}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, edits, absent, blankOnly, search]);

  /** Enter is "next child", which is how a pile of scripts is worked through. */
  const focusNext = (studentId: string) => {
    const index = visible.findIndex((row) => row.student.id === studentId);
    const next = visible.slice(index + 1).find((row) => !absentFor(row));
    if (next) boxes.current[next.student.id]?.focus();
  };

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/schools/assessments/${active}/scores`, {
        method: "PUT",
        body: JSON.stringify({
          scores: rows
            .map((row) => {
              const away = absentFor(row);
              const raw = valueFor(row).trim();
              if (!away && raw === "") return null;
              return {
                studentId: row.student.id,
                score: away || raw === "" ? null : Number(raw),
                isAbsent: away,
              };
            })
            .filter(Boolean),
        }),
      }),
    onSuccess: () => {
      setSaved(`Marks saved — ${entered} of ${rows.length} recorded`);
      setEdits({});
      setAbsent({});
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string }>("/api/v2/schools/assessments", {
        method: "POST",
        body: JSON.stringify({
          classSubjectId,
          kind: draft.kind,
          title: draft.title.trim(),
          maxScore: Number(draft.maxScore),
          ...(draft.assessedOn ? { assessedOn: draft.assessedOn } : {}),
        }),
      }),
    onSuccess: (created) => {
      setFormOpen(false);
      setDraft({ kind: "CONTINUOUS", title: "", maxScore: "", assessedOn: "" });
      setAssessmentId(created.id);
      setSaved(`${draft.title.trim()} is ready to mark.`);
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "assessments"],
      });
    },
  });

  const openForm = () => {
    create.reset();
    setFormOpen(true);
  };

  if (!classSubjectId) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its assessments open here."
      />
    );
  }

  const newAssessment = (
    <RecordDialog
      open={formOpen}
      onOpenChange={setFormOpen}
      title="Create an assessment"
      description="The piece of work, and what it is marked out of."
      size="sm"
      errors={create.error ? [getApiErrorMessage(create.error)] : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!draft.title.trim() || !Number(draft.maxScore)}
            onClick={() => create.mutate()}
          >
            Create it
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assessment-title">What is it</Label>
          <Input
            id="assessment-title"
            value={draft.title}
            maxLength={200}
            placeholder="End of topic test — quadratic equations"
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assessment-kind">Kind</Label>
          <Select
            id="assessment-kind"
            value={draft.kind}
            onChange={(event) =>
              setDraft((current) => ({ ...current, kind: event.target.value }))
            }
          >
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assessment-max">Out of</Label>
          <Input
            id="assessment-max"
            type="number"
            min={1}
            inputMode="numeric"
            className="tabular-nums"
            value={draft.maxScore}
            onChange={(event) =>
              setDraft((current) => ({ ...current, maxScore: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="assessment-on">Sat on</Label>
          <Input
            id="assessment-on"
            type="date"
            value={draft.assessedOn}
            onChange={(event) =>
              setDraft((current) => ({ ...current, assessedOn: event.target.value }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );

  return (
    <div className="flex flex-col gap-4">
      {list.error ? (
        <LoadError
          what="your assessments"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {sheet.error ? (
        <LoadError
          what="the mark sheet"
          error={sheet.error}
          onRetry={() => void sheet.refetch()}
        />
      ) : null}
      {save.error ? <SaveError what="The marks" error={save.error} /> : null}
      {saved ? <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} /> : null}

      {list.isPending ? (
        <TableRowsSkeleton
          headers={["Pupil", "", "Mark"]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 110 },
            { width: 96, align: "right" },
          ]}
          rows={10}
        />
      ) : assessments.length === 0 ? (
        <>
          <NothingYet
            title="No assessments for this class yet"
            body={
              mayCreate
                ? "A test, an exam or a piece of coursework has to exist before it can be marked."
                : `Setting one up is ${whoCan("schools.results", "capture") ?? "somebody else"} to do.`
            }
            action={
              mayCreate ? (
                <Button variant="primary" onClick={openForm}>
                  Create an assessment
                </Button>
              ) : undefined
            }
          />
          {newAssessment}
        </>
      ) : (
        <>
          <Card
            title={
              sheet.data
                ? `${sheet.data.assessment.title} — out of ${maxScore}`
                : "Choose an assessment"
            }
            subtitle={
              sheet.data
                ? `${sheet.data.assessment.classSubject.class.name} · ${sheet.data.assessment.classSubject.subject.name} · ${entered} of ${rows.length} marked${outstanding > 0 ? `, ${outstanding} still blank` : ""}`
                : undefined
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[16rem]">
                  <Select
                    aria-label="Assessment"
                    value={active}
                    onChange={(event) => {
                      setAssessmentId(event.target.value);
                      setEdits({});
                      setAbsent({});
                      setSaved(null);
                    }}
                  >
                    {assessments.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title} · out of {Number(row.maxScore)}
                      </option>
                    ))}
                  </Select>
                </div>
                {mayCreate ? (
                  <Button variant="secondary" onClick={openForm}>
                    Create an assessment
                  </Button>
                ) : null}
              </div>
            }
          >
            {/* Four figures, not four sentences: where the class stands as the
                marking goes on, and the two ends of it. */}
            <div className="te-pills">
              <span className="te-pill">
                <span className="v">
                  {entered}/{rows.length}
                </span>
                <span className="lbl">Done</span>
              </span>
              <span className="te-pill">
                <span className="v">{stats ? `${stats.average}%` : "—"}</span>
                <span className="lbl">Average</span>
              </span>
              <span className="te-pill">
                <span className="v">{stats ? `${stats.top}%` : "—"}</span>
                <span className="lbl">Top</span>
              </span>
              <span className="te-pill">
                <span className="v">{stats ? `${stats.lowest}%` : "—"}</span>
                <span className="lbl">Lowest</span>
              </span>
            </div>

            <div className="mb-3 mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 basis-[220px]">
                <TableSearch
                  label="Find a pupil"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search a name or number"
                />
              </div>
              <Button
                variant={blankOnly ? "primary" : "secondary"}
                onClick={() => setBlankOnly((current) => !current)}
              >
                {blankOnly ? "Showing the blanks" : `Show the ${outstanding} still blank`}
              </Button>
            </div>

            {sheet.isPending ? (
              <TableRowsSkeleton
                headers={["Pupil", "", "Mark"]}
                columns={[
                  { avatar: true, twoLine: true },
                  { width: 110 },
                  { width: 96, align: "right" },
                ]}
                rows={10}
              />
            ) : rows.length === 0 ? (
              <NothingYet
                title="Nobody is on this class list"
                body="No active pupil has this class as their year group, so there is nothing to mark. The office puts pupils into a year group under Classes."
              />
            ) : visible.length === 0 ? (
              <NothingMatched
                what="pupils"
                filters={[blankOnly ? "still blank" : null, search.trim() || null].filter(
                  (value): value is string => Boolean(value),
                )}
                onClear={() => {
                  setSearch("");
                  setBlankOnly(false);
                }}
              />
            ) : (
              /*
                The sheet goes under the overlay while the PUT is in flight. A
                number typed into a row that is already being written is a
                number the save does not carry.
              */
              <SavingOverlay saving={save.isPending} label="Sending the marks…">
                <ul className="flex flex-col">
                  {visible.map((row) => {
                    const raw = valueFor(row);
                    const away = absentFor(row);
                    const numeric = raw === "" ? null : Number(raw);
                    const percent =
                      numeric === null || maxScore === 0
                        ? null
                        : Math.round((numeric / maxScore) * 100);
                    const overMax = numeric !== null && numeric > maxScore;
                    const grade = away || overMax ? null : gradeFor(bands, percent);
                    const errorId = `mark-error-${row.student.id}`;
                    return (
                      <li
                        key={row.student.id}
                        className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] py-3 last:border-b-0"
                      >
                        <PersonAvatar
                          firstName={row.student.firstName}
                          lastName={row.student.lastName}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                            {row.student.lastName}, {row.student.firstName}
                          </p>
                          <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                            {row.student.studentNo}
                          </p>
                          {/* The refusal a sighted teacher can see. `aria-invalid`
                              alone told the screen reader and nobody else. */}
                          {overMax ? (
                            <p
                              id={errorId}
                              className="text-[length:var(--type-caption)] text-[color:var(--tone-danger)]"
                            >
                              Over the maximum — this is marked out of {maxScore}.
                            </p>
                          ) : null}
                        </div>
                        {percent !== null && !away ? (
                          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                            {percent}%
                          </span>
                        ) : null}
                        {grade ? <Badge tone="neutral">{grade}</Badge> : null}
                        <Button
                          size="sm"
                          variant={away ? "primary" : "ghost"}
                          onClick={() => {
                            setSaved(null);
                            setAbsent((current) => ({
                              ...current,
                              [row.student.id]: !away,
                            }));
                          }}
                        >
                          {away ? "Was absent" : "Mark absent"}
                        </Button>
                        <Input
                          ref={(node) => {
                            boxes.current[row.student.id] = node;
                          }}
                          aria-label={`Mark for ${row.student.firstName} ${row.student.lastName}`}
                          className="w-24 text-right font-mono tabular-nums"
                          inputMode="decimal"
                          disabled={away}
                          aria-invalid={overMax}
                          {...(overMax ? { "aria-describedby": errorId } : {})}
                          value={away ? "" : raw}
                          placeholder="—"
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            focusNext(row.student.id);
                          }}
                          onChange={(event) => {
                            setSaved(null);
                            setEdits((current) => ({
                              ...current,
                              [row.student.id]: event.target.value,
                            }));
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </SavingOverlay>
            )}
          </Card>

          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
            <p className="flex-1 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
              {entered} of {rows.length} marked
              {outstanding > 0 ? ` · ${outstanding} still blank` : " · nothing left"}
            </p>
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              <Kbd>Enter</Kbd> next pupil · <Kbd>Tab</Kbd> next control
            </p>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={rows.length === 0}
              onClick={() => save.mutate()}
            >
              Save the marks
            </Button>
          </div>

          {newAssessment}
        </>
      )}
    </div>
  );
}
