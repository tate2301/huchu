"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { getApiErrorMessage } from "@/lib/api-client";
import { CALENDAR_KIND_LABELS } from "@/lib/schools/calendar-kinds";
import { zimbabwePublicHolidays } from "@/components/schools/academics/zimbabwe-public-holidays";
import {
  createSchoolsCalendarEvent,
  deleteSchoolsCalendarEvent,
  fetchSchoolsCalendar,
  type SchoolsCalendarEventRecord,
} from "@/lib/schools/admin-v2";
import {
  CalendarEventFormSheet,
  CALENDAR_KIND_OPTIONS,
  type CalendarEventFormValues,
} from "@/components/schools/academics/calendar-event-form-sheet";
import { AddPublicHolidaysDialog } from "@/components/schools/academics/add-public-holidays-dialog";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function day(value: string) {
  return value.slice(0, 10);
}

function monthKey(value: string) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

function range(value: SchoolsCalendarEventRecord) {
  const start = day(value.startDate);
  const end = day(value.endDate);
  return start === end ? start : `${start} → ${end}`;
}

/**
 * The school year's shape: holidays, half terms, exam weeks, staff days.
 *
 * This is what turns "no register for Form 2 on Tuesday" into either a
 * question for the class teacher or a public holiday nobody needs to chase.
 * Everything downstream — the attendance oversight page, term-day counts,
 * anything that says "school days" — reads its answer from these rows.
 *
 * Grouped by month rather than listed flat, because a year is eighty rows and
 * the only navigation anyone attempts on a calendar is "scroll to April".
 */
