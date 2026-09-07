"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, MobileList, MobileListEmpty } from "@corelithzw/react";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { CreateButton, RecordActions } from "../common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  createSchoolsAcademicYear,
  createSchoolsTerm,
  fetchSchoolsAcademicYears,
  fetchSchoolsTerms,
  updateSchoolsAcademicYear,
  updateSchoolsTerm,
  type SchoolsAcademicYearRecord,
  type SchoolsTermRecord,
} from "../../admin-v2";
import { AcademicYearFormSheet } from "./academic-year-form-sheet";
import { TermFormSheet } from "./term-form-sheet";

/**
 * The academic calendar — years and terms.
 *
 * Every term-scoped record in the pack (enrolment, invoice, register, result
 * sheet, allocation) is keyed by `termId`, and until this surface existed there
 * was no way to create one. It is therefore the first screen a newly
 * provisioned school has to visit, which is why it leads Master Data's schools
 * section and says so plainly when the school has no active term.
 *
 * Both tables now carry the full set of verbs. Before, a year or a term could
 * be created and made current and nothing else — a typo in a term's dates was
 * permanent, and a year opened by mistake stayed on the list for ever. Verbs
 * are disabled with the reason rather than hidden, so a bursar reading this
 * page sees the same shape the head does.
 */

export type SchoolsCalendarView = "years" | "terms";

/**
 * The three terms a school year is cut into here.
 *
 * Not specimen data — it is the shape of the Zimbabwean academic year, and
 * every school on the pack types the same three codes and the same three names
 * into the term dialog each January. Offered as one-press fills for the two
 * fields that never vary; the dates, which always do, stay the school's own.
 */
