"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { PeopleShell } from "@/components/people/people-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BkState } from "@/components/books/bk-list";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Holiday = {
  id: string;
  date: string;
  name: string;
  isPaid: boolean;
  doublePayIfWorked: boolean;
  siteId: string | null;
  isSeeded: boolean;
};

function currentYear() {
  return new Date().getUTCFullYear();
}

const holidayColumns: ColumnDef<Holiday>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-[var(--color-ink)]">
        {new Date(row.original.date).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        })}
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "Holiday",
    cell: ({ row }) => (
      <span className="text-sm font-medium text-[var(--color-ink)]">
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: "siteId",
    header: "Scope",
    cell: ({ row }) => (
      <span className="text-sm text-[var(--color-ink-2)]">
        {row.original.siteId ? "One site" : "Company-wide"}
      </span>
    ),
  },
  {
    accessorKey: "doublePayIfWorked",
    header: "If worked",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.doublePayIfWorked ? "Double pay" : "Normal pay"}
      </span>
    ),
  },
  {
    accessorKey: "isSeeded",
    header: "Source",
    cell: ({ row }) => (
      <BkState tone={row.original.isSeeded ? "plain" : "info"}>
        {row.original.isSeeded ? "Seeded" : "Added here"}
      </BkState>
    ),
  },
];

export function HolidaysContent() {
  const [year, setYear] = useState(String(currentYear()));

  const holidaysQuery = useQuery({
    queryKey: ["public-holidays", year],
    queryFn: () =>
      fetchJson<{ year: number; holidays: Holiday[] }>(
        `/api/people/leave/holidays?year=${year}`,
      ),
  });

  const years = useMemo(() => {
    const base = currentYear();
    return [base - 1, base, base + 1].map(String);
  }, []);

  const holidays = holidaysQuery.data?.holidays ?? [];

  return (
    <PeopleShell activeTab="holidays" title="Public holidays">
      {holidaysQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load the calendar</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(holidaysQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Calendar</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Year</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger size="sm" className="h-8 w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        {holidaysQuery.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <DataTable
            columns={holidayColumns}
            data={holidays}
            noResultsText={`No holidays recorded for ${year}.`}
          />
        )}
      </div>
    </PeopleShell>
  );
}
