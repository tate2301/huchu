"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { SheetDetailDialog } from "@/components/schools/results/sheet-detail-dialog";
import { SheetFormDialog } from "@/components/schools/results/sheet-form-dialog";
import { SHEET_STATE_LABELS, SHEET_STATE_OPTIONS, SheetStateBadge } from "@/components/schools/results/sheet-state";
import { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

/**
 * One year group's mark sheets.
 *
 * A result sheet already belongs to a class, so listing every sheet in the
 * school and asking a head of department to find theirs was the same
 * one-giant-list problem the student directory had. The class is the route;
 * status is the filter, because "what is still in draft in Form 2" is the
 * question a HOD is actually asking in the week before reports go out.
 *
 * Every row used to be a dead end — a name, an average and a badge, and no way
 * to act on any of it. The verbs are the same ones the moderation queue and the
 * publishing screen carry, from the same place, so a sheet behaves identically
 * wherever it is met.
 *
 * ── The filter row ─────────────────────────────────────────────────────────
 *
 * The canvas names each filter by its unnarrowed choice:
 *
 *   Class = Every class
 *   Status = Any status
 *
 * Class is the stream within this year group — the route has already answered
 * "which form?", so the only class question left is "which of its streams?" —
 * and it is offered only when the year group has been split into any. Status is
 * applied here rather than at the endpoint, so the band chips above go on
 * counting every state while one of them is in view. Subject and Term narrow
 * further; the canvas draws neither because its specimen year group has one
 * term's sheets in view, but a real one accumulates three.
 */
export function ClassResultsContent({
  classId,
  yearGroup,
  initialStreamId,
}: {
  classId: string;
  /** The year group's name, for the heading the page is titled by. */
  yearGroup: string;
  initialStreamId?: string;
}) {
  const [streamFilter, setStreamFilter] = useState(initialStreamId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<ResultSheetLike | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  const workflow = useResultSheetWorkflow();

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 100, isActive: true }),
  });

  // The state cut is applied here rather than sent to the server, so the band
  // chips above can go on counting every state while one of them is in view.
  const resultsQuery = useQuery({
    queryKey: ["schools", "results", "by-class", classId, streamFilter, termFilter],
    queryFn: () =>
      fetchSchoolsResultsData({
        page: 1,
        limit: 100,
        classId,
        streamId: streamFilter || undefined,
        termId: termFilter || undefined,
      }),
  });

  const sheets = useMemo<ResultSheetLike[]>(
    () => resultsQuery.data?.data ?? [],
    [resultsQuery.data],
  );
  const schoolClass = useMemo(
    () => (classesQuery.data?.data ?? []).find((row) => row.id === classId) ?? null,
    [classesQuery.data, classId],
  );
  const streams = schoolClass?.streams ?? [];
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);

  const counts = useMemo(() => {
    const tally: Record<ResultSheetStatus, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      HOD_APPROVED: 0,
      HOD_REJECTED: 0,
      PUBLISHED: 0,
    };
    for (const sheet of sheets) tally[sheet.status] += 1;
    return tally;
  }, [sheets]);

  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );

  const visible = useMemo(() => {
    const subjectNeedle = subjectName.toLowerCase();
    const searchNeedle = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (statusFilter && sheet.status !== statusFilter) return false;
      if (subjectNeedle && !sheet.title.toLowerCase().includes(subjectNeedle)) return false;
      if (searchNeedle && !sheet.title.toLowerCase().includes(searchNeedle)) return false;
      return true;
    });
  }, [sheets, statusFilter, subjectName, search]);

  const narrowing = [
    streams.find((stream) => stream.id === streamFilter)?.name ?? null,
    statusFilter ? SHEET_STATE_LABELS[statusFilter as ResultSheetStatus] : null,
    subjectName || null,
    terms.find((term) => term.id === termFilter)?.name ?? null,
    search.trim() || null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setStreamFilter("");
    setStatusFilter("");
    setSubjectFilter("");
    setTermFilter("");
    setSearch("");
  };

  const openForm = (sheet: ResultSheetLike | null) => {
    setFormFor(sheet);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeading
        title={`${yearGroup} marks`}
        description="Every mark sheet this year group has this term, and where each one has got to."
        primaryAction={
          <CreateButton
            resource="schools.results"
            label="New mark sheet"
            onSelect={() => openForm(null)}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Draft", value: counts.DRAFT },
          { label: "Submitted", value: counts.SUBMITTED, tone: "warn" },
          { label: "Approved", value: counts.HOD_APPROVED, tone: "success" },
          { label: "Sent back", value: counts.HOD_REJECTED, tone: "danger" },
          { label: "Published", value: counts.PUBLISHED, tone: "brand" },
        ]}
      />

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the mark sheets"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <FilterBar>
        {streams.length > 0 ? (
          <FilterSelect
            label="Class"
            allLabel="Every class"
            value={streamFilter}
            options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
            onChange={setStreamFilter}
          />
        ) : null}
        <FilterSelect
          label="Subject"
          allLabel="Every subject"
          value={subjectFilter}
          options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
          onChange={setSubjectFilter}
        />
        <FilterSelect
          label="Term"
          allLabel="Every term"
          value={termFilter}
          options={terms.map((term) => ({ value: term.id, label: term.name }))}
          onChange={setTermFilter}
        />
        <FilterSelect
          label="Status"
          allLabel="Any status"
          value={statusFilter}
          options={SHEET_STATE_OPTIONS}
          onChange={setStatusFilter}
        />
        <div className="min-w-0 flex-1 basis-[220px]">
          <Label htmlFor="class-sheet-search" className="text-sm text-muted-foreground">
            Search
          </Label>
          <Input
            id="class-sheet-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mark sheets"
          />
        </div>
      </FilterBar>

      {resultsQuery.isLoading ? (
        <TableRowsSkeleton columns={[{ twoLine: true }, { width: 110 }, { width: 160 }]} rows={6} />
      ) : (
        <MobileList>
          {visible.length === 0 ? (
            <MobileListEmpty>
              {sheets.length === 0 && narrowing.length === 0 ? (
                <NothingYet
                  title="No mark sheets for this year group yet"
                  body="Sheets appear here when the mark book is written to one under the year group's assessments."
                />
              ) : (
                <NothingMatched what="mark sheets" filters={narrowing} onClear={clearFilters} />
              )}
            </MobileListEmpty>
          ) : (
            visible.map((sheet) => (
              <MobileList.Row
                key={sheet.id}
                static
                title={sheet.title}
                subtitle={
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span>
                      {[
                        sheet.stream?.name,
                        sheet.term.name,
                        `${sheet._count.lines} mark${sheet._count.lines === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {typeof sheet.stats?.averageScore === "number"
                        ? ` · average ${sheet.stats.averageScore.toFixed(1)}`
                        : ""}
                    </span>
                    <SheetStateBadge status={sheet.status} />
                    <RecordActions
                      resource="schools.results"
                      verbs={workflow.verbsFor(sheet, {
                        onOpen: (row) => setOpenSheetId(row.id),
                        onEdit: (row) => openForm(row),
                      })}
                    />
                  </span>
                }
              />
            ))
          )}
        </MobileList>
      )}

      <p className="text-sm text-muted-foreground">
        Moderation and publishing act on these sheets —{" "}
        <Link href="/schools/results/moderation" className="hover:underline">
          moderation queue
        </Link>{" "}
        and{" "}
        <Link href="/schools/results/publish" className="hover:underline">
          publishing
        </Link>
        .
      </p>

      {formOpen ? (
        <SheetFormDialog
          key={formFor?.id ?? "new"}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setFormFor(null);
          }}
          sheet={formFor}
          defaultClassId={classId}
          defaultStreamId={streamFilter || undefined}
        />
      ) : null}
      <SheetDetailDialog
        sheetId={openSheetId}
        onOpenChange={(open) => {
          if (!open) setOpenSheetId(null);
        }}
      />
      {workflow.dialog}
    </div>
  );
}
