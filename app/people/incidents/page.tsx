"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkFilter,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkSelectionBar,
  BkTabs,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchSites, type Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type IncidentRow = {
  id: string;
  incidentNumber: string;
  title: string;
  severity: "MINOR" | "MODERATE" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "CLOSED";
  occurredAt: string;
  description: string;
  actionTaken: string | null;
  site: { id: string; name: string } | null;
  reporter: { id: string; name: string } | null;
};

export default function SafetyIncidentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<string>("open");
  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<"MINOR" | "MODERATE" | "CRITICAL">("MINOR");
  const [siteId, setSiteId] = React.useState("");
  const [reporterId, setReporterId] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = React.useState("");
  const [actionTaken, setActionTaken] = React.useState("");

  const incidentsQuery = useQuery({
    queryKey: ["safety-incidents", tab],
    queryFn: () =>
      fetchJson<{ data: IncidentRow[] }>("/api/v2/people/incidents?limit=200"),
  });

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "safety-reporters"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });

  const records = React.useMemo(() => incidentsQuery.data?.data ?? [], [incidentsQuery.data]);
  const sites = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = React.useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data]
  );

  const filtered = React.useMemo(() => {
    return records.filter((r) => {
      if (tab === "open" && r.status === "CLOSED") return false;
      if (tab === "closed" && r.status !== "CLOSED") return false;
      if (severityFilter !== "ALL" && r.severity !== severityFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const num = (r.incidentNumber || "").toLowerCase();
      const t = r.title.toLowerCase();
      const site = (r.site?.name || "").toLowerCase();
      return num.includes(q) || t.includes(q) || site.includes(q);
    });
  }, [records, tab, severityFilter, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const createMutation = useMutation({
    mutationFn: (values: {
      title: string;
      severity: "MINOR" | "MODERATE" | "CRITICAL";
      siteId?: string;
      reporterId?: string;
      occurredAt: string;
      description: string;
      actionTaken?: string;
    }) =>
      fetchJson("/api/hr/incidents", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Incident reported successfully" });
      setDrawerOpen(false);
      setTitle("");
      setDescription("");
      setActionTaken("");
      void queryClient.invalidateQueries({ queryKey: ["safety-incidents"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const selectedRows = React.useMemo(
    () => pageRows.filter((r) => selection.isSelected(r.id)),
    [pageRows, selection]
  );

  const handleExport = () => {
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "safety-incidents.csv",
      ["Incident Ref", "Title", "Severity", "Status", "Site", "Date", "Reporter"],
      target.map((r) => [
        r.incidentNumber,
        r.title,
        r.severity,
        r.status,
        r.site?.name || "",
        r.occurredAt,
        r.reporter?.name || "",
      ])
    );
  };

  const handleBulkResolve = async () => {
    try {
      await Promise.all(
        selectedRows.map((r) =>
          fetchJson(`/api/hr/incidents/${r.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "RESOLVED" }),
          })
        )
      );
      toast({
        title: `Resolved ${selectedRows.length} incident record${selectedRows.length > 1 ? "s" : ""}`,
      });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["safety-incidents"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
  };

  const openCount = records.filter((r) => r.status !== "CLOSED").length;
  const criticalCount = records.filter((r) => r.severity === "CRITICAL" && r.status !== "CLOSED").length;

  const columns: Array<WsColumn<IncidentRow>> = [
    {
      key: "ref",
      head: "Ref",
      className: "muted mono",
      cell: (r) => <span className="bkw-ref">{r.incidentNumber}</span>,
    },
    {
      key: "title",
      head: "Incident / Occurrence",
      cell: (r) => (
        <span>
          <span className="who" style={{ display: "block", fontWeight: 500 }}>
            {r.title}
          </span>
          {r.description ? (
            <span className="muted" style={{ fontSize: 12 }}>
              {r.description.slice(0, 60)}...
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "severity",
      head: "Severity",
      cell: (r) => {
        const tone =
          r.severity === "CRITICAL" ? "bad" : r.severity === "MODERATE" ? "warn" : "info";
        return <St tone={tone}>{r.severity}</St>;
      },
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone =
          r.status === "CLOSED" ? "done" : r.status === "INVESTIGATING" ? "warn" : "bad";
        return <St tone={tone}>{r.status}</St>;
      },
    },
    {
      key: "site",
      head: "Site / Facility",
      className: "muted",
      cell: (r) => r.site?.name || <None />,
    },
    {
      key: "date",
      head: "Date occurred",
      className: "muted mono",
      cell: (r) => new Date(r.occurredAt).toLocaleDateString("en-GB"),
    },
    {
      key: "reporter",
      head: "Reported by",
      cell: (r) =>
        r.reporter ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Person name={r.reporter.name} size={24} />
            <span className="who">{r.reporter.name}</span>
          </span>
        ) : (
          <None />
        ),
    },
  ];

  return (
    <PeopleShell
      activeTab="incidents"
      primary={{
        label: "Report incident",
        icon: "plus",
        shortcut: "N",
        onClick: () => setDrawerOpen(true),
      }}
    >
      <BkPage screen="incidents" scroll={false}>
        <BkFinding
          fact={`${openCount} safety incidents open or under investigation. ${criticalCount} marked critical.`}
          rest="Statutory workplace health and safety compliance tracking with immediate supervisor notification."
        />

        <BkTabs
          label="Incident views"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={[
            { value: "open", label: "Open & Investigating", count: openCount, icon: "issue" },
            { value: "all", label: "All incident logs", count: records.length, icon: "list" },
            { value: "closed", label: "Closed / Resolved", count: records.length - openCount, icon: "done" },
          ]}
        />

        <BkTools
          find="Search incidents by reference, title, site..."
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <BkFilter
              label="Severity"
              value={severityFilter === "ALL" ? "Any" : severityFilter}
              items={[
                {
                  key: "ALL",
                  label: "Any severity",
                  checked: severityFilter === "ALL",
                  onSelect: () => {
                    setSeverityFilter("ALL");
                    setPage(1);
                  },
                },
                { separator: true },
                {
                  key: "CRITICAL",
                  label: "Critical",
                  checked: severityFilter === "CRITICAL",
                  onSelect: () => {
                    setSeverityFilter("CRITICAL");
                    setPage(1);
                  },
                },
                {
                  key: "MODERATE",
                  label: "Moderate",
                  checked: severityFilter === "MODERATE",
                  onSelect: () => {
                    setSeverityFilter("MODERATE");
                    setPage(1);
                  },
                },
                {
                  key: "MINOR",
                  label: "Minor",
                  checked: severityFilter === "MINOR",
                  onSelect: () => {
                    setSeverityFilter("MINOR");
                    setPage(1);
                  },
                },
              ]}
            />
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="safety incidents"
            rows={pageRows}
            rowKey={(r) => r.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (r) => r.title,
            }}
            empty={
              incidentsQuery.isLoading ? (
                "Loading incidents..."
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No safety incidents reported.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Log any operational occurrences or near-misses using the action above.
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

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
        >
          <Button icon="export" onClick={handleExport}>
            Export ({selection.selected.size})
          </Button>
          <Button icon="done" onClick={() => void handleBulkResolve()}>
            Mark Resolved
          </Button>
        </BkSelectionBar>
      </BkPage>

      {/* Guided Drawer for reporting safety incident */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Report Safety & Health Incident"
        sub="Formal statutory record of incident, severity, location, and remedial actions."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <DrawerSection title="Incident Details">
            <Field label="Incident Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Conveyor belt trip near Ball Mill 2"
              />
            </Field>

            <Field label="Severity Rating">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Button
                  variant={severity === "MINOR" ? "primary" : "default"}
                  onClick={() => setSeverity("MINOR")}
                >
                  • Minor
                </Button>
                <Button
                  variant={severity === "MODERATE" ? "primary" : "default"}
                  onClick={() => setSeverity("MODERATE")}
                >
                  • Moderate
                </Button>
                <Button
                  variant={severity === "CRITICAL" ? "danger" : "default"}
                  onClick={() => setSeverity("CRITICAL")}
                >
                  • Critical
                </Button>
              </div>
            </Field>

            <Field label="Date Occurred">
              <Input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Location & Reporter">
            <Field label="Operational Site">
              <select
                className="select"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select location site...</option>
                {sites.map((s: Site) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reported By">
              <select
                className="select"
                value={reporterId}
                onChange={(e) => setReporterId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select staff witness / reporter...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </DrawerSection>

          <DrawerSection title="Description & Corrective Actions">
            <Field label="Full Description">
              <textarea
                className="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What occurred, equipment involved, personnel impacted..."
                style={{ width: "100%" }}
              />
            </Field>

            <Field label="Immediate Actions Taken">
              <textarea
                className="textarea"
                rows={2}
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="e.g. Area cordoned off, supervisor informed, first aid provided"
                style={{ width: "100%" }}
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <Button variant="quiet" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createMutation.isPending}
              disabled={!title.trim() || !description.trim() || !siteId}
              onClick={() => {
                createMutation.mutate({
                  title: title.trim(),
                  severity,
                  siteId,
                  reporterId: reporterId || undefined,
                  occurredAt,
                  description: description.trim(),
                  actionTaken: actionTaken.trim() || undefined,
                });
              }}
            >
              Submit incident log
            </Button>
          </div>
        </div>
      </Drawer>
    </PeopleShell>
  );
}
