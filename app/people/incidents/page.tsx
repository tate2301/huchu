"use client";

import * as React from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkChip,
  BkQuietTools,
  BkState,
  BkTabs,
  BkTools,
  downloadCsv,
} from "@/components/books/bk-list";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEmployees,
  fetchHrIncidents,
  fetchSites,
  type HrIncidentRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type IncidentTab = "open" | "review" | "closed";

const SEVERITY_TONE: Record<string, "plain" | "info" | "warning" | "danger"> = {
  LOW: "plain",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

export default function IncidentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<IncidentTab>("open");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedIncident, setSelectedIncident] = React.useState<HrIncidentRecord | null>(null);
  const [formTitle, setFormTitle] = React.useState("");
  const [formType, setFormType] = React.useState("SAFETY");
  const [formSeverity, setFormSeverity] = React.useState("MEDIUM");
  const [formEmployeeId, setFormEmployeeId] = React.useState("");
  const [formSiteId, setFormSiteId] = React.useState("");
  const [formDate, setFormDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [formDescription, setFormDescription] = React.useState("");

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "incident-picker"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });
  const employees = React.useMemo(() => employeesData?.data ?? [], [employeesData]);

  const { data: sitesData } = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
  });
  const sites = React.useMemo(() => sitesData ?? [], [sitesData]);

  const { data: incidentsData } = useQuery({
    queryKey: ["hr-incidents", search],
    queryFn: () =>
      fetchHrIncidents({
        search: search.trim() || undefined,
        limit: 300,
      }),
  });
  const incidents = React.useMemo(() => incidentsData?.data ?? [], [incidentsData]);

  // Counts
  const openCount = React.useMemo(() => incidents.filter((i) => i.status === "OPEN").length, [incidents]);
  const reviewCount = React.useMemo(() => incidents.filter((i) => i.status === "UNDER_REVIEW").length, [incidents]);
  const closedCount = React.useMemo(() => incidents.filter((i) => i.status === "CLOSED").length, [incidents]);

  // Filtering
  const filteredIncidents = React.useMemo(() => {
    let list = [...incidents];
    if (tab === "open") list = list.filter((i) => i.status === "OPEN");
    else if (tab === "review") list = list.filter((i) => i.status === "UNDER_REVIEW");
    else if (tab === "closed") list = list.filter((i) => i.status === "CLOSED");

    if (severityFilter !== "all") {
      list = list.filter((i) => i.severity === severityFilter);
    }
    return list;
  }, [incidents, tab, severityFilter]);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredIncidents.length);
  const pagedIncidents = React.useMemo(
    () => filteredIncidents.slice((page - 1) * pageSize, page * pageSize),
    [filteredIncidents, page, pageSize]
  );

  const ids = React.useMemo(() => pagedIncidents.map((i) => i.id), [pagedIncidents]);
  const selection = useSelection(ids);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/hr/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: formTitle,
          incidentType: formType,
          severity: formSeverity,
          employeeId: formEmployeeId || undefined,
          siteId: formSiteId || undefined,
          incidentDate: formDate,
          description: formDescription,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Incident report logged", variant: "success" });
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    },
    onError: (err) => {
      toast({ title: "Unable to log incident", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      fetchJson(`/api/hr/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast({ title: "Incident status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    },
  });

  const handleOpenCreate = () => {
    setFormTitle("");
    setFormType("SAFETY");
    setFormSeverity("MEDIUM");
    setFormEmployeeId(employees[0]?.id || "");
    setFormSiteId(sites[0]?.id || "");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormDescription("");
    setDrawerOpen(true);
  };

  const handleExportCsv = () => {
    const csv = [
      ["Title", "Type", "Severity", "Date", "Status", "Employee", "Site", "Description"],
      ...filteredIncidents.map((i) => [
        i.title,
        i.incidentType,
        i.severity,
        i.incidentDate.slice(0, 10),
        i.status,
        i.employee?.name || "",
        i.site?.name || "",
        i.description || "",
      ]),
    ];
    downloadCsv(`workplace-incidents-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const severityLabel =
    severityFilter === "all"
      ? "All severities"
      : severityFilter.charAt(0) + severityFilter.slice(1).toLowerCase();

  return (
    <PeopleShell
      activeTab="incidents"
      title="Workplace Safety & Incidents"
      actions={
        <Button variant="primary" icon="plus" shortcut="N" onClick={handleOpenCreate}>
          Report incident
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Incident views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "open", label: "Open incidents", count: openCount },
                { value: "review", label: "Under review", count: reviewCount },
                { value: "closed", label: "Resolved & Closed", count: closedCount },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search incidents by employee, title, site..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredIncidents.length} of ${incidents.length}`}
              chips={
                <BkChip
                  label="Severity"
                  value={severityLabel}
                  set={severityFilter !== "all"}
                  items={[
                    { key: "all", label: "All severities", checked: severityFilter === "all", onSelect: () => setSeverityFilter("all") },
                    { separator: true },
                    { key: "LOW", label: "Low", checked: severityFilter === "LOW", onSelect: () => setSeverityFilter("LOW") },
                    { key: "MEDIUM", label: "Medium", checked: severityFilter === "MEDIUM", onSelect: () => setSeverityFilter("MEDIUM") },
                    { key: "HIGH", label: "High", checked: severityFilter === "HIGH", onSelect: () => setSeverityFilter("HIGH") },
                    { key: "CRITICAL", label: "Critical", checked: severityFilter === "CRITICAL", onSelect: () => setSeverityFilter("CRITICAL") },
                  ]}
                />
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Incidents register"
              foot={
                <TableFoot
                  range={filteredIncidents.length === 0 ? "None" : `${from} to ${to} of ${filteredIncidents.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredIncidents.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selection.selected.size,
                    onClear: selection.clear,
                    actions: (
                      <Button icon="export" onClick={handleExportCsv}>
                        Export selected
                      </Button>
                    ),
                  }}
                />
              }
            >
              {filteredIncidents.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No workplace incidents reported</b>
                  <p className="muted">Use Report incident above to document safety and compliance issues.</p>
                </div>
              ) : (
                <table className="table" aria-label="Incidents register">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 260 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 60 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all incidents"
                      />
                      <th>Incident & Date</th>
                      <th>Staff involved</th>
                      <th>Site</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedIncidents.map((incident) => {
                      const isSelected = selection.isSelected(incident.id);
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "details",
                          label: "View details",
                          icon: "invoice",
                          onSelect: () => setSelectedIncident(incident),
                        },
                        { separator: true },
                        ...(incident.status === "OPEN"
                          ? [
                              {
                                key: "investigate",
                                label: "Mark under review",
                                icon: "pencil" as const,
                                onSelect: () => updateStatusMutation.mutate({ id: incident.id, status: "UNDER_REVIEW" }),
                              },
                            ]
                          : []),
                        ...(incident.status !== "CLOSED"
                          ? [
                              {
                                key: "close",
                                label: "Resolve & Close",
                                icon: "check" as const,
                                onSelect: () => updateStatusMutation.mutate({ id: incident.id, status: "CLOSED" }),
                              },
                            ]
                          : []),
                      ];

                      return (
                        <tr key={incident.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(incident.id)}
                            label={`Select ${incident.title}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {incident.title}
                            </div>
                            <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                              {format(new Date(incident.incidentDate), "dd MMM yyyy")}
                            </div>
                          </td>
                          <td>
                            {incident.employee ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Person name={incident.employee.name} />
                                <div>
                                  <span style={{ fontWeight: 500 }}>{incident.employee.name}</span>
                                  <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                    {incident.employee.employeeId}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="muted">General / Unassigned</span>
                            )}
                          </td>
                          <td>{incident.site?.name ?? <span className="muted">—</span>}</td>
                          <td>
                            <span style={{ fontSize: 13 }}>{incident.incidentType}</span>
                          </td>
                          <td>
                            <BkState tone={SEVERITY_TONE[incident.severity] || "plain"}>
                              {incident.severity}
                            </BkState>
                          </td>
                          <td>
                            <BkState
                              tone={
                                incident.status === "CLOSED"
                                  ? "plain"
                                  : incident.status === "UNDER_REVIEW"
                                  ? "warning"
                                  : "danger"
                              }
                            >
                              {incident.status === "UNDER_REVIEW" ? "Under Review" : incident.status}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <MenuButton label="More" items={moreEntries}>
                              •••
                            </MenuButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED REPORT INCIDENT DRAWER */}
            <Drawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              title="Report workplace incident"
              sub="Document safety events, injuries, grievances, or equipment breaches."
              width={500}
              footer={
                <>
                  <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    Log incident report
                  </Button>
                </>
              }
            >
              <DrawerSection title="Incident Details">
                <Field label="Title / Subject" htmlFor="inc-title">
                  <Input
                    id="inc-title"
                    placeholder="e.g. Forklift safety gate collision"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    autoFocus
                  />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Type" htmlFor="inc-type">
                    <select
                      id="inc-type"
                      className="select"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="SAFETY">Safety Issue</option>
                      <option value="INJURY">Physical Injury</option>
                      <option value="EQUIPMENT">Equipment Damage</option>
                      <option value="CONDUCT">Misconduct</option>
                      <option value="GRIEVANCE">Grievance</option>
                    </select>
                  </Field>

                  <Field label="Severity level" htmlFor="inc-sev">
                    <select
                      id="inc-sev"
                      className="select"
                      value={formSeverity}
                      onChange={(e) => setFormSeverity(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Date occurred" htmlFor="inc-date">
                    <Input
                      id="inc-date"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                  </Field>

                  <Field label="Site" htmlFor="inc-site" optional>
                    <select
                      id="inc-site"
                      className="select"
                      value={formSiteId}
                      onChange={(e) => setFormSiteId(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="">No site specified</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Staff member involved" htmlFor="inc-emp" optional>
                  <select
                    id="inc-emp"
                    className="select"
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    <option value="">General incident (no individual)</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employeeId})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Description & Actions taken" htmlFor="inc-desc">
                  <Input
                    id="inc-desc"
                    placeholder="Details of the event and initial containment..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </Field>
              </DrawerSection>
            </Drawer>

            {/* INCIDENT DETAILS DRAWER */}
            <Drawer
              open={Boolean(selectedIncident)}
              onOpenChange={(open) => !open && setSelectedIncident(null)}
              title={selectedIncident?.title || "Incident Report"}
              sub={selectedIncident ? `${selectedIncident.incidentType} • ${selectedIncident.severity}` : "Detail"}
              width={480}
              footer={<Button onClick={() => setSelectedIncident(null)}>Close</Button>}
            >
              {selectedIncident ? (
                <DrawerSection title="Overview">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Status</span>
                      <BkState tone={selectedIncident.status === "CLOSED" ? "plain" : "danger"}>
                        {selectedIncident.status}
                      </BkState>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Date occurred</span>
                      <span>{format(new Date(selectedIncident.incidentDate), "dd MMM yyyy")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Site location</span>
                      <span>{selectedIncident.site?.name || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Staff involved</span>
                      <span>{selectedIncident.employee?.name || "General"}</span>
                    </div>
                    {selectedIncident.description ? (
                      <div style={{ marginTop: 8, padding: 12, borderRadius: 6, background: "var(--color-surface)" }}>
                        <span className="muted" style={{ display: "block", marginBottom: 4 }}>
                          Description:
                        </span>
                        <p style={{ margin: 0, color: "var(--color-ink)" }}>
                          {selectedIncident.description}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </DrawerSection>
              ) : null}
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
