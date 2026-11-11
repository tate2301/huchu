"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BkFilter,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkTools,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { PeopleShell } from "@/components/people/people-shell";
import { fetchJson } from "@/lib/api-client";

type HolidayRow = {
  id: string;
  name: string;
  date: string;
  year: number;
  isObserved: boolean;
};

export function HolidaysContent() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState<number>(currentYear);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const holidaysQuery = useQuery({
    queryKey: ["people", "holidays", selectedYear],
    queryFn: () =>
      fetchJson<{ data: HolidayRow[] }>(
        `/api/v2/people/leave/holidays?year=${selectedYear}`
      ),
  });

  const holidays = React.useMemo(
    () => holidaysQuery.data?.data ?? [],
    [holidaysQuery.data]
  );

  const filtered = React.useMemo(() => {
    return holidays.filter((h) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return h.name.toLowerCase().includes(q) || h.date.includes(q);
    });
  }, [holidays, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      `statutory-holidays-${selectedYear}.csv`,
      ["Holiday Name", "Date", "Year", "Observed"],
      filtered.map((h) => [
        h.name,
        h.date,
        String(h.year),
        h.isObserved ? "Yes" : "No",
      ])
    );
  };

  const columns: Array<WsColumn<HolidayRow>> = [
    {
      key: "name",
      head: "Holiday name",
      cell: (h) => <span className="who" style={{ fontWeight: 500 }}>{h.name}</span>,
    },
    {
      key: "date",
      head: "Date",
      className: "muted mono",
      cell: (h) =>
        new Date(h.date).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
    },
    {
      key: "year",
      head: "Year",
      className: "muted mono",
      cell: (h) => h.year,
    },
    {
      key: "observed",
      head: "Status",
      cell: (h) => (
        <St tone={h.isObserved ? "done" : "void"}>
          {h.isObserved ? "Official Statutory" : "Non-working"}
        </St>
      ),
    },
  ];

  return (
    <PeopleShell
      activeTab="holidays"
      title="Public Holidays"
      primary={{
        label: "Export holidays",
        icon: "export",
        shortcut: "E",
        onClick: handleExport,
      }}
    >
      <BkPage screen="leave" scroll={false}>
        <BkFinding
          fact={`${holidays.length} statutory public holidays configured for calendar year ${selectedYear}.`}
          rest="Statutory holidays are automatically excluded from employee leave working-day balance calculations."
        />

        <BkTools
          find="Search holidays..."
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <BkFilter
              label="Calendar year"
              value={String(selectedYear)}
              items={[currentYear - 1, currentYear, currentYear + 1].map((yr) => ({
                key: String(yr),
                label: `Year ${yr}`,
                checked: selectedYear === yr,
                onSelect: () => {
                  setSelectedYear(yr);
                  setPage(1);
                },
              }))}
            />
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="statutory holidays"
            rows={pageRows}
            rowKey={(h) => h.id}
            columns={columns}
            empty={
              holidaysQuery.isLoading ? (
                "Loading holidays..."
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No holidays configured for year {selectedYear}.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Statutory public holidays will be populated by company payroll calendar settings.
                  </p>
                </div>
              )
            }
          />
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />
      </BkPage>
    </PeopleShell>
  );
}
