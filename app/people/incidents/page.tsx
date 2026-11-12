"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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
  type BkTone,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { BooksLoading } from "@/components/books/books-state";
import {
  Button,
  ButtonGroup,
  Drawer,
  DrawerRow,
  DrawerSection,
  Field,
  Input,
  Person,
  Segmented,
  Select,
  TextArea,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchSites, type Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";

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

const CATEGORY_LABELS: Record<HrIncidentRecord["category"], string> = {
  SAFETY_POLICY: "Safety and policy",
  MISCONDUCT: "Misconduct",
  ATTENDANCE: "Attendance",
  PERFORMANCE: "Performance",
  OTHER: "Other",
};

type Severity = HrIncidentRecord["severity"];
type ActionStatus = DisciplinaryActionRecord["status"];

const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
const SEVERITY_TONE: Record<Severity, BkTone> = { LOW: "info", MEDIUM: "warn", HIGH: "bad", CRITICAL: "bad" };
const STATUS_LABEL: Record<HrIncidentRecord["status"], string> = { OPEN: "Open", UNDER_REVIEW: "Under review", CLOSED: "Closed" };
const STATUS_TONE: Record<HrIncidentRecord["status"], BkTone> = { OPEN: "bad", UNDER_REVIEW: "warn", CLOSED: "done" };

const ACTION_LABEL: Record<DisciplinaryActionRecord["actionType"], string> = {
  WARNING: "Warning",
  PENALTY: "Fine",
  SUSPENSION: "Suspension",
  TERMINATION: "Termination",
  OTHER: "Other",
};
const ACTION_STATUS_LABEL: Record<ActionStatus, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", APPLIED: "Applied" };
const ACTION_TONE: Record<ActionStatus, BkTone> = { DRAFT: "draft", SUBMITTED: "warn", APPROVED: "info", REJECTED: "bad", APPLIED: "done" };
const ACTION_DONE = { submit: "Sent for approval", approve: "Approved", apply: "Applied", reject: "Rejected" } as const;
const PENALTY_LABEL: Record<DisciplinaryActionRecord["penaltyStatus"], string> = {
  NONE: "",
  PENDING: "to settle",
  DEDUCTED: "deducted from pay",
  PAID: "paid",
  WAIVED: "waived",
};
/** How an approved penalty is settled when it is applied (the route takes the same three). */
const PENALTY_CHOICES = [
  { value: "DEDUCTED", label: "Deduct from pay" },
  { value: "PAID", label: "Mark as paid" },
  { value: "WAIVED", label: "Waive it" },
] as const;

/** The kit's status dot, for inside a drawer (the Books states are drawn only on the page). */
function Status({ tone, children }: { tone: BkTone; children: React.ReactNode }) {
  const kit = tone === "done" ? " status-success" : tone === "warn" ? " status-warning" : tone === "bad" ? " status-danger" : "";
  return <span className={`status${kit}`}>{children}</span>;
}

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
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");

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
    mutationFn: ({ id, action, body }: { id: string; action: "submit" | "approve" | "apply" | "reject"; body?: Record<string, unknown> }) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (_, variables) => {
      toast({ title: ACTION_DONE[variables.action] });
      setRejecting(null);
      setRejectNote("");
      void queryClient.invalidateQueries({ queryKey: ["disciplinary-actions", selectedIncident?.id] });
      void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
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

  const incident = selectedIncident;
  const incidentActions = disciplinaryActionsQuery.data ?? [];

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
            onOpen={handleOpenIncidentDetails}
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

      <Drawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        title={incident ? incident.title : "Incident"}
        sub={incident ? `${CATEGORY_LABELS[incident.category]}, ${day(incident.incidentDate)}` : undefined}
        width={640}
        footer={
          incident ? (
            <>
              {incident.status !== "OPEN" ? (
                <Button variant="quiet" busy={updateIncidentMutation.isPending} onClick={() => updateIncidentMutation.mutate({ id: incident.id, patch: { status: "OPEN" } })}>
                  Reopen
                </Button>
              ) : null}
              {incident.status === "OPEN" ? (
                <Button busy={updateIncidentMutation.isPending} onClick={() => updateIncidentMutation.mutate({ id: incident.id, patch: { status: "UNDER_REVIEW" } })}>
                  Start review
                </Button>
              ) : null}
              {incident.status !== "CLOSED" ? (
                <Button variant="primary" busy={updateIncidentMutation.isPending} onClick={() => updateIncidentMutation.mutate({ id: incident.id, patch: { status: "CLOSED" } })}>
                  Close incident
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {incident ? (
          <>
            <DrawerSection title="Incident">
              <DrawerRow label="Status">
                <Status tone={STATUS_TONE[incident.status]}>{STATUS_LABEL[incident.status]}</Status>
              </DrawerRow>
              <DrawerRow label="Severity">
                <Status tone={SEVERITY_TONE[incident.severity]}>{SEVERITY_LABEL[incident.severity]}</Status>
              </DrawerRow>
              <DrawerRow label="Employee">
                <Person name={incident.employee.name} sub={incident.employee.employeeId} />
              </DrawerRow>
              <DrawerRow label="Site">{incident.site?.name || "None"}</DrawerRow>
              <DrawerRow label="Reported by">{incident.reportedBy?.name || "System"}</DrawerRow>
              <p>{incident.description}</p>
            </DrawerSection>

            <DrawerSection title="Investigation notes">
              {editingNotes ? (
                <>
                  <TextArea rows={4} value={notesValue} onChange={(e) => setNotesValue(e.target.value)} />
                  <ButtonGroup>
                    <Button variant="quiet" onClick={() => setEditingNotes(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" busy={updateIncidentMutation.isPending} onClick={() => updateIncidentMutation.mutate({ id: incident.id, patch: { investigationNotes: notesValue } })}>
                      Save notes
                    </Button>
                  </ButtonGroup>
                </>
              ) : (
                <>
                  <p className={incident.investigationNotes ? undefined : "muted"}>{incident.investigationNotes || "None yet."}</p>
                  <Button variant="quiet" onClick={() => setEditingNotes(true)}>
                    Edit notes
                  </Button>
                </>
              )}
            </DrawerSection>

            <DrawerSection title={`Disciplinary actions (${incidentActions.length})`}>
              {disciplinaryActionsQuery.isLoading ? (
                <BooksLoading rows={3} />
              ) : incidentActions.length === 0 && !showAddActionForm ? (
                <p className="muted">None recorded.</p>
              ) : null}

              {incidentActions.map((action) => (
                <div key={action.id} className="dsec">
                  <DrawerRow label={ACTION_LABEL[action.actionType]}>
                    <Status tone={ACTION_TONE[action.status]}>{ACTION_STATUS_LABEL[action.status]}</Status>
                    {action.penaltyAmount > 0 ? (
                      <>
                        {" "}
                        <Amt value={action.penaltyAmount} currency={action.penaltyCurrency} /> <span className="muted">{PENALTY_LABEL[action.penaltyStatus]}</span>
                      </>
                    ) : null}
                  </DrawerRow>
                  <p>{action.summary}</p>
                  {action.notes ? <p className="muted">{action.notes}</p> : null}
                  <ul className="muted">
                    <li>
                      Logged by {action.createdBy.name}, <span className="mono">{day(action.createdAt)}</span>
                    </li>
                    {action.submittedAt ? (
                      <li>
                        Sent for approval by {action.submittedBy?.name ?? "someone"}, <span className="mono">{day(action.submittedAt)}</span>
                      </li>
                    ) : null}
                    {action.approvedAt ? (
                      <li>
                        Approved by {action.approvedBy?.name ?? "someone"}, <span className="mono">{day(action.approvedAt)}</span>
                      </li>
                    ) : null}
                    {action.appliedAt ? (
                      <li>
                        Applied by {action.appliedBy?.name ?? "someone"}, <span className="mono">{day(action.appliedAt)}</span>
                      </li>
                    ) : null}
                  </ul>

                  {rejecting === action.id ? (
                    <Field label="Why is it rejected?">
                      <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
                      <ButtonGroup>
                        <Button variant="quiet" onClick={() => setRejecting(null)}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          busy={transitionActionMutation.isPending}
                          disabled={!rejectNote.trim()}
                          onClick={() => transitionActionMutation.mutate({ id: action.id, action: "reject", body: { note: rejectNote.trim() } })}
                        >
                          Reject
                        </Button>
                      </ButtonGroup>
                    </Field>
                  ) : (
                    <ButtonGroup>
                      {action.status === "DRAFT" || action.status === "REJECTED" ? (
                        <Button busy={transitionActionMutation.isPending} onClick={() => transitionActionMutation.mutate({ id: action.id, action: "submit" })}>
                          Send for approval
                        </Button>
                      ) : null}
                      {action.status === "SUBMITTED" ? (
                        <>
                          <Button variant="quiet" onClick={() => setRejecting(action.id)}>
                            Reject
                          </Button>
                          <Button variant="primary" busy={transitionActionMutation.isPending} onClick={() => transitionActionMutation.mutate({ id: action.id, action: "approve" })}>
                            Approve
                          </Button>
                        </>
                      ) : null}
                      {action.status === "APPROVED" && action.penaltyAmount > 0 ? (
                        <MenuButton
                          variant="primary"
                          label="How the penalty is settled"
                          items={PENALTY_CHOICES.map((choice) => ({
                            key: choice.value,
                            label: choice.label,
                            onSelect: () => transitionActionMutation.mutate({ id: action.id, action: "apply", body: { penaltyStatus: choice.value } }),
                          }))}
                        >
                          Apply
                        </MenuButton>
                      ) : null}
                      {action.status === "APPROVED" && action.penaltyAmount <= 0 ? (
                        <Button variant="primary" busy={transitionActionMutation.isPending} onClick={() => transitionActionMutation.mutate({ id: action.id, action: "apply" })}>
                          Apply
                        </Button>
                      ) : null}
                    </ButtonGroup>
                  )}
                </div>
              ))}

              {showAddActionForm ? (
                <div className="dsec">
                  <Field label="Action">
                    <Select value={actionType} onChange={(e) => setActionType(e.target.value as DisciplinaryActionRecord["actionType"])}>
                      {(Object.keys(ACTION_LABEL) as Array<DisciplinaryActionRecord["actionType"]>).map((value) => (
                        <option key={value} value={value}>
                          {ACTION_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Summary">
                    <Input value={actionSummary} onChange={(e) => setActionSummary(e.target.value)} />
                  </Field>
                  <Field label="Penalty" optional>
                    <Input type="number" step="0.01" min="0" value={actionPenaltyAmount || ""} onChange={(e) => setActionPenaltyAmount(parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="Currency">
                    <Select value={actionPenaltyCurrency} onChange={(e) => setActionPenaltyCurrency(e.target.value)}>
                      <option value="USD">USD</option>
                      <option value="ZiG">ZiG</option>
                    </Select>
                  </Field>
                  <Field label="Notes" optional>
                    <TextArea rows={2} value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} />
                  </Field>
                  <ButtonGroup>
                    <Button variant="quiet" onClick={() => setShowAddActionForm(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      busy={createDisciplinaryActionMutation.isPending}
                      disabled={!actionSummary.trim()}
                      onClick={() =>
                        createDisciplinaryActionMutation.mutate({
                          incidentId: incident.id,
                          employeeId: incident.employee.id,
                          actionType,
                          summary: actionSummary.trim(),
                          penaltyAmount: actionPenaltyAmount,
                          penaltyCurrency: actionPenaltyCurrency,
                          notes: actionNotes.trim() || undefined,
                        })
                      }
                    >
                      Save
                    </Button>
                  </ButtonGroup>
                </div>
              ) : (
                <Button icon="add" onClick={() => setShowAddActionForm(true)}>
                  Log an action
                </Button>
              )}
            </DrawerSection>
          </>
        ) : null}
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
