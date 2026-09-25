"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
  type RecordListRow,
} from "@/components/management/ui";
import {
  TermFormSheet,
  type TermFormValues,
} from "@/components/schools/academics/term-form-sheet";
import {
  AcademicYearFormSheet,
  type AcademicYearFormValues,
} from "@/components/schools/academics/academic-year-form-sheet";
import { ManagementShell } from "@/components/settings/management-shell";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Archive,
  Calendar,
  CalendarCheck,
  ListBullets,
  Plus,
  SlidersHorizontal,
} from "@/lib/icons";
import {
  createSchoolsAcademicYear,
  createSchoolsTerm,
  fetchSchoolsAcademicYears,
  updateSchoolsAcademicYear,
  type SchoolsAcademicYearRecord,
} from "@/lib/schools/admin-v2";

import {
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  MONO_CONTROL_CLASS,
  RecordEmpty,
} from "../classes/record-fields";

/**
 * Years and terms, as `Years.dc.html` draws it.
 *
 * A year is not a page of its own in the routing table, so the selection is
 * state rather than a URL segment — but it is the same register as the two
 * beside it: the list of years on the left, the year that is open on the
 * right, and its terms inside it rather than on a tab of their own. A term is
 * written *inside* a year, which is exactly where the board puts it.
 *
 * The holiday calendar that used to be a third tab here has its own route at
 * `/schools/calendar` and is reachable from this record's overflow; nothing was
 * dropped to make room for it.
 *
 * Presentation only. The query keys and the four API calls are the ones
 * `SchoolsYearsContent` and `SchoolsCalendarContent` already used.
 */

/** The terms a Zimbabwean school year is cut into — offered as one-press fills. */
const STANDARD_TERMS = [
  { code: "T1", name: "Term 1", label: "T1 - Term 1" },
  { code: "T2", name: "Term 2", label: "T2 - Term 2" },
  { code: "T3", name: "Term 3", label: "T3 - Term 3" },
];

/** ISO → `yyyy-mm-dd`, which is what a native date input wants. */
function toDateValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** `12 Jan – 2 Apr`, as the board writes a term's dates. */
function formatRange(start: string, end: string) {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "—";
  return `${DAY_MONTH.format(from)} – ${DAY_MONTH.format(to)}`;
}

