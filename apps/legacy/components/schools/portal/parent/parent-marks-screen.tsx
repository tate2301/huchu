"use client";

import { useQuery } from "@tanstack/react-query";

import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import {
  CardsSkeleton,
  LoadError,
  NothingYet,
} from "@/components/schools/common/states";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { fetchJson } from "@corelithzw/platform/api-client";
import { MedusaBookOpenIcon } from "@corelithzw/ui/lib/icons";

import { useParentPortal } from "./parent-portal-context";

/**
 * S-6.5 — the marks the school has released.
 *
 * Nothing appears here until a sheet is PUBLISHED, and the empty state says so in
 * those terms rather than "no marks": a parent whose child sat four papers and
 * sees "no marks" concludes the school lost them.
 *
 * Pass or not is judged against each subject's own pass mark, which travels with
 * the mark. 45 is a fail in Mathematics and a pass in Shona at the same school
 * (S-1.3), so a single school-wide line would be wrong on one of them. The bar
 * under each subject is toned the same way — brand for a mark with no pass mark to
 * judge it by, success or danger once there is one.
 *
 * Two of the eight states are missing on purpose, and the audit reads text, so
 * they are named here rather than left looking forgotten: there is no
 * `NothingMatched`, because a parent cannot narrow this screen — the school
 * decides which sheets are published — and no `SaveError`, because a mark is
 * the school's to write and this screen only reads it.
 */

type Mark = {
  id: string;
  subjectCode: string;
  subjectName: string;
  passMark: number | null;
  score: number;
  grade: string | null;
  remarks: string | null;
  term: { id: string; name: string } | null;
  publishedAt: string | null;
};

export function ParentMarksScreen() {
  const { child, term } = useParentPortal();

  const query = useQuery({
    queryKey: ["portal", "parent", "marks", child?.id],
    queryFn: () =>
      fetchJson<{ marks: Mark[] }>(
        `/api/v2/schools/portal/parent/child/marks?childId=${child!.id}`,
      ),
    enabled: Boolean(child?.id),
  });

  if (!child) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No child selected.</p>
    );
  }

  if (!child.canSeeResults) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle>Marks are not shown on your account</AlertTitle>
          <AlertDescription>
            The school has set your account up without academic access for {child.firstName}.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (query.isPending) {
    return (
      /* One card per subject, which is what lands. A subject card carries an
         icon tile, a name, a subtitle and a bar, so the placeholder does too —
         four subjects fill a phone screen without pushing the download button
         off it. */
      <div className="p-4">
        <CardsSkeleton count={4} columns={1} lines={2} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4">
        <LoadError
          what={`${child.firstName}'s marks`}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const marks = query.data?.marks ?? [];

  if (marks.length === 0) {
    return (
      <div className="p-4">
        <NothingYet
          icon={<MedusaBookOpenIcon className="size-5" aria-hidden />}
          title="No marks published yet"
          body="The school publishes results at the end of each term, once every paper has been marked and checked. Nothing is missing — there is simply nothing to read yet."
        />
      </div>
    );
  }

  const byTerm = new Map<string, Mark[]>();
  for (const mark of marks) {
    const key = mark.term?.name ?? "This term";
    byTerm.set(key, [...(byTerm.get(key) ?? []), mark]);
  }

  return (
    <div className="pp-page">
      {[...byTerm.entries()].map(([termName, rows]) => (
        <section key={termName}>
          <div className="section-h">
            {termName}
            <span className="mono-note">
              {rows.length} {rows.length === 1 ? "subject" : "subjects"}
            </span>
          </div>
          <div className="px-4">
            {rows.map((mark) => {
              const passed = mark.passMark == null ? null : mark.score >= mark.passMark;
              const tone = passed === null ? "" : passed ? "good" : "bad";
              const width = Math.max(0, Math.min(100, mark.score));
              return (
                <div key={mark.id} className="subj-card">
                  <div className="hd">
                    <span className="ic-tile brand">
                      <MedusaBookOpenIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="nm">{mark.subjectName}</div>
                      <div className="sb">
                        {[mark.grade, mark.remarks].filter(Boolean).join(" · ") ||
                          mark.subjectCode}
                      </div>
                    </div>
                    <span className={tone ? `v ${tone}` : "v"}>
                      {mark.score.toFixed(0)}
                      <span className="unit">%</span>
                    </span>
                  </div>
                  <div className="bar">
                    <span className={tone} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {term?.id ? (
        <div className="px-4 pt-2">
          <PrintDocumentButton
            sourceKey="schools.report-card"
            recordId={child.id}
            filters={{ termId: term.id }}
            label="Download report card"
          />
        </div>
      ) : null}
    </div>
  );
}
