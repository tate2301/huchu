"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchSites, type Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  CheckCircle,
  Clock,
  Gavel,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from "@/lib/icons";

export type HrIncidentRecord = {
  id: string;
  incidentDate: string;
  category: "MISCONDUCT" | "ATTENDANCE" | "SAFETY_POLICY" | "PERFORMANCE" | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  title: string;
  description: string;
  investigationNotes: string | null;
  employee: {
    id: string;
    employeeId: string;
    name: string;
  };
  site: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  reportedBy: {
    id: string;
    name: string;
  } | null;
  resolvedBy: {
    id: string;
    name: string;
  } | null;
  _count: {
    actions: number;
  };
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type DisciplinaryActionRecord = {
  id: string;
  actionType: "WARNING" | "PENALTY" | "SUSPENSION" | "TERMINATION" | "OTHER";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED";
  summary: string;
  notes: string | null;
  effectiveDate: string | null;
  penaltyAmount: number;
  penaltyCurrency: string;
  penaltyStatus: "NONE" | "PENDING" | "DEDUCTED" | "PAID" | "WAIVED";
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  appliedBy: { id: string; name: string } | null;
  employee: { id: string; employeeId: string; name: string };
};

const CATEGORY_LABELS: Record<string, string> = {
  MISCONDUCT: "Misconduct",
  ATTENDANCE: "Attendance",
  SAFETY_POLICY: "Safety & Policy",
  PERFORMANCE: "Performance",
  OTHER: "General / Other",
};

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

  // Inspect & Disciplinary Action Timeline Drawer state
  const [selectedIncident, setSelectedIncident] = React.useState<HrIncidentRecord | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notesValue, setNotesValue] = React.useState("");

  // New Disciplinary Action sub-form state
  const [showAddActionForm, setShowAddActionForm] = React.useState(false);
  const [actionType, setActionType] = React.useState<DisciplinaryActionRecord["actionType"]>("WARNING");
  const [actionSummary, setActionSummary] = React.useState("");
  const [actionPenaltyAmount, setActionPenaltyAmount] = React.useState<number>(0);
  const [actionPenaltyCurrency, setActionPenaltyCurrency] = React.useState("USD");
  const [actionNotes, setActionNotes] = React.useState("");

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

  // Query disciplinary actions for the active incident
  const disciplinaryActionsQuery = useQuery({
    queryKey: ["disciplinary-actions", selectedIncident?.id],
    queryFn: async () => {
      if (!selectedIncident?.id) return [];
      const res = await fetchJson<{ data: DisciplinaryActionRecord[] }>(
        `/api/hr/disciplinary-actions?incidentId=${selectedIncident.id}&limit=50`
      );
      return res.data ?? [];
    },
    enabled: Boolean(selectedIncident?.id),
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

  const updateIncidentMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<HrIncidentRecord> }) =>
      fetchJson(`/api/hr/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, variables) => {
      toast({ title: "Incident updated successfully" });
      void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
      if (selectedIncident && selectedIncident.id === variables.id) {
        setSelectedIncident((prev) => (prev ? { ...prev, ...variables.patch } : null));
      }
      setEditingNotes(false);
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const createDisciplinaryActionMutation = useMutation({
    mutationFn: (values: {
      incidentId: string;
      employeeId: string;
      actionType: DisciplinaryActionRecord["actionType"];
      summary: string;
      penaltyAmount?: number;
      penaltyCurrency?: string;
      notes?: string;
    }) =>
      fetchJson("/api/hr/disciplinary-actions", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Disciplinary action recorded" });
      setShowAddActionForm(false);
      setActionSummary("");
      setActionNotes("");
      setActionPenaltyAmount(0);
      void queryClient.invalidateQueries({ queryKey: ["disciplinary-actions", selectedIncident?.id] });
      void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const transitionActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "approve" | "apply" }) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (_, variables) => {
      toast({ title: `Disciplinary action ${variables.action}ed successfully` });
      void queryClient.invalidateQueries({ queryKey: ["disciplinary-actions", selectedIncident?.id] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const handleOpenIncidentDetails = (incident: HrIncidentRecord) => {
    setSelectedIncident(incident);
    setNotesValue(incident.investigationNotes || "");
    setEditingNotes(false);
    setShowAddActionForm(false);
    setDetailDrawerOpen(true);
  };

  const handleExport = () => {
    const selectedRows = pageRows.filter((r) => selection.isSelected(r.id));
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "safety-incidents.csv",
      ["Date", "Title", "Category", "Severity", "Status", "Employee", "Site", "Disciplinary Actions"],
      target.map((r) => [
        new Date(r.incidentDate).toLocaleDateString("en-GB"),
        r.title,
        CATEGORY_LABELS[r.category] || r.category,
        r.severity,
        r.status,
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
    {
      key: "date",
      head: "Date",
      className: "mono muted",
      cell: (r) => (
        <span className="mono font-medium">
          {new Date(r.incidentDate).toLocaleDateString("en-GB")}
        </span>
      ),
    },
    {
      key: "category",
      head: "Category",
      cell: (r) => (
        <span
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: "var(--surface-sunken)",
            color: "var(--ink)",
            fontWeight: 500,
          }}
        >
          {CATEGORY_LABELS[r.category] || r.category}
        </span>
      ),
    },
    {
      key: "title",
      head: "Incident / Occurrence",
      cell: (r) => (
        <div>
          <button
            type="button"
            onClick={() => handleOpenIncidentDetails(r)}
            style={{
              all: "unset",
              cursor: "pointer",
              fontWeight: 600,
              color: "var(--ink)",
              display: "block",
            }}
            className="hover:underline"
          >
            {r.title}
          </button>
          {r.description ? (
            <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 2 }}>
              {r.description.length > 70 ? `${r.description.slice(0, 70)}...` : r.description}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "employee",
      head: "Employee involved",
      cell: (r) =>
        r.employee ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Person name={r.employee.name} size={24} />
            <div>
              <span className="who font-medium" style={{ display: "block", fontSize: 13 }}>
                {r.employee.name}
              </span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {r.employee.employeeId}
              </span>
            </div>
          </div>
        ) : (
          <None />
        ),
    },
    {
      key: "severity",
      head: "Severity",
      cell: (r) => {
        const tone =
          r.severity === "CRITICAL" || r.severity === "HIGH"
            ? "bad"
            : r.severity === "MEDIUM"
            ? "warn"
            : "info";
        return <St tone={tone}>{r.severity}</St>;
      },
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone =
          r.status === "CLOSED" ? "done" : r.status === "UNDER_REVIEW" ? "warn" : "bad";
        const label =
          r.status === "CLOSED" ? "Closed" : r.status === "UNDER_REVIEW" ? "Under Review" : "Open";
        return <St tone={tone}>{label}</St>;
      },
    },
    {
      key: "site",
      head: "Site / Facility",
      className: "muted",
      cell: (r) => r.site?.name || <None />,
    },
    {
      key: "actions",
      head: "Disciplinary actions",
      cell: (r) => {
        const count = r._count?.actions ?? 0;
        return count > 0 ? (
          <span
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: "var(--surface-warn-soft, #fef3c7)",
              color: "var(--ink)",
              fontWeight: 500,
            }}
          >
            {count} action{count > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            None
          </span>
        );
      },
    },
    {
      key: "inspect",
      head: "",
      right: true,
      cell: (r) => (
        <Button
          variant="quiet"
          onClick={() => handleOpenIncidentDetails(r)}
          style={{ fontSize: 12, padding: "2px 8px", height: 26 }}
        >
          Inspect ↗
        </Button>
      ),
    },
  ];

  return (
    <PeopleShell
      activeTab="incidents"
      title="Workforce Incidents & Disciplinary Actions"
      primary={{
        label: "Report incident",
        icon: "plus",
        shortcut: "N",
        onClick: () => setCreateDrawerOpen(true),
      }}
    >
      <BkPage screen="incidents" scroll={false}>
        <BkFinding
          fact={`${openCount} workforce incident${openCount === 1 ? "" : "s"} open or under review. ${criticalCount} marked high / critical severity.`}
          rest="Statutory workplace health & safety reporting with immutable disciplinary audit timeline and penalty tracking."
        />

        <BkTabs
          label="Incident views"
          value={tab}
          onChange={(v) => updateParam("tab", v)}
          items={[
            { value: "open", label: "Open & Under Review", count: openCount, icon: "issue" },
            { value: "all", label: "All incident logs", count: records.length, icon: "list" },
            {
              value: "closed",
              label: "Closed / Resolved",
              count: records.length - openCount,
              icon: "done",
            },
          ]}
        />

        <BkTools
          find="Search incidents by employee, title, description, site..."
          query={search}
          onFind={(q) => updateParam("search", q)}
          count={totalRows}
          filters={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BkFilter
                label="Severity"
                value={severityFilter === "ALL" ? "Any" : severityFilter}
                items={[
                  {
                    key: "ALL",
                    label: "Any severity",
                    checked: severityFilter === "ALL",
                    onSelect: () => updateParam("severity", "ALL"),
                  },
                  { separator: true },
                  {
                    key: "CRITICAL",
                    label: "Critical",
                    checked: severityFilter === "CRITICAL",
                    onSelect: () => updateParam("severity", "CRITICAL"),
                  },
                  {
                    key: "HIGH",
                    label: "High",
                    checked: severityFilter === "HIGH",
                    onSelect: () => updateParam("severity", "HIGH"),
                  },
                  {
                    key: "MEDIUM",
                    label: "Medium",
                    checked: severityFilter === "MEDIUM",
                    onSelect: () => updateParam("severity", "MEDIUM"),
                  },
                  {
                    key: "LOW",
                    label: "Low",
                    checked: severityFilter === "LOW",
                    onSelect: () => updateParam("severity", "LOW"),
                  },
                ]}
              />

              <BkFilter
                label="Category"
                value={categoryFilter === "ALL" ? "All categories" : CATEGORY_LABELS[categoryFilter] || categoryFilter}
                items={[
                  {
                    key: "ALL",
                    label: "All categories",
                    checked: categoryFilter === "ALL",
                    onSelect: () => updateParam("category", "ALL"),
                  },
                  { separator: true },
                  {
                    key: "SAFETY_POLICY",
                    label: "Safety & Policy",
                    checked: categoryFilter === "SAFETY_POLICY",
                    onSelect: () => updateParam("category", "SAFETY_POLICY"),
                  },
                  {
                    key: "MISCONDUCT",
                    label: "Misconduct",
                    checked: categoryFilter === "MISCONDUCT",
                    onSelect: () => updateParam("category", "MISCONDUCT"),
                  },
                  {
                    key: "ATTENDANCE",
                    label: "Attendance",
                    checked: categoryFilter === "ATTENDANCE",
                    onSelect: () => updateParam("category", "ATTENDANCE"),
                  },
                  {
                    key: "PERFORMANCE",
                    label: "Performance",
                    checked: categoryFilter === "PERFORMANCE",
                    onSelect: () => updateParam("category", "PERFORMANCE"),
                  },
                  {
                    key: "OTHER",
                    label: "General / Other",
                    checked: categoryFilter === "OTHER",
                    onSelect: () => updateParam("category", "OTHER"),
                  },
                ]}
              />
            </div>
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="workforce incidents"
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
                <BooksLoading />
              ) : (
                <div style={{ textAlign: "center", padding: "40px 16px" }}>
                  <ShieldCheck className="size-8 text-[var(--ink-4)]" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                    No workforce incidents reported.
                  </p>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Log operational safety occurrences, safety policy violations, or disciplinary matters using the button above.
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
          onPage={(p) => updateParam("page", String(p))}
        />

        <BkSelectionBar count={selection.selected.size} onClear={selection.clear}>
          <Button icon="export" onClick={handleExport}>
            Export ({selection.selected.size})
          </Button>
          <Button icon="done" onClick={() => void handleBulkClose()}>
            Mark Closed
          </Button>
        </BkSelectionBar>
      </BkPage>

      {/* Guided Drawer for reporting workforce incident */}
      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="Report Workforce Incident"
        sub="Statutory compliance record of incident, severity, involved personnel, and corrective notes."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <DrawerSection title="Involved Employee & Site">
            <Field label="Involved Employee *">
              <select
                className="select"
                value={newEmployeeId}
                onChange={(e) => setNewEmployeeId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select team member...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeId})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Operational Site">
              <select
                className="select"
                value={newSiteId}
                onChange={(e) => setNewSiteId(e.target.value)}
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

            <Field label="Incident Date *">
              <Input
                type="date"
                value={newIncidentDate}
                onChange={(e) => setNewIncidentDate(e.target.value)}
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Incident Classification">
            <Field label="Category *">
              <select
                className="select"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as HrIncidentRecord["category"])}
                style={{ width: "100%", height: 36 }}
              >
                <option value="SAFETY_POLICY">Safety & Policy</option>
                <option value="MISCONDUCT">Misconduct</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="OTHER">General / Other</option>
              </select>
            </Field>

            <Field label="Severity Rating">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                <Button
                  variant={newSeverity === "LOW" ? "primary" : "default"}
                  onClick={() => setNewSeverity("LOW")}
                >
                  Low
                </Button>
                <Button
                  variant={newSeverity === "MEDIUM" ? "primary" : "default"}
                  onClick={() => setNewSeverity("MEDIUM")}
                >
                  Medium
                </Button>
                <Button
                  variant={newSeverity === "HIGH" ? "primary" : "default"}
                  onClick={() => setNewSeverity("HIGH")}
                >
                  High
                </Button>
                <Button
                  variant={newSeverity === "CRITICAL" ? "danger" : "default"}
                  onClick={() => setNewSeverity("CRITICAL")}
                >
                  Critical
                </Button>
              </div>
            </Field>
          </DrawerSection>

          <DrawerSection title="Incident Details & Investigation">
            <Field label="Incident Title *">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Failure to wear PPE at Processing Plant ball mill"
              />
            </Field>

            <Field label="Full Description *">
              <textarea
                className="textarea"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What occurred, equipment involved, personnel impacted, immediate risks..."
                style={{ width: "100%" }}
              />
            </Field>

            <Field label="Initial Investigation Notes">
              <textarea
                className="textarea"
                rows={2}
                value={newInvestigationNotes}
                onChange={(e) => setNewInvestigationNotes(e.target.value)}
                placeholder="Supervisor interview observations, witnesses, immediate remedial actions..."
                style={{ width: "100%" }}
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <Button variant="quiet" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createIncidentMutation.isPending}
              disabled={!newTitle.trim() || !newDescription.trim() || !newEmployeeId}
              onClick={() => {
                createIncidentMutation.mutate({
                  title: newTitle.trim(),
                  employeeId: newEmployeeId,
                  siteId: newSiteId || undefined,
                  incidentDate: newIncidentDate,
                  category: newCategory,
                  severity: newSeverity,
                  description: newDescription.trim(),
                  investigationNotes: newInvestigationNotes.trim() || undefined,
                });
              }}
            >
              Submit incident log
            </Button>
          </div>
        </div>
      </Drawer>

      {/* Incident Details & Disciplinary Action Audit Timeline Drawer */}
      <Drawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        title={selectedIncident ? selectedIncident.title : "Incident Details"}
        sub={
          selectedIncident
            ? `Logged ${new Date(selectedIncident.createdAt).toLocaleDateString("en-GB")} | Category: ${CATEGORY_LABELS[selectedIncident.category]}`
            : undefined
        }
      >
        {selectedIncident && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header Status & Quick Actions */}
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <St
                  tone={
                    selectedIncident.status === "CLOSED"
                      ? "done"
                      : selectedIncident.status === "UNDER_REVIEW"
                      ? "warn"
                      : "bad"
                  }
                >
                  Status: {selectedIncident.status.replace("_", " ")}
                </St>
                <St
                  tone={
                    selectedIncident.severity === "CRITICAL" || selectedIncident.severity === "HIGH"
                      ? "bad"
                      : selectedIncident.severity === "MEDIUM"
                      ? "warn"
                      : "info"
                  }
                >
                  Severity: {selectedIncident.severity}
                </St>
              </div>

              {/* Status Switcher */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {selectedIncident.status !== "OPEN" && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      updateIncidentMutation.mutate({
                        id: selectedIncident.id,
                        patch: { status: "OPEN" },
                      })
                    }
                    busy={updateIncidentMutation.isPending}
                    style={{ fontSize: 12 }}
                  >
                    Set Open
                  </Button>
                )}
                {selectedIncident.status !== "UNDER_REVIEW" && (
                  <Button
                    variant="default"
                    onClick={() =>
                      updateIncidentMutation.mutate({
                        id: selectedIncident.id,
                        patch: { status: "UNDER_REVIEW" },
                      })
                    }
                    busy={updateIncidentMutation.isPending}
                    style={{ fontSize: 12 }}
                  >
                    Reviewing
                  </Button>
                )}
                {selectedIncident.status !== "CLOSED" && (
                  <Button
                    variant="primary"
                    onClick={() =>
                      updateIncidentMutation.mutate({
                        id: selectedIncident.id,
                        patch: { status: "CLOSED" },
                      })
                    }
                    busy={updateIncidentMutation.isPending}
                    style={{ fontSize: 12 }}
                  >
                    Close Incident
                  </Button>
                )}
              </div>
            </div>

            {/* Primary Incident Metadata */}
            <DrawerSection title="Incident Information">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <span className="muted" style={{ fontSize: 12, display: "block" }}>
                    Involved Employee
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Person name={selectedIncident.employee.name} size={24} />
                    <div>
                      <strong style={{ fontSize: 13 }}>{selectedIncident.employee.name}</strong>
                      <div className="mono muted" style={{ fontSize: 11 }}>
                        {selectedIncident.employee.employeeId}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="muted" style={{ fontSize: 12, display: "block" }}>
                    Operational Site
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 13, display: "block", marginTop: 4 }}>
                    {selectedIncident.site?.name || "Unassigned"}
                  </span>
                </div>

                <div>
                  <span className="muted" style={{ fontSize: 12, display: "block" }}>
                    Incident Date
                  </span>
                  <span className="mono" style={{ fontSize: 13, display: "block", marginTop: 4 }}>
                    {new Date(selectedIncident.incidentDate).toLocaleDateString("en-GB")}
                  </span>
                </div>

                <div>
                  <span className="muted" style={{ fontSize: 12, display: "block" }}>
                    Reported By
                  </span>
                  <span style={{ fontSize: 13, display: "block", marginTop: 4 }}>
                    {selectedIncident.reportedBy?.name || "System"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <span className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  Full Description
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.5,
                    padding: 10,
                    background: "var(--surface-sunken)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {selectedIncident.description}
                </p>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Investigation & Remedial Notes
                  </span>
                  {!editingNotes && (
                    <Button
                      variant="quiet"
                      onClick={() => setEditingNotes(true)}
                      style={{ fontSize: 12, padding: "0 6px", height: 22 }}
                    >
                      Edit notes
                    </Button>
                  )}
                </div>

                {editingNotes ? (
                  <div>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                      <Button variant="quiet" onClick={() => setEditingNotes(false)} style={{ fontSize: 12 }}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        busy={updateIncidentMutation.isPending}
                        onClick={() =>
                          updateIncidentMutation.mutate({
                            id: selectedIncident.id,
                            patch: { investigationNotes: notesValue },
                          })
                        }
                        style={{ fontSize: 12 }}
                      >
                        Save notes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.5,
                      padding: 10,
                      background: "var(--surface-sunken)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--line)",
                      color: selectedIncident.investigationNotes ? "var(--ink)" : "var(--ink-3)",
                      fontStyle: selectedIncident.investigationNotes ? "normal" : "italic",
                    }}
                  >
                    {selectedIncident.investigationNotes || "No investigation notes recorded yet."}
                  </p>
                )}
              </div>
            </DrawerSection>

            {/* Disciplinary Action Audit Timeline */}
            <DrawerSection title="Disciplinary Actions & Audit Timeline">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Gavel className="size-4 text-[var(--ink-3)]" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                    Actions linked to incident ({disciplinaryActionsQuery.data?.length ?? 0})
                  </span>
                </div>
                {!showAddActionForm && (
                  <Button
                    variant="default"
                    onClick={() => setShowAddActionForm(true)}
                    style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Plus className="size-3.5" />
                    <span>Log Action</span>
                  </Button>
                )}
              </div>

              {/* Form to log new disciplinary action */}
              {showAddActionForm && (
                <div
                  style={{
                    padding: 14,
                    background: "var(--surface-sunken)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--line)",
                    marginBottom: 16,
                  }}
                >
                  <h4 style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 600 }}>
                    Log New Disciplinary Action
                  </h4>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Action Type">
                      <select
                        className="select"
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value as DisciplinaryActionRecord["actionType"])}
                        style={{ width: "100%", height: 34, fontSize: 13 }}
                      >
                        <option value="WARNING">Formal Warning</option>
                        <option value="PENALTY">Financial Penalty / Fine</option>
                        <option value="SUSPENSION">Suspension</option>
                        <option value="TERMINATION">Termination</option>
                        <option value="OTHER">Other Disciplinary Measure</option>
                      </select>
                    </Field>

                    <Field label="Penalty Amount (optional)">
                      <div style={{ display: "flex", gap: 6 }}>
                        <select
                          className="select"
                          value={actionPenaltyCurrency}
                          onChange={(e) => setActionPenaltyCurrency(e.target.value)}
                          style={{ width: 80, height: 34, fontSize: 13 }}
                        >
                          <option value="USD">USD</option>
                          <option value="ZiG">ZiG</option>
                        </select>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={actionPenaltyAmount}
                          onChange={(e) => setActionPenaltyAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          style={{ height: 34 }}
                        />
                      </div>
                    </Field>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <Field label="Action Summary *">
                      <Input
                        value={actionSummary}
                        onChange={(e) => setActionSummary(e.target.value)}
                        placeholder="e.g. First written warning regarding PPE compliance breach"
                        style={{ height: 34 }}
                      />
                    </Field>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <Field label="Notes / Reason">
                      <textarea
                        className="textarea"
                        rows={2}
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Details of warning served, corrective action meeting..."
                        style={{ width: "100%", fontSize: 13 }}
                      />
                    </Field>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                    <Button variant="quiet" onClick={() => setShowAddActionForm(false)} style={{ fontSize: 12 }}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      busy={createDisciplinaryActionMutation.isPending}
                      disabled={!actionSummary.trim()}
                      onClick={() => {
                        createDisciplinaryActionMutation.mutate({
                          incidentId: selectedIncident.id,
                          employeeId: selectedIncident.employee.id,
                          actionType,
                          summary: actionSummary.trim(),
                          penaltyAmount: actionPenaltyAmount,
                          penaltyCurrency: actionPenaltyCurrency,
                          notes: actionNotes.trim() || undefined,
                        });
                      }}
                      style={{ fontSize: 12 }}
                    >
                      Save Disciplinary Action
                    </Button>
                  </div>
                </div>
              )}

              {/* List of disciplinary actions with audit timeline */}
              {disciplinaryActionsQuery.isLoading ? (
                <BooksLoading />
              ) : (disciplinaryActionsQuery.data?.length ?? 0) === 0 ? (
                <div style={{ textAlign: "center", padding: "16px", color: "var(--ink-3)", fontSize: 13 }}>
                  No disciplinary actions recorded for this incident.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {disciplinaryActionsQuery.data?.map((action) => {
                    const statusTone =
                      action.status === "APPLIED"
                        ? "done"
                        : action.status === "APPROVED"
                        ? "info"
                        : action.status === "SUBMITTED"
                        ? "warn"
                        : action.status === "REJECTED"
                        ? "bad"
                        : "void";

                    return (
                      <div
                        key={action.id}
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {/* Action Header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <strong style={{ fontSize: 14 }}>{action.actionType}</strong>
                            <St tone={statusTone}>{action.status}</St>
                          </div>
                          {action.penaltyAmount > 0 && (
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              Penalty: <Amt value={action.penaltyAmount} currency={action.penaltyCurrency} />
                            </div>
                          )}
                        </div>

                        <p style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                          {action.summary}
                        </p>

                        {action.notes && (
                          <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
                            {action.notes}
                          </p>
                        )}

                        {/* Audit Timeline Steps */}
                        <div
                          style={{
                            padding: "10px 12px",
                            background: "var(--surface-sunken)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: 12,
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Clock className="size-3.5 text-[var(--ink-3)]" />
                            <span>
                              <strong>Created:</strong> by {action.createdBy.name} on{" "}
                              <span className="mono">{new Date(action.createdAt).toLocaleDateString("en-GB")}</span>
                            </span>
                          </div>

                          {action.submittedAt && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Clock className="size-3.5 text-[var(--ink-3)]" />
                              <span>
                                <strong>Submitted:</strong> by {action.submittedBy?.name || "Approver"} on{" "}
                                <span className="mono">{new Date(action.submittedAt).toLocaleDateString("en-GB")}</span>
                              </span>
                            </div>
                          )}

                          {action.approvedAt && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <CheckCircle className="size-3.5 text-[var(--color-done)]" />
                              <span>
                                <strong>Approved:</strong> by {action.approvedBy?.name || "Manager"} on{" "}
                                <span className="mono">{new Date(action.approvedAt).toLocaleDateString("en-GB")}</span>
                              </span>
                            </div>
                          )}

                          {action.appliedAt && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <ShieldAlert className="size-3.5 text-[var(--color-primary)]" />
                              <span>
                                <strong>Applied to Payroll/File:</strong> by {action.appliedBy?.name || "HR Admin"} on{" "}
                                <span className="mono">{new Date(action.appliedAt).toLocaleDateString("en-GB")}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Lifecycle Action Buttons */}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
                          {(action.status === "DRAFT" || action.status === "REJECTED") && (
                            <Button
                              variant="default"
                              busy={transitionActionMutation.isPending}
                              onClick={() =>
                                transitionActionMutation.mutate({ id: action.id, action: "submit" })
                              }
                              style={{ fontSize: 12 }}
                            >
                              Submit for Approval
                            </Button>
                          )}

                          {action.status === "SUBMITTED" && (
                            <Button
                              variant="primary"
                              busy={transitionActionMutation.isPending}
                              onClick={() =>
                                transitionActionMutation.mutate({ id: action.id, action: "approve" })
                              }
                              style={{ fontSize: 12 }}
                            >
                              Approve Action
                            </Button>
                          )}

                          {action.status === "APPROVED" && (
                            <Button
                              variant="primary"
                              busy={transitionActionMutation.isPending}
                              onClick={() =>
                                transitionActionMutation.mutate({ id: action.id, action: "apply" })
                              }
                              style={{ fontSize: 12 }}
                            >
                              Apply Action
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DrawerSection>
          </div>
        )}
      </Drawer>
    </PeopleShell>
  );
}

export default function SafetyIncidentsPage() {
  return (
    <React.Suspense
      fallback={
        <PeopleShell activeTab="incidents" title="Workforce Incidents & Disciplinary Actions">
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