const STANDARD_TERMS = [
  { code: "T1", name: "Term 1", label: "T1 - Term 1" },
  { code: "T2", name: "Term 2", label: "T2 - Term 2" },
  { code: "T3", name: "Term 3", label: "T3 - Term 3" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatRange(start: string, end: string) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

export function SchoolsCalendarContent({
  view,
  onCreatedTerm,
}: {
  view: SchoolsCalendarView;
  onCreatedTerm?: () => void;
}) {
  const queryClient = useQueryClient();
  const [yearSheetOpen, setYearSheetOpen] = useState(false);
  const [termSheetOpen, setTermSheetOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<SchoolsAcademicYearRecord | null>(null);
  const [editingTerm, setEditingTerm] = useState<SchoolsTermRecord | null>(null);
  // Terms belong to a year, so narrowing by the year is the filter a school
  // actually reaches for — three terms this year, twelve on the list.
  const [yearFilter, setYearFilter] = useState("");

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => fetchSchoolsAcademicYears({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 200 }),
  });

  const years = useMemo(() => yearsQuery.data?.data ?? [], [yearsQuery.data]);
  const allTerms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const terms = useMemo(
    () =>
      yearFilter
        ? allTerms.filter((term) => term.academicYear.id === yearFilter)
        : allTerms,
    [allTerms, yearFilter],
  );
  const activeTerm = useMemo(() => allTerms.find((term) => term.isActive), [allTerms]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "academic-years"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "terms"] });
  }

  const activateYear = useMutation({
    mutationFn: (id: string) => updateSchoolsAcademicYear(id, { isActive: true }),
    onSuccess: invalidate,
  });

  const activateTermMutation = useMutation({
    mutationFn: (id: string) => updateSchoolsTerm(id, { isActive: true }),
    onSuccess: invalidate,
  });

  const saveYear = useMutation({
    mutationFn: (values: {
      code: string;
      name: string;
      startDate: string;
      endDate: string;
      isActive?: boolean;
    }) =>
      editingYear
        ? updateSchoolsAcademicYear(editingYear.id, values)
        : createSchoolsAcademicYear(values),
    onSuccess: () => {
      setYearSheetOpen(false);
      setEditingYear(null);
      invalidate();
    },
  });

  const saveTerm = useMutation({
    mutationFn: (values: {
      academicYearId: string;
      code: string;
      name: string;
      startDate: string;
      endDate: string;
      isActive?: boolean;
    }) =>
      editingTerm
        ? updateSchoolsTerm(editingTerm.id, {
            code: values.code,
            name: values.name,
            startDate: values.startDate,
            endDate: values.endDate,
            isActive: values.isActive,
          })
        : createSchoolsTerm(values),
    onSuccess: () => {
      setTermSheetOpen(false);
      setEditingTerm(null);
      invalidate();
      onCreatedTerm?.();
    },
  });

  const deleteYear = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/academic-years/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const deleteTerm = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/terms/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const yearColumns = useMemo<ColumnDef<SchoolsAcademicYearRecord>[]>(
    () => [
      {
        id: "year",
        header: "Academic year",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.code} - {row.original.name}
            </div>
            <div className="text-muted-foreground font-mono">
              {formatRange(row.original.startDate, row.original.endDate)}
            </div>
          </div>
        ),
      },
      {
        id: "terms",
        header: "Terms",
        cell: ({ row }) => <NumericCell>{row.original._count.terms}</NumericCell>,
      },
      {
        id: "classes",
        header: "Classes",
        cell: ({ row }) => <NumericCell>{row.original._count.classes}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="success">Current</Badge> : null,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              ...(row.original.isActive
                ? []
                : [
                    {
                      label: "Make current",
                      action: "edit" as const,
                      loading: activateYear.isPending,
                      onSelect: () => activateYear.mutate(row.original.id),
                    },
                  ]),
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingYear(row.original);
                  setYearSheetOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteYear.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The year disappears from every picker. It is refused while any term, class or enrolment still hangs off it.",
                  confirmLabel: "Delete the year",
                },
                onSelect: () => deleteYear.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [activateYear, deleteYear],
  );

  const termColumns = useMemo<ColumnDef<SchoolsTermRecord>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.code} - {row.original.name}
            </div>
            <div className="text-muted-foreground font-mono">
              {formatRange(row.original.startDate, row.original.endDate)}
            </div>
          </div>
        ),
      },
      {
        id: "academicYear",
        header: "Academic year",
        cell: ({ row }) => row.original.academicYear.name,
      },
      {
        id: "enrollments",
        header: "Enrolled",
        cell: ({ row }) => <NumericCell>{row.original._count.enrollments}</NumericCell>,
      },
      {
        id: "invoices",
        header: "Invoices",
        cell: ({ row }) => <NumericCell>{row.original._count.feeInvoices}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="success">Current</Badge> : null,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              ...(row.original.isActive
                ? []
                : [
                    {
                      label: "Make current",
                      action: "edit" as const,
                      loading: activateTermMutation.isPending,
                      onSelect: () => activateTermMutation.mutate(row.original.id),
                    },
                  ]),
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingTerm(row.original);
                  setTermSheetOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteTerm.isPending,
                // A current term is the one every register and invoice is being
                // written against today, so it is not deletable at all.
                unavailable: row.original.isActive
                  ? "The current term cannot be deleted. Make another term current first."
                  : undefined,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The term disappears from every picker. It is refused while any enrolment, invoice or result sheet is dated inside it.",
                  confirmLabel: "Delete the term",
                },
                onSelect: () => deleteTerm.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [activateTermMutation, deleteTerm],
  );

  const hasError = yearsQuery.error || termsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <LoadError
          what="the academic calendar"
          error={yearsQuery.error || termsQuery.error}
          onRetry={() => invalidate()}
        />
      ) : null}

      {/*
        Four writes, four sentences. "The term would not be deleted" and "the
        year would not be made current" are acted on differently, and the one
        shared banner this replaced made every refusal read the same.
      */}
      {activateYear.error ? (
        <SaveError what="The current academic year" error={activateYear.error} />
      ) : null}
      {activateTermMutation.error ? (
        <SaveError what="The current term" error={activateTermMutation.error} />
      ) : null}
      {deleteYear.error ? (
        <SaveError what="The academic year" error={deleteYear.error} />
      ) : null}
      {deleteTerm.error ? <SaveError what="The term" error={deleteTerm.error} /> : null}

      {!yearsQuery.isLoading && !termsQuery.isLoading && !activeTerm ? (
        <Alert tone="warn" title="This school has no current term">
          Admissions, fees, registers and results are all recorded against a term.
          Open an academic year and make one of its terms current to start using them.
        </Alert>
      ) : null}

      {view === "years" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section-title">Academic years</h2>
            <CreateButton
              resource="schools.academics"
              label="New academic year"
              onSelect={() => {
                setEditingYear(null);
                setYearSheetOpen(true);
              }}
            />
          </div>
          {yearsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Academic year", "Terms", "Classes", "Status"]}
              columns={[
                { twoLine: true },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 120, badge: true },
              ]}
              rows={5}
            />
          ) : years.length === 0 ? (
            <NothingYet
              title="No academic years yet"
              body="An academic year is the frame every term, class and invoice hangs off. Create one to open the school year."
            />
          ) : (
            <DataTable
              data={years}
              columns={yearColumns}
              searchPlaceholder="Search academic years"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No academic years matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static={row.isActive}
                        title={`${row.code} - ${row.name}`}
                        // "Current" reads on the subtitle line rather than as a
                        // badge in `trailing`: the design system's row is a
                        // `1fr 14px` grid sized for a chevron and `.mobile-list`
                        // is `overflow: clip`, so a badge there was cut mid-word.
                        subtitle={[
                          formatRange(row.startDate, row.endDate),
                          `${row._count.terms} terms`,
                          row.isActive ? "Current" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        onClick={
                          row.isActive ? undefined : () => activateYear.mutate(row.id)
                        }
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="academic years" />}
            />
          )}
        </div>
      ) : null}

      {view === "terms" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section-title">Terms</h2>
            <CreateButton
              resource="schools.academics"
              label="New term"
              unavailable={
                years.length === 0
                  ? "A term belongs to an academic year. Create the year first."
                  : undefined
              }
              onSelect={() => {
                setEditingTerm(null);
                setTermSheetOpen(true);
              }}
            />
          </div>
          {years.length === 0 ? (
            <Alert tone="info" title="Create an academic year first">
              A term belongs to an academic year and has to fall inside its dates.
            </Alert>
          ) : null}

          <FilterBar>
            <FilterSelect
              label="Academic year"
              allLabel="Every academic year"
              value={yearFilter}
              options={years.map((year) => ({ value: year.id, label: year.name }))}
              onChange={setYearFilter}
            />
          </FilterBar>

          {termsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Term", "Academic year", "Enrolled", "Invoices", "Status"]}
              columns={[
                { twoLine: true },
                { width: 160 },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 120, badge: true },
              ]}
              rows={6}
            />
          ) : allTerms.length === 0 ? (
            <NothingYet
              title="No terms yet"
              body={`Add the terms that make up the academic year — usually ${STANDARD_TERMS.map(
                (preset) => preset.label,
              ).join(", ")}. Every register, invoice and result sheet is dated inside one.`}
            />
          ) : terms.length === 0 ? (
            <NothingMatched
              what="terms"
              filters={[years.find((year) => year.id === yearFilter)?.name ?? ""]}
              onClear={() => setYearFilter("")}
            />
          ) : (
            <DataTable
              data={terms}
              columns={termColumns}
              searchPlaceholder="Search terms"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No terms matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static={row.isActive}
                        title={`${row.academicYear.code} · ${row.code} - ${row.name}`}
                        subtitle={[
                          formatRange(row.startDate, row.endDate),
                          row.isActive ? "Current" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        onClick={
                          row.isActive
                            ? undefined
                            : () => activateTermMutation.mutate(row.id)
                        }
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="terms" />}
            />
          )}
        </div>
      ) : null}

      <AcademicYearFormSheet
        open={yearSheetOpen}
        onOpenChange={(open) => {
          setYearSheetOpen(open);
          if (!open) setEditingYear(null);
        }}
        initial={
          editingYear
            ? {
                code: editingYear.code,
                name: editingYear.name,
                startDate: formatDate(editingYear.startDate),
                endDate: formatDate(editingYear.endDate),
                isActive: editingYear.isActive,
              }
            : undefined
        }
        isSubmitting={saveYear.isPending}
        error={saveYear.error ? getApiErrorMessage(saveYear.error) : null}
        onSubmit={(values) => saveYear.mutate(values)}
      />

      <TermFormSheet
        open={termSheetOpen}
        onOpenChange={(open) => {
          setTermSheetOpen(open);
          if (!open) setEditingTerm(null);
        }}
        years={years}
        presets={STANDARD_TERMS}
        existingTerms={allTerms.map((term) => ({
          code: term.code,
          academicYearId: term.academicYear.id,
        }))}
        initial={
          editingTerm
            ? {
                academicYearId: editingTerm.academicYear.id,
                code: editingTerm.code,
                name: editingTerm.name,
                startDate: formatDate(editingTerm.startDate),
                endDate: formatDate(editingTerm.endDate),
                isActive: editingTerm.isActive,
              }
            : undefined
        }
        isSubmitting={saveTerm.isPending}
        error={saveTerm.error ? getApiErrorMessage(saveTerm.error) : null}
        onSubmit={(values) => saveTerm.mutate(values)}
      />
    </div>
  );
}
