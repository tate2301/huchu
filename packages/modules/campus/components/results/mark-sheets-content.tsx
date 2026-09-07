"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MobileList, MobileListEmpty, MobileListSectionHeader } from "@corelithzw/react";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { PageBand } from "../common/page-band";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { CreateButton, RecordActions } from "../common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "../../admin-v2";
import {
  fetchResultSheets,
  type ResultSheetLike,
  type ResultSheetStatus,
} from "../../results-v2";
import { SheetDetailDialog } from "./sheet-detail-dialog";
import { SheetFormDialog } from "./sheet-form-dialog";
import { SHEET_STATE_LABELS, SHEET_STATE_OPTIONS, SheetStateBadge } from "./sheet-state";
import { useResultSheetWorkflow } from "./use-sheet-workflow";

/**
 * The working list of mark sheets — the one the sidebar has always pointed at.
 *
 * "Result sheets" in the navigation linked to `/schools/results/sheets`, which
 * redirected to `/schools/assessments`, which does not exist: the item was a
 * 404 in the shipped product. This is the page it should have been reaching.
 *
 * It reads `/api/v2/schools/results/sheets` rather than the dashboard endpoint
 * the overview uses, because that route narrows itself to a teacher's own
 * class and subject assignments. A subject teacher opening this sees her own
 * sheets and nothing else; the office sees the school. Same page, same shape,
 * no second screen for "mine".
 */

export function MarkSheetsContent() {
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
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

  // The state cut stays client-side: the band chips above have to count every
  // state at once, and asking the server for one state at a time would make
  // them count only the state in view.
  const sheetsQuery = useQuery({
    queryKey: ["schools", "results", "sheets", classFilter, streamFilter, termFilter, search],
    queryFn: () =>
      fetchResultSheets({
        page: 1,
        limit: 100,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        termId: termFilter || undefined,
        search: search.trim() || undefined,
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classFilter)?.streams ?? [],
    [classes, classFilter],
  );

  const sheets = useMemo(() => sheetsQuery.data?.data ?? [], [sheetsQuery.data]);

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
    const needle = subjectName.toLowerCase();
    return sheets.filter((sheet) => {
      if (stateFilter && sheet.status !== stateFilter) return false;
      if (needle && !sheet.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sheets, stateFilter, subjectName]);

  // Grouped by year group, which is how a school talks about its mark sheets.
  // The route already orders by `updatedAt`, so this groups what is adjacent
  // after a sort by class name applied here.
  const grouped = useMemo(() => {
    const map = new Map<string, ResultSheetLike[]>();
    for (const sheet of [...visible].sort((a, b) =>
      `${a.class.name}${a.stream?.name ?? ""}`.localeCompare(
        `${b.class.name}${b.stream?.name ?? ""}`,
      ),
    )) {
      const key = `${sheet.class.name}${sheet.stream ? ` ${sheet.stream.name}` : ""}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(sheet);
      else map.set(key, [sheet]);
    }
    return [...map.entries()];
  }, [visible]);

  const narrowing = [
    classes.find((row) => row.id === classFilter)?.name ?? null,
    streams.find((row) => row.id === streamFilter)?.name ?? null,
    subjectName || null,
    terms.find((term) => term.id === termFilter)?.name ?? null,
    stateFilter ? SHEET_STATE_LABELS[stateFilter as ResultSheetStatus] : null,
    search.trim() || null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setClassFilter("");
    setStreamFilter("");
    setSubjectFilter("");
    setTermFilter("");
    setStateFilter("");
    setSearch("");
  };

  const openForm = (sheet: ResultSheetLike | null) => {
    setFormFor(sheet);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeading
        title="Result sheets"
        description="Every mark sheet you may work on, and what still has to happen to it."
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
      {sheetsQuery.error ? (
        <LoadError
          what="the mark sheets"
          error={sheetsQuery.error}
          onRetry={() => void sheetsQuery.refetch()}
        />
      ) : null}

      <FilterBar>
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classFilter}
          options={classes.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(next) => {
            setClassFilter(next);
            setStreamFilter("");
          }}
        />
        <FilterSelect
          label="Class"
          allLabel="Every class"
          value={streamFilter}
          options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onChange={setStreamFilter}
        />
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
          value={stateFilter}
          options={SHEET_STATE_OPTIONS}
          onChange={setStateFilter}
        />
        <div className="min-w-0 flex-1 basis-[220px]">
          <Label htmlFor="sheet-search" className="text-sm text-muted-foreground">
            Search
          </Label>
          <Input
            id="sheet-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mark sheets"
          />
        </div>
      </FilterBar>

      {sheetsQuery.isLoading ? (
        <TableRowsSkeleton columns={[{ twoLine: true }, { width: 110 }, { width: 160 }]} />
      ) : (
        <MobileList>
          {grouped.length === 0 ? (
            <MobileListEmpty>
              {sheets.length === 0 && narrowing.length === 0 ? (
                <NothingYet
                  title="No mark sheets yet"
                  body="Sheets appear here when a mark book is written to one under a year group's assessments, or when you raise one by hand."
                />
              ) : (
                <NothingMatched what="mark sheets" filters={narrowing} onClear={clearFilters} />
              )}
            </MobileListEmpty>
          ) : (
            grouped.map(([heading, rows]) => (
              <div key={heading}>
                <MobileListSectionHeader>{heading}</MobileListSectionHeader>
                {rows.map((sheet) => (
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
                ))}
              </div>
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
          defaultClassId={classFilter || undefined}
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
