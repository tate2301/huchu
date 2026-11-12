"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkEmpty,
  BkFilter,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { BooksLoading } from "@/components/books/books-state";
import { Button, Check, Drawer, DrawerSection, Field, Input, Select } from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites, type Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";

type HolidayRow = {
  id: string;
  name: string;
  date: string;
  isPaid: boolean;
  doublePayIfWorked: boolean;
  siteId: string | null;
};

export function HolidaysContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState<number>(currentYear);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const [addOpen, setAddOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [isPaid, setIsPaid] = React.useState(true);
  const [doublePay, setDoublePay] = React.useState(false);
  const [siteId, setSiteId] = React.useState("");

  const holidaysQuery = useQuery({
    queryKey: ["people", "holidays", selectedYear],
    queryFn: () => fetchJson<{ holidays: HolidayRow[] }>(`/api/people/leave/holidays?year=${selectedYear}`),
  });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => fetchSites() }).data ?? [];
  const siteName = (id: string | null) => sites.find((site: Site) => site.id === id)?.name;

  const holidays = React.useMemo(() => holidaysQuery.data?.holidays ?? [], [holidaysQuery.data]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? holidays.filter((h) => h.name.toLowerCase().includes(q) || h.date.includes(q)) : holidays;
  }, [holidays, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  const addHoliday = useMutation({
    mutationFn: () =>
      fetchJson("/api/people/leave/holidays", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), date, isPaid, doublePayIfWorked: doublePay, siteId: siteId || null }),
      }),
    onSuccess: () => {
      toast({ title: "Holiday added" });
      setAddOpen(false);
      setName("");
      setDate("");
      setIsPaid(true);
      setDoublePay(false);
      setSiteId("");
      void queryClient.invalidateQueries({ queryKey: ["people", "holidays"] });
    },
    onError: (err) => toast({ title: getApiErrorMessage(err), variant: "destructive" }),
  });

  const handleExport = () => {
    downloadCsv(
      `public-holidays-${selectedYear}.csv`,
      ["Holiday", "Date", "Paid", "Double pay if worked", "Site"],
      filtered.map((h) => [h.name, h.date.slice(0, 10), h.isPaid ? "Yes" : "No", h.doublePayIfWorked ? "Yes" : "No", siteName(h.siteId) ?? "All sites"])
    );
  };

  const columns: Array<WsColumn<HolidayRow>> = [
    { key: "name", head: "Holiday", cell: (h) => h.name },
    { key: "date", head: "Date", className: "mono", cell: (h) => shortDay(h.date.slice(0, 10)) },
    { key: "paid", head: "Pay", cell: (h) => <St tone={h.isPaid ? "done" : "void"}>{h.isPaid ? "Paid" : "Unpaid"}</St> },
    { key: "double", head: "Double pay if worked", className: "muted", cell: (h) => (h.doublePayIfWorked ? "Yes" : <None />) },
    { key: "site", head: "Site", className: "muted", cell: (h) => siteName(h.siteId) ?? "All sites" },
  ];

  return (
    <PeopleShell
      activeTab="holidays"
      title="Public holidays"
      primary={{ label: "Add a holiday", icon: "plus", shortcut: "N", onClick: () => setAddOpen(true) }}
    >
      <BkPage screen="leave" scroll={false}>
        <BkFinding fact={`${holidays.length} public ${holidays.length === 1 ? "holiday" : "holidays"} in ${selectedYear}.`} />

        <BkTools
          find="Search holidays"
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <BkFilter
              label="Year"
              value={String(selectedYear)}
              items={[currentYear - 1, currentYear, currentYear + 1].map((yr) => ({
                key: String(yr),
                label: String(yr),
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
            label="public holidays"
            rows={pageRows}
            rowKey={(h) => h.id}
            columns={columns}
            empty={
              holidaysQuery.isLoading ? (
                <BooksLoading />
              ) : (
                <BkEmpty action={<Button onClick={() => setAddOpen(true)}>Add a holiday</Button>}>No holidays in {selectedYear}.</BkEmpty>
              )
            }
          />
        </BkScroll>

        <BkPager page={page} size={pageSize} total={totalRows} onPage={setPage} />
      </BkPage>

      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a holiday"
        footer={
          <>
            <Button variant="quiet" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" busy={addHoliday.isPending} disabled={!name.trim() || !date} onClick={() => addHoliday.mutate()}>
              Add
            </Button>
          </>
        }
      >
        <DrawerSection title="Holiday">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Site" optional>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All sites</option>
              {sites.map((site: Site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          </Field>
          <Check checked={isPaid} onCheckedChange={setIsPaid} label="Paid day off" />
          <Check checked={doublePay} onCheckedChange={setDoublePay} label="Double pay if worked" />
        </DrawerSection>
      </Drawer>
    </PeopleShell>
  );
}
