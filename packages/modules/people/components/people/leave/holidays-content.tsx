"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PeopleShell } from "../people-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@corelithzw/ui/components/table";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

/**
 * The public holiday calendar.
 *
 * This is not decoration — it is what decides whether a Tuesday inside a leave
 * range costs a day. A missing holiday silently charges an employee annual leave
 * for a day nobody worked, so the screen says plainly which are seeded and which
 * are missing, rather than presenting a list that looks complete.
 *
 * Easter is deliberately not seeded. Getting a moveable feast wrong by a day
 * changes what leave costs, so the calendar carries only fixed dates and asks the
 * operator to add the rest.
 *
 * The table is full-bleed rather than boxed in a `Card`. A section shell around
 * a table adds a second border for no information; see the note in
 * `leave-content.tsx`.
 */

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
  const seededCount = holidays.filter((holiday) => holiday.isSeeded).length;

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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Calendar</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            A holiday inside a leave range does not cost a day. Add any that are
            missing before approving leave that spans them.
          </p>
        </div>
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

      <div>
        {holidaysQuery.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No holidays recorded for {year}. Every day in a leave range will
            count as leave until they are added.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>If worked</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-mono text-sm">
                        {new Date(holiday.date).toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {holiday.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {holiday.siteId ? "One site" : "Company-wide"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {holiday.doublePayIfWorked
                          ? "Double pay"
                          : "Normal pay"}
                      </TableCell>
                      <TableCell>
                        {holiday.isSeeded ? (
                          <Badge variant="secondary">Seeded</Badge>
                        ) : (
                          <Badge variant="outline">Added here</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {seededCount} of {holidays.length} were seeded as fixed dates.
              Good Friday and Easter Monday move each year and are not seeded —
              add them, or leave spanning them will be charged in full.
            </p>
          </>
        )}
      </div>
    </PeopleShell>
  );
}
