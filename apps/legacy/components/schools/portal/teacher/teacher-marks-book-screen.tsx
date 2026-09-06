"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, EmptyState } from "@corelithzw/react";
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
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { whoCan } from "@/lib/schools/access";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

type Band = { code: string; label: string | null; minScore: number; maxScore: number };

type Mark = {
  studentId: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  subject: { id: string; code: string; name: string };
  mark: number | null;
  continuous: number | null;
  exam: number | null;
  grade: Band | null;
  caveat: string | null;
};

type TermMarks = { termId: string; scheme: { name: string }; marks: Mark[] };

/** A grade's tone: the top band reads well, the bottom reads as needing work. */
function bandTone(band: Band | null): "success" | "warn" | "danger" | "neutral" {
  if (!band) return "neutral";
  if (band.minScore >= 70) return "success";
  if (band.minScore >= 50) return "warn";
  return "danger";
}

/** The narrowing, in the words a teacher would use about their own class. */
const SHOWING = [
  { value: "ALL", label: "Everyone" },
  { value: "MARKED", label: "With a mark" },
  { value: "UNMARKED", label: "Not marked" },
] as const;

type Showing = (typeof SHOWING)[number]["value"];

/**
 * The marks book: where every child stands this term.
 *
 * The demo's gradebook is a grid of assessment columns. This is the same
 * question answered one level up — the term mark each assessment feeds, with
 * its continuous and exam sides shown separately so a teacher can see *why* a
 * mark is what it is. Entering the marks is the other screen; this one is for
 * reading them.
 *
 * A child with nothing marked is a row saying so, not a row left out. And the
 * caveat the grading module produces — "no exam sat yet", say — is printed
 * rather than swallowed, because a mark that is two thirds of a picture should
 * announce it.
 *
 * Rolling up is the one write here, and it is the same endpoint this screen
 * already reads: what is previewed above is exactly what would be written onto
 * the class's result sheet. Submitting a sheet is a head of department's job,
 * so the button says so rather than letting the API refuse afterwards.
 */
