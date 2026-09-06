"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
} from "../../common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { Shield, TrendingUp } from "@corelithzw/ui/lib/icons";
import { useStudentPortal } from "./student-portal-context";
import { subjectAccentClass } from "./student-subject-accent";

type ResultLine = {
  id: string;
  subjectCode: string;
  score: number;
  grade: string | null;
  remarks: string | null;
  sheet: {
    id: string;
    title: string;
    publishedAt: string | null;
    term: { id: string; code: string; name: string } | null;
  };
};

/**
 * The results route answers `{ success, data: { … } }` rather than the bare
 * object `successResponse` usually returns, so the payload really is nested
 * once. Typed here so nobody has to guess from the call site.
 */
type ResultsPayload = {
  data: {
    results: ResultLine[];
  };
};

type Term = { id: string; code: string; name: string };

/** Only the two fields this screen needs off the pupil's subject list. */
type TaughtSubject = { code: string; name: string };

/**
 * A mark out of 100.
 *
 * `SchoolResultLine` carries a score and no maximum: a result sheet is the
 * term percentage, unlike an assessment, which is marked out of something. The
 * bar assumes that rather than inventing a denominator, and the number is the
 * truth whatever the bar does.
 */
const FULL_MARK = 100;

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The latest published line per subject, so one term reads as one column. */
function latestBySubject(lines: ResultLine[]) {
  const best = new Map<string, ResultLine>();
  for (const line of lines) {
    const held = best.get(line.subjectCode);
    if (!held || publishedTime(line) >= publishedTime(held)) {
      best.set(line.subjectCode, line);
    }
  }
  return best;
}

function publishedTime(line: ResultLine) {
  return line.sheet.publishedAt ? new Date(line.sheet.publishedAt).getTime() : 0;
}

function average(marks: number[]) {
  if (marks.length === 0) return null;
  return marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
}

/** Up, down or level — as words, because a colour is not a statement. */
function movement(now: number, before: number | null) {
  if (before === null) return { label: "First time", tone: "neutral" as const };
  const delta = Math.round((now - before) * 10) / 10;
  if (delta > 0) return { label: `Up ${delta}`, tone: "success" as const };
  if (delta < 0) return { label: `Down ${Math.abs(delta)}`, tone: "warn" as const };
  return { label: "Same as last time", tone: "neutral" as const };
}

/**
 * What a pupil scored this term, subject by subject.
 *
 * Only published marks are here, and that is the screen's one hard rule. A
 * mark a teacher has entered but the school has not released is not this
 * child's to read yet — so the empty state says results appear when the school
 * publishes them, rather than leaving a child to conclude they scored nothing.
 * The filtering is the server's: `/me/results` returns published sheets only,
 * and this screen never asks for a student id because the pupil is whoever is
 * signed in.
 *
 * Every mark is shown against the one before it, because "78" means nothing on
 * its own and "78, up 4" is the whole reason a child opens this. The term picker
 * is the demo's segmented tab strip, which scrolls sideways rather than
 * overflowing when a school runs more than three terms.
 *
 * There is no `SaveError` or `SavingOverlay` here, and that is deliberate rather
 * than forgotten: a pupil cannot write a mark. Everything on this screen is the
 * school's to publish and this child's to read.
 */