export function SchoolDaysContent() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [openFilter, setOpenFilter] = useState("");

  const calendarQuery = useQuery({
    queryKey: ["schools", "calendar", "events"],
    queryFn: () => fetchSchoolsCalendar(),
  });

  const events = useMemo(
    () => calendarQuery.data?.events ?? [],
    [calendarQuery.data],
  );

  const years = useMemo(() => {
    const seen = new Set<string>();
    for (const event of events) seen.add(day(event.startDate).slice(0, 4));
    return [...seen].sort().reverse();
  }, [events]);

  const visible = useMemo(
    () =>
      events.filter((event) => {
        if (kindFilter && event.kind !== kindFilter) return false;
        if (yearFilter && !day(event.startDate).startsWith(yearFilter)) return false;
        if (openFilter === "open" && !event.isTeachingDay) return false;
        if (openFilter === "closed" && event.isTeachingDay) return false;
        return true;
      }),
    [events, kindFilter, yearFilter, openFilter],
  );

  // Sorted by date rather than by name: a calendar read out of order is not a
  // calendar. Everything else in the pack sorts alphabetically; this is the
  // one place where the date *is* the identity.
  const grouped = useMemo(() => {
    const map = new Map<string, SchoolsCalendarEventRecord[]>();
    const sorted = [...visible].sort((a, b) =>
      day(a.startDate).localeCompare(day(b.startDate)),
    );
    for (const event of sorted) {
      const key = monthKey(event.startDate);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return [...map.entries()];
  }, [visible]);

  const createMutation = useMutation({
    mutationFn: (values: CalendarEventFormValues) =>
      createSchoolsCalendarEvent({
        title: values.title.trim(),
        kind: values.kind,
        startDate: values.startDate,
        endDate: values.endDate,
        isTeachingDay: values.isTeachingDay,
        notes: values.notes.trim() || null,
      }),
    onSuccess: () => {
      setSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["schools", "calendar"] });
    },
  });

  /**
   * The thirteen statutory days, in one press.
   *
   * Sequential rather than `Promise.all`: the API refuses a day that clashes
   * with one already on the calendar, and thirteen parallel writes turn "three
   * of these were already here" into thirteen indistinguishable rejections.
   * Each is tried on its own and the ones that were already entered are
   * counted, not treated as a failure.
   */
  const seedMutation = useMutation({
    mutationFn: async (year: number) => {
      let added = 0;
      let skipped = 0;
      const existing = new Set(
        events.map((event) => `${event.title.toLowerCase()}|${day(event.startDate)}`),
      );
      for (const holiday of zimbabwePublicHolidays(year)) {
        if (existing.has(`${holiday.title.toLowerCase()}|${holiday.date}`)) {
          skipped += 1;
          continue;
        }
        try {
          await createSchoolsCalendarEvent({
            title: holiday.title,
            kind: holiday.kind,
            startDate: holiday.date,
            endDate: holiday.date,
            isTeachingDay: false,
          });
          added += 1;
        } catch {
          // Already on the calendar under another spelling, or refused for a
          // reason the next one does not share. Counted, not fatal.
          skipped += 1;
        }
      }
      return { added, skipped };
    },
    onSuccess: () => {
      setHolidaysOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["schools", "calendar"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSchoolsCalendarEvent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "calendar"] });
    },
  });

  const closedDays = visible.filter((event) => !event.isTeachingDay).length;
  const narrowed = [
    CALENDAR_KIND_OPTIONS.find((option) => option.value === kindFilter)?.label,
    yearFilter,
    openFilter === "open" ? "School open" : openFilter === "closed" ? "School closed" : "",
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      {calendarQuery.error ? (
        <LoadError
          what="the school calendar"
          error={calendarQuery.error}
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : null}
      {/*
        Removing a day and adding one fail for different reasons — a delete is
        refused when registers already lean on the closure — so each says which
        one it was.
      */}
      {deleteMutation.error ? (
        <SaveError what="The calendar day" error={deleteMutation.error} />
      ) : null}
      {seedMutation.error ? (
        <SaveError what="The public holidays" error={seedMutation.error} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <FilterSelect
            label="Kind"
            allLabel="Anything"
            value={kindFilter}
            options={CALENDAR_KIND_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onChange={setKindFilter}
          />
          <FilterSelect
            label="School"
            allLabel="Open or shut"
            value={openFilter}
            options={[
              { value: "closed", label: "School closed" },
              { value: "open", label: "School open" },
            ]}
            onChange={setOpenFilter}
          />
          {years.length > 1 ? (
            <FilterSelect
              label="Year"
              allLabel="Every year"
              value={yearFilter}
              options={years.map((year) => ({ value: year, label: year }))}
              onChange={setYearFilter}
            />
          ) : null}
        </FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          {/* The statutory thirteen, which every school enters and nobody
              enjoys entering. Offered beside the hand-entered verb rather than
              instead of it — half terms and exam weeks are still a school's
              own. */}
          <CreateButton
            resource="schools.academics"
            label="Add the public holidays"
            onSelect={() => setHolidaysOpen(true)}
          />
          <CreateButton
            resource="schools.academics"
            label="Add a day"
            onSelect={() => setSheetOpen(true)}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {visible.length} entr{visible.length === 1 ? "y" : "ies"}, {closedDays} of
        which close the school.
      </p>

      {calendarQuery.isLoading ? (
        <TableRowsSkeleton
          headers={["Day", "Dates", "School"]}
          columns={[{ twoLine: true }, { width: 150 }, { width: 110, badge: true }]}
          rows={8}
        />
      ) : events.length === 0 ? (
        <NothingYet
          title="Nothing on the calendar yet"
          body={
            "Add the public holidays first — Heroes’ Day, Defence Forces Day and " +
            "the eleven others are the ones that make registers look missing. Half terms " +
            "like Mid-term break and exam weeks like Form 4 mock examinations are the " +
            "school’s own, so those go in by hand."
          }
        />
      ) : grouped.length === 0 ? (
        <NothingMatched
          what="days"
          filters={narrowed}
          onClear={() => {
            setKindFilter("");
            setYearFilter("");
            setOpenFilter("");
          }}
        />
      ) : (
        <MobileList>
          {grouped.map(([key, monthEvents]) => (
            <div key={key}>
              <MobileListSectionHeader>{monthLabel(key)}</MobileListSectionHeader>
              {monthEvents.map((event) => (
                <MobileList.Row
                  key={event.id}
                  static
                  title={event.title}
                  subtitle={
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {range(event)} · {CALENDAR_KIND_LABELS[event.kind]}
                        {event.term ? ` · ${event.term.name}` : ""}
                      </span>
                      {event.isTeachingDay ? (
                        <Badge tone="success">School open</Badge>
                      ) : (
                        <Badge tone="neutral">School closed</Badge>
                      )}
                      <RecordActions
                        resource="schools.academics"
                        verbs={[
                          {
                            label: "Remove",
                            action: "archive",
                            tone: "danger",
                            loading: deleteMutation.isPending,
                            confirm: {
                              title: `Remove ${event.title}?`,
                              description:
                                "The register board goes back to treating these as ordinary school days, and missing registers on them start being chased again.",
                              confirmLabel: "Remove the day",
                            },
                            onSelect: () => deleteMutation.mutate(event.id),
                          },
                        ]}
                      />
                    </span>
                  }
                />
              ))}
            </div>
          ))}
        </MobileList>
      )}

      <AddPublicHolidaysDialog
        open={holidaysOpen}
        onOpenChange={(open) => {
          setHolidaysOpen(open);
          if (!open) seedMutation.reset();
        }}
        isSubmitting={seedMutation.isPending}
        error={seedMutation.error ? getApiErrorMessage(seedMutation.error) : null}
        onSubmit={(year) => seedMutation.mutate(year)}
      />

      <CalendarEventFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isSubmitting={createMutation.isPending}
        error={createMutation.error ? getApiErrorMessage(createMutation.error) : null}
        onSubmit={(values) => createMutation.mutate(values)}
      />
    </div>
  );
}
