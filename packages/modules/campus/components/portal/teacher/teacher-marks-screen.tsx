"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, EmptyState, Select } from "@corelithzw/react";
import { Input } from "@corelithzw/ui/components/input";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import { TableSearch } from "../../common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "../../common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
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

/**
 * Entering marks for one assessment.
 *
 * A column of scores against the class roll, "out of N" said in the open
 * rather than hidden in a dialog description, and a running count of what is
 * still blank. Absent is a state of its own: a child who was not there did not
 * score zero, and the term mark leaves them out of the average rather than
 * dragging it down.
 */
export function TeacherMarksScreen() {
  const queryClient = useQueryClient();
  const { selectedClass } = useTeacherPortal();
  const [assessmentId, setAssessmentId] = useState<string>("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * Thirty names on a phone is four screens of thumbing. "Still blank" is the
   * question a teacher asks the sheet just before saving it, so it is a view
   * rather than something they have to scroll to work out.
   */
  const [search, setSearch] = useState("");
  const [blankOnly, setBlankOnly] = useState(false);

  const classSubjectId = selectedClass?.classSubjectId ?? null;

  const list = useQuery({
    queryKey: ["schools", "portal", "teacher", "assessments", classSubjectId],
    queryFn: () =>
      fetchJson<{ data: Assessment[] }>(
        `/api/v2/schools/assessments?classSubjectId=${classSubjectId}&limit=100`,
      ),
    enabled: Boolean(classSubjectId),
  });

  const assessments = list.data?.data ?? [];
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

  if (!classSubjectId) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its assessments open here."
      />
    );
  }

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
        <NothingYet
          title="No assessments for this class yet"
          body="A test, an exam or a piece of coursework has to exist before it can be marked. The office sets them up under Assessments."
        />
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
                        </div>
                        {percent !== null && !away ? (
                          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                            {percent}%
                          </span>
                        ) : null}
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
                          aria-label={`Mark for ${row.student.firstName} ${row.student.lastName}`}
                          className="w-24 text-right font-mono tabular-nums"
                          inputMode="decimal"
                          disabled={away}
                          aria-invalid={overMax}
                          value={away ? "" : raw}
                          placeholder="—"
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
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={rows.length === 0}
              onClick={() => save.mutate()}
            >
              Save the marks
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