export function YearsRegister() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const canCreate = access.can("schools.academics", "create");
  const canEdit = access.can("schools.academics", "edit");
  const canArchive = access.can("schools.academics", "archive");

  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<string | null>(null);
  const [yearSheetOpen, setYearSheetOpen] = React.useState(false);
  const [termSheetOpen, setTermSheetOpen] = React.useState(false);

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => fetchSchoolsAcademicYears({ page: 1, limit: 100 }),
  });

  const years = React.useMemo(
    () => yearsQuery.data?.data ?? [],
    [yearsQuery.data],
  );

  const visible = React.useMemo(() => {
    const typed = search.trim().toLowerCase();
    if (!typed) return years;
    return years.filter((row) =>
      `${row.name} ${row.code}`.toLowerCase().includes(typed),
    );
  }, [years, search]);

  // The current year leads, because it is the one a registrar opened this
  // screen to look at. A year that has been deleted falls back the same way.
  const selected: SchoolsAcademicYearRecord | null =
    years.find((row) => row.id === picked) ??
    years.find((row) => row.isActive) ??
    years[0] ??
    null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "academic-years"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "terms"] });
  }

  const patchYear = useMutation({
    mutationFn: (input: {
      id: string;
      values: Partial<{
        code: string;
        name: string;
        startDate: string;
        endDate: string;
        isActive: boolean;
      }>;
    }) => updateSchoolsAcademicYear(input.id, input.values),
    onSuccess: invalidate,
  });

  const createYear = useMutation({
    mutationFn: (values: AcademicYearFormValues) => createSchoolsAcademicYear(values),
    onSuccess: () => {
      setYearSheetOpen(false);
      invalidate();
    },
  });

  const deleteYear = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/academic-years/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPicked(null);
      invalidate();
    },
  });

  const createTerm = useMutation({
    mutationFn: (values: TermFormValues) => createSchoolsTerm(values),
    onSuccess: () => {
      setTermSheetOpen(false);
      invalidate();
    },
  });

  const state: ListColumnState = yearsQuery.isLoading
    ? "loading"
    : yearsQuery.isError
      ? "failed"
      : visible.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  const termRows = (selected?.terms ?? []).map(
    (term): RecordListRow => ({
      id: term.id,
      code: term.code,
      name: formatRange(term.startDate, term.endDate),
      value: {
        kind: "status",
        tone: term.isActive ? "success" : "neutral",
        label: term.isActive ? "Running" : "Closed",
      },
    }),
  );

  return (
    /* The surface's content column. `SettingsFrame` looks for a
       `RegisterLayout` among its children and hands it the row whole — the
       dialogs beside it portal out and occupy none of it. */
    <ManagementShell railCounts={{ "schools-years": years.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Years and terms"
            noun="academic year"
            count={yearsQuery.isLoading ? undefined : years.length}
            state={state}
            /* No column header line: a year row carries no value column, and a
               header naming a column that is not there is the rule drawn
               wrong. The board agrees. */
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search name or code",
            }}
            onNew={canCreate ? () => setYearSheetOpen(true) : undefined}
            onRetry={() => void yearsQuery.refetch()}
            emptyLabel="No academic years"
            emptyIcon={Calendar}
          >
            {visible.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                onSelect={() => setPicked(row.id)}
                selected={row.id === selected?.id}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <RecordHeader
              title={selected.name}
              icon={Calendar}
              onRename={
                canEdit
                  ? (next) => patchYear.mutate({ id: selected.id, values: { name: next } })
                  : undefined
              }
              renameLabel="Rename the academic year"
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Closed
                </StatusBadge>
              }
              action={
                canEdit ? (
                  <HeaderAction
                    icon={selected.isActive ? Archive : CalendarCheck}
                    onClick={() => {
                      void (async () => {
                        if (selected.isActive) {
                          const confirmed = await dsConfirm({
                            title: `Close ${selected.name}?`,
                            description:
                              "Everything already dated against the year stays. New enrolments, invoices and mark sheets stop defaulting to it.",
                            confirmLabel: "Close the year",
                            variant: "warning",
                          });
                          if (!confirmed) return;
                        }
                        patchYear.mutate({
                          id: selected.id,
                          values: { isActive: !selected.isActive },
                        });
                      })();
                    }}
                  >
                    {selected.isActive ? "Close the year" : "Make it current"}
                  </HeaderAction>
                ) : undefined
              }
              overflow={
                <>
                  {/* Rolling every child up a form is the one thing that
                      happens *because* a year ended, and this is the screen
                      that ends one. It keeps its own page: it touches every
                      pupil's record. */}
                  <DropdownMenuItem asChild>
                    <Link href="/schools/students/roll-up">Roll up the year</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/schools/calendar">The school calendar</Link>
                  </DropdownMenuItem>
                  {canArchive ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        void (async () => {
                          const confirmed = await dsConfirm({
                            title: `Delete ${selected.name}?`,
                            description:
                              "The year leaves the calendar entirely. It is refused while any term, enrolment or invoice is still dated against it.",
                            confirmLabel: "Delete the year",
                            variant: "danger",
                          });
                          if (confirmed) deleteYear.mutate(selected.id);
                        })();
                      }}
                    >
                      Delete the year
                    </DropdownMenuItem>
                  ) : null}
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailField label="Name">
                {(id) => (
                  <InlineText
                    id={id}
                    disabled={!canEdit}
                    value={selected.name}
                    onCommit={(next) =>
                      patchYear.mutate({ id: selected.id, values: { name: next.trim() } })
                    }
                  />
                )}
              </DetailField>
              <DetailField label="Starts">
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    disabled={!canEdit}
                    className={MONO_CONTROL_CLASS}
                    value={toDateValue(selected.startDate)}
                    onChange={(event) =>
                      patchYear.mutate({
                        id: selected.id,
                        values: { startDate: event.target.value },
                      })
                    }
                  />
                )}
              </DetailField>
              <DetailField label="Ends">
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    disabled={!canEdit}
                    className={MONO_CONTROL_CLASS}
                    value={toDateValue(selected.endDate)}
                    onChange={(event) =>
                      patchYear.mutate({
                        id: selected.id,
                        values: { endDate: event.target.value },
                      })
                    }
                  />
                )}
              </DetailField>
              {/* Two states, not the board's three: the model carries
                  `isActive` and nothing that would tell a closed year from a
                  planned one. */}
              <DetailField label="Status">
                {(id) => (
                  <Select
                    value={selected.isActive ? "current" : "closed"}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      patchYear.mutate({
                        id: selected.id,
                        values: { isActive: value === "current" },
                      })
                    }
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </DetailField>
            </DetailGrid>

            <SectionHeading
              icon={ListBullets}
              count={selected.terms.length}
              action={
                canCreate ? (
                  <SectionAction icon={Plus} onClick={() => setTermSheetOpen(true)}>
                    Add a term
                  </SectionAction>
                ) : undefined
              }
            >
              Terms
            </SectionHeading>
            {/* `RecordList` draws its column rule and then nothing when it has
                no rows, which reads as a list that failed rather than a year
                whose terms have not been cut yet. The verb that fixes it is on
                the heading above, so this is one line and no illustration. */}
            {termRows.length === 0 ? (
              <RecordEmpty>No terms</RecordEmpty>
            ) : (
              <RecordList
                columns={{ row: "Dates", value: "Status" }}
                valueWidth={80}
                rows={termRows}
              />
            )}

            {/*
              The trail comes from the shared layer, which draws its own
              heading. `PlatformAuditEvent` is written for an academic year,
              but the only route that reads one record's events back is
              `/api/users/[id]/audit` — so the section says, accurately, that
              it has nothing rather than inventing rows, and makes no "chain
              verified" claim, which only a server walking `prevEventHash`
              could support.
            */}
            <ActivityTrail events={[]} />
          </>
        ) : (
          /* Below 900px `RegisterLayout` shows one column at a time and this
             one is not it. On a wide screen a year is always picked, so the
             only way here is a register with nothing in it yet. */
          <RecordEmpty>
            {yearsQuery.isLoading
              ? "Loading the years"
              : years.length === 0
                ? "No academic year is set up yet"
                : "Pick a year"}
          </RecordEmpty>
        )}
      </RegisterLayout>

      <AcademicYearFormSheet
        open={yearSheetOpen}
        onOpenChange={(open) => {
          setYearSheetOpen(open);
          if (!open) createYear.reset();
        }}
        isSubmitting={createYear.isPending}
        error={createYear.error ? getApiErrorMessage(createYear.error) : null}
        onSubmit={(values) => createYear.mutate(values)}
      />

      <TermFormSheet
        open={termSheetOpen}
        onOpenChange={(open) => {
          setTermSheetOpen(open);
          if (!open) createTerm.reset();
        }}
        /* The year the section heading belongs to, and only that one: "Add a
           term" was pressed inside a year, so the term lands in it rather than
           in whichever year happens to be current. */
        years={selected ? [selected] : years}
        presets={STANDARD_TERMS}
        existingTerms={(selected ? [selected] : years).flatMap((year) =>
          year.terms.map((term) => ({ code: term.code, academicYearId: year.id })),
        )}
        isSubmitting={createTerm.isPending}
        error={createTerm.error ? getApiErrorMessage(createTerm.error) : null}
        onSubmit={(values) => createTerm.mutate(values)}
      />
    </ManagementShell>
  );
}
