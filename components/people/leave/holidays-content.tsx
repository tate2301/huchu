"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BkChip,
  BkQuietTools,
  BkState,
  BkTools,
  downloadCsv,
} from "@/components/books/bk-list";
import {
  Kit,
  KitScreen,
  TableFoot,
  TableShell,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export function HolidaysContent() {
  const [year, setYear] = React.useState(String(currentYear()));
  const [search, setSearch] = React.useState("");

  const holidaysQuery = useQuery({
    queryKey: ["public-holidays", year],
    queryFn: () =>
      fetchJson<{ year: number; holidays: Holiday[] }>(
        `/api/people/leave/holidays?year=${year}`
      ),
  });

  const years = React.useMemo(() => {
    const base = currentYear();
    return [base - 1, base, base + 1].map(String);
  }, []);

  const holidays = React.useMemo(() => holidaysQuery.data?.holidays ?? [], [holidaysQuery.data]);

  const filteredHolidays = React.useMemo(() => {
    let list = [...holidays];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((h) => h.name.toLowerCase().includes(q));
    }
    return list;
  }, [holidays, search]);

  const handleExportCsv = () => {
    const csv = [
      ["Date", "Holiday", "Scope", "Double Pay If Worked", "Source"],
      ...filteredHolidays.map((h) => [
        h.date.slice(0, 10),
        h.name,
        h.siteId ? "One site" : "Company-wide",
        h.doublePayIfWorked ? "Yes" : "No",
        h.isSeeded ? "Seeded" : "Custom",
      ]),
    ];
    downloadCsv(`public-holidays-${year}.csv`, csv);
  };

  return (
    <PeopleShell activeTab="holidays" title="Public Holidays & Calendar">
      {holidaysQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load the calendar</AlertTitle>
          <AlertDescription>{getApiErrorMessage(holidaysQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TOOLBAR */}
            <BkTools
              find="Search public holidays..."
              query={search}
              onFind={setSearch}
              count={`${filteredHolidays.length} holidays`}
              chips={
                <BkChip
                  label="Year"
                  value={year}
                  set={year !== String(currentYear())}
                  items={years.map((opt) => ({
                    key: opt,
                    label: opt,
                    checked: year === opt,
                    onSelect: () => setYear(opt),
                  }))}
                />
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Public holidays"
              foot={
                <TableFoot
                  range={`${filteredHolidays.length} holidays in ${year}`}
                />
              }
            >
              {filteredHolidays.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No holidays found for {year}</b>
                  <p className="muted">Public holidays and company rest days for this year will appear here.</p>
                </div>
              ) : (
                <table className="table" aria-label="Public holidays">
                  <colgroup>
                    <col style={{ width: 160 }} />
                    <col style={{ width: 280 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Holiday</th>
                      <th>Scope</th>
                      <th>If worked</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHolidays.map((holiday) => (
                      <tr key={holiday.id}>
                        <td className="mono" style={{ fontSize: 13, color: "var(--color-ink)" }}>
                          {new Date(holiday.date).toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td>
                          <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                            {holiday.name}
                          </span>
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: 13 }}>
                            {holiday.siteId ? "One site" : "Company-wide"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 13 }}>
                            {holiday.doublePayIfWorked ? "Double pay" : "Normal pay"}
                          </span>
                        </td>
                        <td>
                          <BkState tone={holiday.isSeeded ? "plain" : "info"}>
                            {holiday.isSeeded ? "Seeded" : "Custom"}
                          </BkState>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableShell>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