export function StudentMarksScreen() {
  const { student, term: currentTerm } = useStudentPortal();
  const [chosenTermId, setChosenTermId] = useState("");

  const query = useQuery({
    queryKey: ["schools", "portal", "student", "results"],
    queryFn: () =>
      fetchJson<ResultsPayload>("/api/v2/schools/portal/student/me/results"),
    enabled: student !== null,
  });

  /**
   * Subject names, and nothing depends on getting them.
   *
   * A result line carries `subjectCode` and no name, and "MAT 78" is not what
   * a twelve-year-old came to read. The pupil's own subject list has the name,
   * so it is borrowed here — for this term only, which is all that route
   * covers. Its failure is swallowed on purpose: a marks screen that will not
   * paint because a label lookup timed out is worse than one showing codes.
   */
  const subjectNames = useQuery({
    queryKey: ["schools", "portal", "student", "subjects"],
    queryFn: () =>
      fetchJson<{ subjects: TaughtSubject[] }>(
        "/api/v2/schools/portal/student/me/subjects",
      ),
    enabled: student !== null,
    retry: false,
  });

  const nameByCode = new Map(
    (subjectNames.data?.subjects ?? []).map((row) => [row.code, row.name]),
  );

  const lines = query.data?.data.results ?? [];

  // Terms in the order they happened. A published sheet carries its date, so
  // the marks themselves say which term came first — no second request, and no
  // guessing from a term code that a school is free to name anything.
  const termsById = new Map<string, { term: Term; at: number }>();
  for (const line of lines) {
    const term = line.sheet.term;
    if (!term) continue;
    const held = termsById.get(term.id);
    const at = publishedTime(line);
    if (!held) termsById.set(term.id, { term, at });
    else if (at > held.at) held.at = at;
  }
  const terms = [...termsById.values()]
    .sort((left, right) => left.at - right.at)
    .map((row) => row.term);

  const fallbackTermId =
    (currentTerm && terms.some((row) => row.id === currentTerm.id)
      ? currentTerm.id
      : terms[terms.length - 1]?.id) ?? "";
  const activeTermId = chosenTermId || fallbackTermId;
  const activeIndex = terms.findIndex((row) => row.id === activeTermId);
  const previousTerm = activeIndex > 0 ? terms[activeIndex - 1] : null;

  const thisTerm = latestBySubject(
    lines.filter((line) => line.sheet.term?.id === activeTermId),
  );
  const lastTerm = latestBySubject(
    previousTerm ? lines.filter((line) => line.sheet.term?.id === previousTerm.id) : [],
  );

  const subjects = [...thisTerm.values()].sort((left, right) =>
    (nameByCode.get(left.subjectCode) ?? left.subjectCode).localeCompare(
      nameByCode.get(right.subjectCode) ?? right.subjectCode,
    ),
  );
  const nowAverage = average(subjects.map((line) => line.score));
  const thenAverage = average([...lastTerm.values()].map((line) => line.score));
  const overall = nowAverage === null ? null : movement(nowAverage, thenAverage);

  if (student === null) {
    return (
      <NothingYet
        title="We cannot find your school record"
        body="Your account is signed in but it is not linked to a pupil yet. Ask the school office to link it and your marks appear here."
      />
    );
  }

  if (query.error) {
    return (
      <LoadError
        what="your marks"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isPending) {
    return (
      /* One card per subject: a name, a code, a mark and a bar. */
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <span className="sr-only">Fetching your marks…</span>
        <CardsSkeleton count={5} columns={1} lines={2} />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <NothingYet
        title="No marks published yet"
        body="Your results appear here when the school publishes them, at the end of each term. Until then your teachers are still marking."
      />
    );
  }

  const publishedAt = subjects[0]?.sheet.publishedAt;

  return (
    <div className="flex flex-col">
      <div className="sp-term-row">
        <div className="sp-term-tabs" role="group" aria-label="Term">
          {terms.map((row) => (
            <button
              key={row.id}
              type="button"
              className={row.id === activeTermId ? "on" : undefined}
              aria-pressed={row.id === activeTermId}
              onClick={() => setChosenTermId(row.id)}
            >
              {row.name}
            </button>
          ))}
        </div>
        {publishedAt ? (
          <span className="sp-term-year">
            {new Date(publishedAt).getFullYear()}
          </span>
        ) : null}
      </div>

      <div className="sp-hero">
        <div className="sp-hero-l">
          Overall mark · {terms[activeIndex]?.name ?? "this term"}
        </div>
        <div className="sp-hero-v">
          <span className="tabular-nums">
            {nowAverage === null ? "—" : nowAverage.toFixed(1)}
          </span>
          <span className="sp-hero-u">/ {FULL_MARK}</span>
        </div>
        <div className="sp-hero-d">
          {overall
            ? previousTerm
              ? `${overall.label} on ${previousTerm.name}`
              : overall.label
            : "No marks in this term yet"}
        </div>
        <span className="sp-hero-pos">
          <TrendingUp className="size-3" aria-hidden />
          Across {subjects.length}{" "}
          {subjects.length === 1 ? "subject" : "subjects"}
        </span>
      </div>

      <div className="sp-psh">
        Your subjects · {subjects.length}
        <Link href="/portal/student/goals" className="sp-psh-link">
          Set goals
        </Link>
      </div>

      {subjects.length === 0 ? (
        /* The term tabs above are the filter, and this is what they emptied,
           so the sentence names the term rather than telling a child there
           are no marks — there are, in another tab. */
        <NothingMatched
          what="marks"
          filters={[terms[activeIndex]?.name ?? "this term"]}
          onClear={() => setChosenTermId("")}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {subjects.map((line) => {
            const before = lastTerm.get(line.subjectCode);
            const change = movement(line.score, before ? before.score : null);
            const name = nameByCode.get(line.subjectCode) ?? line.subjectCode;
            return (
              <li key={line.id} className={subjectAccentClass(name)}>
                <div className="sp-row-card">
                  <div className="sp-rc-top">
                    <span className="sp-tag marks" />
                    <div className="sp-rc-info">
                      <div className="sp-rc-nm">{name}</div>
                      <div className="sp-rc-sb truncate">
                        <span className="font-[family-name:var(--font-mono)]">
                          {line.subjectCode}
                        </span>{" "}
                        · {line.sheet.title}
                      </div>
                    </div>
                    <div className="sp-rc-val">
                      {line.score}
                      <span className="sp-rc-of">/{FULL_MARK}</span>
                    </div>
                  </div>

                  <div
                    className="sp-subj-bar"
                    role="img"
                    aria-label={`${line.subjectCode}: ${line.score} out of ${FULL_MARK}`}
                  >
                    <span
                      style={{
                        width: `${Math.min(line.score, FULL_MARK)}%`,
                      }}
                    />
                  </div>

                  <div className="sp-as-meta">
                    <Badge tone={change.tone} dot>
                      {change.label}
                    </Badge>
                    {line.grade ? <Badge tone="neutral">{line.grade}</Badge> : null}
                    {before ? (
                      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                        {previousTerm?.name}: {before.score}
                      </span>
                    ) : null}
                  </div>

                  {line.remarks ? (
                    <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] px-3 py-2 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                      {line.remarks}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sp-note">
        <span className="sp-note-ic">
          <Shield className="size-3.5" aria-hidden />
        </span>
        Only marks the school has published are here. A mark your teacher is still
        working on appears once the school releases it.
        {publishedAt
          ? ` This term was published on ${DAY.format(new Date(publishedAt))}.`
          : ""}
      </div>
    </div>
  );
}