export function TeacherMarksBookScreen() {
  const queryClient = useQueryClient();
  const { selectedClass } = useTeacherPortal();
  const access = useSchoolAccess();
  const maySubmit = access.can("schools.results", "submit");
  const [search, setSearch] = useState("");
  const [showing, setShowing] = useState<Showing>("ALL");
  const [rolledUp, setRolledUp] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [
      "schools",
      "portal",
      "teacher",
      "term-marks",
      selectedClass?.classId,
      selectedClass?.classSubjectId,
    ],
    queryFn: () =>
      fetchJson<TermMarks>(
        `/api/v2/schools/assessments/term-marks?classId=${selectedClass?.classId}&classSubjectId=${selectedClass?.classSubjectId}`,
      ),
    enabled: Boolean(selectedClass),
  });

  const marks = useMemo(() => query.data?.marks ?? [], [query.data]);

  const rollUp = useMutation({
    mutationFn: () =>
      fetchJson<{ sheetId?: string }>("/api/v2/schools/assessments/term-marks", {
        method: "POST",
        body: JSON.stringify({
          classId: selectedClass?.classId,
          streamId: selectedClass?.streamId ?? null,
        }),
      }),
    onSuccess: () => {
      setRolledUp(
        "These marks are now on the class's result sheet. The head of department moderates it from Results.",
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
    },
  });

  /**
   * The narrowing shows fewer rows and changes nothing else. The counts in the
   * card subtitle stay whole-class, because "12 of 30 with a mark" is the
   * sentence a teacher is here to read and it must not move when they search.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return marks.filter((row) => {
      if (showing === "MARKED" && row.mark === null) return false;
      if (showing === "UNMARKED" && row.mark !== null) return false;
      if (needle) {
        const haystack = `${row.student.firstName} ${row.student.lastName} ${row.student.studentNo}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [marks, showing, search]);

  if (!selectedClass) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its marks book opens here."
      />
    );
  }

  const marked = marks.filter((row) => row.mark !== null);
  const average =
    marked.length === 0
      ? null
      : Math.round(marked.reduce((total, row) => total + (row.mark ?? 0), 0) / marked.length);

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError
          what="the marks book"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {rollUp.error ? <SaveError what="The result sheet" error={rollUp.error} /> : null}
      {rolledUp ? (
        <Alert
          tone="success"
          title="Marks rolled up"
          onDismiss={() => setRolledUp(null)}
        >
          {rolledUp}
        </Alert>
      ) : null}

      <Card
        title={`${selectedClass.className}${selectedClass.streamName ? ` ${selectedClass.streamName}` : ""} · ${selectedClass.subjectName}`}
        subtitle={
          query.data
            ? `${query.data.scheme.name} · ${marked.length} of ${marks.length} with a mark${average !== null ? ` · class average ${average}%` : ""}`
            : undefined
        }
        actions={
          <Button
            variant="secondary"
            loading={rollUp.isPending}
            disabled={!maySubmit || marked.length === 0}
            title={
              maySubmit
                ? marked.length === 0
                  ? "Nothing has a mark yet, so there is nothing to send."
                  : undefined
                : `Sending marks to a result sheet is ${whoCan("schools.results", "submit") ?? "somebody else"} to do.`
            }
            onClick={() => {
              setRolledUp(null);
              rollUp.mutate();
            }}
          >
            Send to the result sheet
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-[220px]">
            <TableSearch
              label="Find a pupil"
              value={search}
              onChange={setSearch}
              placeholder="Search a name or number"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {SHOWING.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={showing === option.value ? "primary" : "secondary"}
                onClick={() => setShowing(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {query.isPending ? (
          <TableRowsSkeleton
            headers={["Pupil", "Continuous", "Exam", "Term mark", "Grade"]}
            columns={[
              { avatar: true, twoLine: true },
              { width: 96, align: "right" },
              { width: 80, align: "right" },
              { width: 96, align: "right" },
              { width: 72, badge: true, align: "right" },
            ]}
            rows={10}
          />
        ) : marks.length === 0 ? (
          <NothingYet
            title="Nothing has been marked yet"
            body="Term marks appear here as soon as an assessment for this class has scores against it. Entering them is the Enter marks screen."
          />
        ) : visible.length === 0 ? (
          <NothingMatched
            what="pupils"
            filters={[
              showing === "ALL" ? null : SHOWING.find((row) => row.value === showing)?.label,
              search.trim() || null,
            ].filter((value): value is string => Boolean(value))}
            onClear={() => {
              setSearch("");
              setShowing("ALL");
            }}
          />
        ) : (
          /*
            The roll-up reads these same rows as it writes them, so the table
            dims while it is in flight rather than staying live under a write.
          */
          <SavingOverlay saving={rollUp.isPending} label="Sending to the result sheet…">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse">
                <caption className="sr-only">
                  Term marks for {selectedClass.className} {selectedClass.subjectName}
                </caption>
                <thead>
                  <tr className="border-b border-[color:var(--border)]">
                    <th className="py-2 text-left text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Pupil
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Continuous
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Exam
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Term mark
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Grade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={`${row.studentId}-${row.subject.id}`}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                    >
                      <td className="py-2">
                        <div className="flex items-center gap-3">
                          <PersonAvatar
                            firstName={row.student.firstName}
                            lastName={row.student.lastName}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[length:var(--type-body-sm)] text-[color:var(--text-strong)]">
                              {row.student.lastName}, {row.student.firstName}
                            </p>
                            {row.caveat ? (
                              <p className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                                {row.caveat}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-right font-[family-name:var(--font-mono)] tabular-nums text-[color:var(--text-muted)]">
                        {row.continuous === null ? "—" : `${Math.round(row.continuous)}%`}
                      </td>
                      <td className="py-2 text-right font-[family-name:var(--font-mono)] tabular-nums text-[color:var(--text-muted)]">
                        {row.exam === null ? "—" : `${Math.round(row.exam)}%`}
                      </td>
                      <td className="py-2 text-right font-[family-name:var(--font-mono)] font-semibold tabular-nums text-[color:var(--text-strong)]">
                        {row.mark === null ? "Not marked" : `${Math.round(row.mark)}%`}
                      </td>
                      <td className="py-2 text-right">
                        {row.grade ? (
                          <Badge tone={bandTone(row.grade)}>{row.grade.code}</Badge>
                        ) : (
                          <span className="text-[color:var(--text-subtle)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SavingOverlay>
        )}
      </Card>
    </div>
  );
}
