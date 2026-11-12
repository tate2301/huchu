"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkEmpty,
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
import { BooksLoading } from "@/components/books/books-state";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  Segmented,
  Select,
  TextArea,
  useSelection,
} from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchSites, type Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";
import {
  CATEGORY_LABELS,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type HrIncidentRecord,
  type Severity,
} from "@/lib/people/incidents";

const day = (value: string) => shortDay(value.slice(0, 10));

function SafetyIncidentsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL search params sync
  const tab = searchParams.get("tab") || "open";
  const search = searchParams.get("search") || "";
  const severityFilter = searchParams.get("severity") || "ALL";
  const categoryFilter = searchParams.get("category") || "ALL";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 15;

  const updateParam = React.useCallback(
    (key: string, val: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (!val || val === "ALL" || (key === "tab" && val === "open") || (key === "page" && val === "1") || (key === "search" && !val.trim())) {
        sp.delete(key);
      } else {
        sp.set(key, val);
      }
      if (key !== "page") {
        sp.delete("page");
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Creation Drawer state
  const [createDrawerOpen, setCreateDrawerOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newEmployeeId, setNewEmployeeId] = React.useState("");
  const [newSiteId, setNewSiteId] = React.useState("");
  const [newCategory, setNewCategory] = React.useState<HrIncidentRecord["category"]>("SAFETY_POLICY");
  const [newSeverity, setNewSeverity] = React.useState<HrIncidentRecord["severity"]>("MEDIUM");
  const [newIncidentDate, setNewIncidentDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [newDescription, setNewDescription] = React.useState("");
  const [newInvestigationNotes, setNewInvestigationNotes] = React.useState("");

  // Fetch incidents
  const incidentsQuery = useQuery({
    queryKey: ["hr-incidents"],
    queryFn: async () => {
      const res = await fetchJson<{ data: HrIncidentRecord[] }>("/api/hr/incidents?limit=200");
      return res.data ?? [];
    },
  });

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "safety-reporters"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });

  const records = React.useMemo(() => incidentsQuery.data ?? [], [incidentsQuery.data]);
  const sites = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = React.useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data]);

  const filtered = React.useMemo(() => {
    return records.filter((r) => {
      if (tab === "open" && r.status === "CLOSED") return false;
      if (tab === "closed" && r.status !== "CLOSED") return false;
      if (severityFilter !== "ALL" && r.severity !== severityFilter) return false;
      if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const t = (r.title || "").toLowerCase();
      const emp = (r.employee?.name || "").toLowerCase();
      const empId = (r.employee?.employeeId || "").toLowerCase();
      const site = (r.site?.name || "").toLowerCase();
      const desc = (r.description || "").toLowerCase();
      return t.includes(q) || emp.includes(q) || empId.includes(q) || site.includes(q) || desc.includes(q);
    });
  }, [records, tab, severityFilter, categoryFilter, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  // Mutations
  const createIncidentMutation = useMutation({
    mutationFn: (values: {
      employeeId: string;
      siteId?: string;
      incidentDate: string;
      category: HrIncidentRecord["category"];
      severity: HrIncidentRecord["severity"];
      title: string;
      description: string;
      investigationNotes?: string;
    }) =>
      fetchJson("/api/hr/incidents", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Incident reported successfully" });
      setCreateDrawerOpen(false);
      setNewTitle("");
      setNewEmployeeId("");
      setNewSiteId("");
      setNewDescription("");
      setNewInvestigationNotes("");
      void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const handleExport = () => {
    const selectedRows = pageRows.filter((r) => selection.isSelected(r.id));
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "safety-incidents.csv",
      ["Date", "Title", "Category", "Severity", "Status", "Employee", "Site", "Disciplinary actions"],
      target.map((r) => [
        day(r.incidentDate),
        r.title,
        CATEGORY_LABELS[r.category] || r.category,
        SEVERITY_LABEL[r.severity],
        STATUS_LABEL[r.status],
        r.employee?.name || "",
        r.site?.name || "",
        String(r._count?.actions ?? 0),
      ])
    );
  };

  const handleBulkClose = async () => {
    const selectedRows = pageRows.filter((r) => selection.isSelected(r.id));
    try {
      await Promise.all(
        selectedRows.map((r) =>
          fetchJson(`/api/hr/incidents/${r.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "CLOSED" }),
          })
        )
      );
      toast({
        title: `Closed ${selectedRows.length} incident record${selectedRows.length > 1 ? "s" : ""}`,
      });
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    } catch (err) {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    }
  };

  const openCount = records.filter((r) => r.status !== "CLOSED").length;
  const criticalCount = records.filter(
    (r) => (r.severity === "CRITICAL" || r.severity === "HIGH") && r.status !== "CLOSED"
  ).length;

  const columns: Array<WsColumn<HrIncidentRecord>> = [
    { key: "date", head: "Date", className: "mono", cell: (r) => day(r.incidentDate) },
    {
      key: "title",
      head: "Incident",
      cell: (r) => (
        <>
          {r.title}
          {r.description ? <span className="muted truncate"> {r.description}</span> : null}
        </>
      ),
    },
    {
      key: "employee",
      head: "Employee",
      cell: (r) =>
        r.employee ? (
          <Person name={r.employee.name} sub={r.employee.employeeId} />
        ) : (
          <None />
        ),
    },
    { key: "category", head: "Category", className: "muted", cell: (r) => CATEGORY_LABELS[r.category] ?? r.category },
    { key: "severity", head: "Severity", cell: (r) => <St tone={SEVERITY_TONE[r.severity]}>{SEVERITY_LABEL[r.severity]}</St> },
    { key: "status", head: "Status", cell: (r) => <St tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</St> },
    { key: "site", head: "Site", className: "muted", cell: (r) => r.site?.name || <None /> },
    { key: "actions", head: "Actions", right: true, className: "mono", cell: (r) => (r._count?.actions ? r._count.actions : <None />) },
  ];

  const filterItems = <K extends string>(current: string, key: string, all: string, labels: Record<K, string>): MenuEntry[] => [
    { key: "ALL", label: all, checked: current === "ALL", onSelect: () => updateParam(key, "ALL") },
    { separator: true },
    ...(Object.keys(labels) as K[]).map((value) => ({
      key: value,
      label: labels[value],
      checked: current === value,
      onSelect: () => updateParam(key, value),
    })),
  ];

  return (
    <PeopleShell
      activeTab="incidents"
      title="Incidents"
      primary={{ label: "Report an incident", icon: "plus", shortcut: "N", onClick: () => setCreateDrawerOpen(true) }}
    >
      <BkPage screen="incidents" scroll={false}>
        <BkFinding
          fact={`${openCount} ${openCount === 1 ? "incident" : "incidents"} open.`}
          rest={criticalCount ? `${criticalCount} high or critical.` : undefined}
        />

        <BkTabs
          label="Incident views"
          value={tab}
          onChange={(v) => updateParam("tab", v)}
          items={[
            { value: "open", label: "Open", count: openCount, icon: "issue" },
            { value: "all", label: "All", count: records.length, icon: "list" },
            { value: "closed", label: "Closed", count: records.length - openCount, icon: "done" },
          ]}
        />

        <BkTools
          find="Search incidents"
          query={search}
          onFind={(q) => updateParam("search", q)}
          count={totalRows}
          filters={
            <>
              <BkFilter label="Severity" value={severityFilter === "ALL" ? "Any" : SEVERITY_LABEL[severityFilter as Severity] ?? severityFilter} items={filterItems(severityFilter, "severity", "Any severity", SEVERITY_LABEL)} />
              <BkFilter label="Category" value={categoryFilter === "ALL" ? "Any" : CATEGORY_LABELS[categoryFilter as HrIncidentRecord["category"]] ?? categoryFilter} items={filterItems(categoryFilter, "category", "Any category", CATEGORY_LABELS)} />
            </>
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="incidents"
            rows={pageRows}
            rowKey={(r) => r.id}
            columns={columns}
            openHref={(r) => `/people/incidents/${r.id}`}
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
                <BooksLoading />
              ) : (
                <BkEmpty action={<Button onClick={() => setCreateDrawerOpen(true)}>Report an incident</Button>}>No incidents here.</BkEmpty>
              )
            }
          />
        </BkScroll>

        <BkPager page={page} size={pageSize} total={totalRows} onPage={(p) => updateParam("page", String(p))} />

        <BkSelectionBar count={selection.selected.size} onClear={selection.clear}>
          <Button icon="export" onClick={handleExport}>
            Export
          </Button>
          <Button icon="done" onClick={() => void handleBulkClose()}>
            Close
          </Button>
        </BkSelectionBar>
      </BkPage>

      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="Report an incident"
        footer={
          <>
            <Button variant="quiet" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createIncidentMutation.isPending}
              disabled={!newTitle.trim() || !newDescription.trim() || !newEmployeeId}
              onClick={() =>
                createIncidentMutation.mutate({
                  title: newTitle.trim(),
                  employeeId: newEmployeeId,
                  siteId: newSiteId || undefined,
                  incidentDate: newIncidentDate,
                  category: newCategory,
                  severity: newSeverity,
                  description: newDescription.trim(),
                  investigationNotes: newInvestigationNotes.trim() || undefined,
                })
              }
            >
              Report
            </Button>
          </>
        }
      >
        <DrawerSection title="Who and where">
          <Field label="Employee">
            <Select value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)}>
              <option value="">Choose</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeId})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Site" optional>
            <Select value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)}>
              <option value="">None</option>
              {sites.map((s: Site) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={newIncidentDate} onChange={(e) => setNewIncidentDate(e.target.value)} />
          </Field>
        </DrawerSection>

        <DrawerSection title="What kind">
          <Field label="Category">
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value as HrIncidentRecord["category"])}>
              {(Object.keys(CATEGORY_LABELS) as Array<HrIncidentRecord["category"]>).map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severity">
            <Segmented
              label="Severity"
              value={newSeverity}
              onChange={setNewSeverity}
              items={(Object.keys(SEVERITY_LABEL) as Severity[]).map((value) => ({ value, label: SEVERITY_LABEL[value] }))}
            />
          </Field>
        </DrawerSection>

        <DrawerSection title="What happened">
          <Field label="Title">
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={3} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </Field>
          <Field label="First notes" optional>
            <TextArea rows={2} value={newInvestigationNotes} onChange={(e) => setNewInvestigationNotes(e.target.value)} />
          </Field>
        </DrawerSection>
      </Drawer>

    </PeopleShell>
  );
}

export default function SafetyIncidentsPage() {
  return (
    <React.Suspense
      fallback={
        <PeopleShell activeTab="incidents" title="Incidents">
          <BkPage screen="incidents">
            <BooksLoading />
          </BkPage>
        </PeopleShell>
      }
    >
      <SafetyIncidentsContent />
    </React.Suspense>
  );
}
