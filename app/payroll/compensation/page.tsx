"use client";

import * as React from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
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
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchCompensationProfiles,
  fetchCompensationRules,
  fetchCompensationTemplates,
  fetchEmployees,
  type CompensationProfileRecord,
  type CompensationRuleRecord,
  type CompensationTemplateRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

type CompTab = "profiles" | "templates" | "rules";

export default function CompensationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<CompTab>("profiles");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingProfile, setEditingProfile] = React.useState<CompensationProfileRecord | null>(null);
  const [employeeId, setEmployeeId] = React.useState("");
  const [baseAmount, setBaseAmount] = React.useState("1000");
  const [currency, setCurrency] = React.useState("USD");
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10));

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "comp-picker"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });
  const employees = React.useMemo(() => employeesData?.data ?? [], [employeesData]);

  const { data: profilesData } = useQuery({
    queryKey: ["compensation-profiles"],
    queryFn: () => fetchCompensationProfiles({ limit: 300 }),
  });
  const profiles = React.useMemo(() => profilesData?.data ?? [], [profilesData]);

  const { data: templatesData } = useQuery({
    queryKey: ["compensation-templates"],
    queryFn: () => fetchCompensationTemplates({ limit: 100 }),
  });
  const templates = React.useMemo(() => templatesData?.data ?? [], [templatesData]);

  const { data: rulesData } = useQuery({
    queryKey: ["compensation-rules"],
    queryFn: () => fetchCompensationRules({ limit: 100 }),
  });
  const rules = React.useMemo(() => rulesData?.data ?? [], [rulesData]);

  // Filtering
  const filteredProfiles = React.useMemo(() => {
    let list = [...profiles];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.employee.name.toLowerCase().includes(q) ||
          p.employee.employeeId.toLowerCase().includes(q) ||
          (p.employee.department?.name && p.employee.department.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [profiles, search]);

  const filteredTemplates = React.useMemo(() => {
    let list = [...templates];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [templates, search]);

  const filteredRules = React.useMemo(() => {
    let list = [...rules];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q));
    }
    return list;
  }, [rules, search]);

  const activeItems =
    tab === "profiles"
      ? filteredProfiles
      : tab === "templates"
      ? filteredTemplates
      : filteredRules;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, activeItems.length);
  const pagedItems = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );

  const ids = React.useMemo(() => pagedItems.map((item) => item.id), [pagedItems]);
  const selection = useSelection(ids);

  // Live Statutory Preview calculation for Drawer
  const statutoryPreview = React.useMemo(() => {
    const base = Number(baseAmount) || 0;
    const nssa = Math.min(base * 0.045, 31.5);
    const taxable = Math.max(0, base - 100);
    const paye = taxable > 0 ? taxable * 0.2 : 0;
    const net = Math.max(0, base - nssa - paye);
    return { base, nssa, paye, net };
  }, [baseAmount]);

  // Mutations
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (editingProfile) {
        return fetchJson(`/api/payroll/compensation/profiles/${editingProfile.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            baseAmount: Number(baseAmount),
            currency,
            effectiveFrom,
          }),
        });
      }
      return fetchJson("/api/payroll/compensation/profiles", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employeeId || employees[0]?.id,
          baseAmount: Number(baseAmount),
          currency,
          effectiveFrom,
          status: "ACTIVE",
        }),
      });
    },
    onSuccess: () => {
      toast({ title: editingProfile ? "Salary profile updated" : "Salary profile assigned", variant: "success" });
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] });
    },
    onError: (err) => {
      toast({ title: "Unable to save salary profile", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const toggleProfileMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      fetchJson(`/api/payroll/compensation/profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast({ title: "Profile status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] });
    },
  });

  const handleOpenCreate = () => {
    setEditingProfile(null);
    setEmployeeId(employees[0]?.id || "");
    setBaseAmount("1000");
    setCurrency("USD");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setDrawerOpen(true);
  };

  const handleOpenEdit = (profile: CompensationProfileRecord) => {
    setEditingProfile(profile);
    setEmployeeId(profile.employeeId);
    setBaseAmount(String(profile.baseAmount));
    setCurrency(profile.currency || "USD");
    setEffectiveFrom(profile.effectiveFrom ? String(profile.effectiveFrom).slice(0, 10) : "");
    setDrawerOpen(true);
  };

  const totalBaseSum = React.useMemo(() => {
    return filteredProfiles.reduce((s, p) => s + Number(p.baseAmount), 0);
  }, [filteredProfiles]);

  const handleExportCsv = () => {
    if (tab === "profiles") {
      const csv = [
        ["Employee ID", "Name", "Department", "Base Salary", "Currency", "Effective From", "Status"],
        ...filteredProfiles.map((p) => [
          p.employee.employeeId,
          p.employee.name,
          p.employee.department?.name || "",
          String(p.baseAmount),
          p.currency,
          p.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : "",
          p.status,
        ]),
      ];
      downloadCsv(`compensation-profiles-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } else {
      const csv = [
        ["Template Name", "Base Salary", "Currency", "Employment Type", "Status"],
        ...filteredTemplates.map((t) => [t.name, String(t.baseAmount), t.currency || "USD", t.employmentType || "FULL_TIME", t.isActive ? "ACTIVE" : "INACTIVE"]),
      ];
      downloadCsv(`compensation-templates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    }
  };

  return (
    <PayrollShell
      activeTab="compensation"
      title="Compensation & Base Salaries"
      actions={
        <Button variant="primary" icon="plus" shortcut="N" onClick={handleOpenCreate}>
          Assign salary profile
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Compensation views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "profiles", label: "Staff salary profiles", count: profiles.length },
                { value: "templates", label: "Salary templates", count: templates.length },
                { value: "rules", label: "Calculation rules", count: rules.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find={tab === "profiles" ? "Search profiles by employee, department..." : "Search templates..."}
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${activeItems.length} records`}
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Compensation"
              foot={
                <TableFoot
                  range={activeItems.length === 0 ? "None" : `${from} to ${to} of ${activeItems.length}`}
                  sums={
                    tab === "profiles"
                      ? [{ label: "Total Monthly Base", value: money(totalBaseSum, "USD") }]
                      : []
                  }
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < activeItems.length ? () => setPage((p) => p + 1) : undefined,
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
              {activeItems.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No records match</b>
                  <p className="muted">Assign staff salary profiles above to establish base pay rates.</p>
                </div>
              ) : tab === "profiles" ? (
                /* PROFILES TABLE */
                <table className="table" aria-label="Staff salary profiles">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 260 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
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
                        label="Select all profiles"
                      />
                      <th>Employee</th>
                      <th>Department</th>
                      <th className="num">Base Salary</th>
                      <th>Effective date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as CompensationProfileRecord[]).map((prof) => {
                      const isSelected = selection.isSelected(prof.id);
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "edit",
                          label: "Edit salary profile",
                          icon: "edit",
                          onSelect: () => handleOpenEdit(prof),
                        },
                        { separator: true },
                        {
                          key: "toggle",
                          label: prof.status === "ACTIVE" ? "Deactivate profile" : "Activate profile",
                          onSelect: () =>
                            toggleProfileMutation.mutate({
                              id: prof.id,
                              status: prof.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                            }),
                        },
                      ];

                      return (
                        <tr key={prof.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(prof.id)}
                            label={`Select ${prof.employee.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={prof.employee.name} />
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                  {prof.employee.name}
                                </span>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {prof.employee.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{prof.employee.department?.name ?? <span className="muted">—</span>}</td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(Number(prof.baseAmount), prof.currency || "USD")}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {prof.effectiveFrom ? format(new Date(prof.effectiveFrom), "dd MMM yyyy") : "—"}
                          </td>
                          <td>
                            <BkState tone={prof.status === "ACTIVE" ? "success" : "plain"}>
                              {prof.status === "ACTIVE" ? "Active" : "Inactive"}
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
              ) : tab === "templates" ? (
                /* TEMPLATES TABLE */
                <table className="table" aria-label="Compensation templates">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all templates"
                      />
                      <th>Template name</th>
                      <th>Cycle</th>
                      <th className="num">Base Salary</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as CompensationTemplateRecord[]).map((tmpl) => {
                      const isSelected = selection.isSelected(tmpl.id);
                      return (
                        <tr key={tmpl.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(tmpl.id)}
                            label={`Select ${tmpl.name}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {tmpl.name}
                            </div>
                            {tmpl.description ? (
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                {tmpl.description}
                              </div>
                            ) : null}
                          </td>
                          <td>{tmpl.employmentType || "Full time"}</td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(Number(tmpl.baseAmount), tmpl.currency || "USD")}
                          </td>
                          <td>
                            <BkState tone={tmpl.isActive ? "success" : "plain"}>
                              {tmpl.isActive ? "Active" : "Archived"}
                            </BkState>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* RULES TABLE */
                <table className="table" aria-label="Calculation rules">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all rules"
                      />
                      <th>Rule name</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as CompensationRuleRecord[]).map((rule) => {
                      const isSelected = selection.isSelected(rule.id);
                      return (
                        <tr key={rule.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(rule.id)}
                            label={`Select ${rule.name}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {rule.name}
                            </div>
                          </td>
                          <td>
                            <span className="mono" style={{ fontSize: 13, color: "var(--color-ink-2)" }}>
                              {rule.type}
                            </span>
                          </td>
                          <td>{rule.type}</td>
                          <td>{rule.calcMethod}</td>
                          <td>
                            <BkState tone={rule.isActive ? "success" : "plain"}>
                              {rule.isActive ? "Active" : "Archived"}
                            </BkState>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED SET SALARY DRAWER */}
            <Drawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              title={editingProfile ? `Edit Salary Profile` : "Assign staff salary profile"}
              sub="Set monthly base pay and preview statutory tax withholdings."
              width={480}
              footer={
                <>
                  <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={saveProfileMutation.isPending}
                    onClick={() => saveProfileMutation.mutate()}
                  >
                    {editingProfile ? "Update salary" : "Save salary profile"}
                  </Button>
                </>
              }
            >
              <DrawerSection title="Staff & Currency">
                {!editingProfile ? (
                  <Field label="Employee" htmlFor="sal-emp">
                    <select
                      id="sal-emp"
                      className="select"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.employeeId})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Monthly base salary" htmlFor="sal-base">
                    <Input
                      id="sal-base"
                      type="number"
                      step="50"
                      value={baseAmount}
                      onChange={(e) => setBaseAmount(e.target.value)}
                    />
                  </Field>

                  <Field label="Currency" htmlFor="sal-cur">
                    <select
                      id="sal-cur"
                      className="select"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="ZWG">ZWG</option>
                    </select>
                  </Field>
                </div>

                <Field label="Effective date" htmlFor="sal-date">
                  <Input
                    id="sal-date"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </Field>

                {/* Statutory deduction preview */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 8,
                    background: "var(--color-surface)",
                    boxShadow: "var(--shadow-ring)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-ink-2)" }}>
                    <span>Gross Base Salary</span>
                    <span className="num" style={{ fontWeight: 500 }}>
                      {money(statutoryPreview.base, currency)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
                    <span>NSSA Pension (4.5% statutory)</span>
                    <span className="num">−{money(statutoryPreview.nssa, currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
                    <span>Estimated PAYE Tax</span>
                    <span className="num">−{money(statutoryPreview.paye, currency)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: 8,
                      marginTop: 4,
                      boxShadow: "inset 0 1px 0 var(--color-line)",
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      fontSize: 14,
                    }}
                  >
                    <span>Estimated Net Pay</span>
                    <span className="num" style={{ color: "var(--color-success)" }}>
                      {money(statutoryPreview.net, currency)}
                    </span>
                  </div>
                </div>
              </DrawerSection>
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PayrollShell>
  );
}
