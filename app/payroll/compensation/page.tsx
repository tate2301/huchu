"use client";

import * as React from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
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

type CompTab = "profiles" | "templates" | "rules";

export default function CompensationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<CompTab>("profiles");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

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

  // Mutations
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        employeeId: editingProfile ? editingProfile.employee.id : employeeId,
        baseAmount: parseFloat(baseAmount),
        currency,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
      };
      if (editingProfile) {
        return fetchJson(`/api/payroll/compensation/profiles/${editingProfile.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return fetchJson("/api/payroll/compensation/profiles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({ title: editingProfile ? "Compensation profile updated" : "Compensation profile created" });
      setDrawerOpen(false);
      setEditingProfile(null);
      void queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] });
    },
    onError: (err) => {
      toast({ title: "Failed to save profile", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/payroll/compensation/profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Compensation profile removed" });
      void queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] });
    },
  });

  // Filtered lists
  const filteredProfiles = React.useMemo(() => {
    let list = [...profiles];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.employee.name.toLowerCase().includes(q) ||
          p.employee.employeeId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [profiles, search]);

  const filteredTemplates = React.useMemo(() => {
    let list = [...templates];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));
    }
    return list;
  }, [templates, search]);

  const filteredRules = React.useMemo(() => {
    let list = [...rules];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    }
    return list;
  }, [rules, search]);

  const activeItems =
    tab === "profiles"
      ? filteredProfiles
      : tab === "templates"
      ? filteredTemplates
      : filteredRules;

  const totalRows = activeItems.length;
  const pageRows = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const handleExportCsv = () => {
    if (tab === "profiles") {
      downloadCsv(
        `compensation-profiles-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Employee", "Employee ID", "Base Salary", "Currency", "Effective Date"],
        filteredProfiles.map((p) => [
          p.employee.name,
          p.employee.employeeId,
          String(p.baseAmount),
          p.currency,
          p.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : "",
        ])
      );
    } else if (tab === "templates") {
      downloadCsv(
        `salary-templates-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Template Name", "Code", "Currency", "Active"],
        filteredTemplates.map((t) => [t.name, t.code, t.currency, t.isActive ? "Yes" : "No"])
      );
    } else {
      downloadCsv(
        `compensation-rules-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Rule Name", "Code", "Category", "Calculation Type", "Rate/Amount"],
        filteredRules.map((r) => [r.name, r.code, r.category, r.calcType, String(r.amount)])
      );
    }
  };

  const handleOpenEdit = (p: CompensationProfileRecord) => {
    setEditingProfile(p);
    setEmployeeId(p.employee.id);
    setBaseAmount(String(p.baseAmount));
    setCurrency(p.currency);
    setEffectiveFrom(p.effectiveFrom ? new Date(p.effectiveFrom).toISOString().slice(0, 10) : "");
    setDrawerOpen(true);
  };

  // Columns for profiles
  const profileColumns: Array<WsColumn<CompensationProfileRecord>> = [
    {
      key: "employee",
      head: "Staff member",
      cell: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={p.employee.name} size={28} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>{p.employee.name}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{p.employee.employeeId}</span>
          </span>
        </span>
      ),
    },
    {
      key: "baseAmount",
      head: "Base Salary",
      right: true,
      cell: (p) => <Amt value={p.baseAmount} currency={p.currency} weight={600} />,
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (p) => p.currency,
    },
    {
      key: "effectiveFrom",
      head: "Effective date",
      className: "muted mono",
      cell: (p) => (p.effectiveFrom ? format(new Date(p.effectiveFrom), "dd MMM yyyy") : <None />),
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (p) => {
        const items: MenuEntry[] = [
          {
            key: "edit",
            label: "Edit salary profile",
            icon: "edit",
            onSelect: () => handleOpenEdit(p),
          },
          {
            key: "delete",
            label: "Remove profile",
            icon: "trash",
            tone: "danger",
            onSelect: () => deleteProfileMutation.mutate(p.id),
          },
        ];
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <MenuButton label="Actions" items={items} />
          </div>
        );
      },
    },
  ];

  // Columns for templates
  const templateColumns: Array<WsColumn<CompensationTemplateRecord>> = [
    {
      key: "name",
      head: "Template name",
      cell: (t) => (
        <div>
          <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>{t.name}</div>
          <div className="muted mono" style={{ fontSize: 11 }}>{t.code}</div>
        </div>
      ),
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (t) => t.currency,
    },
    {
      key: "status",
      head: "Status",
      cell: (t) => <St tone={t.isActive ? "done" : "void"}>{t.isActive ? "Active" : "Archived"}</St>,
    },
  ];

  // Columns for rules
  const ruleColumns: Array<WsColumn<CompensationRuleRecord>> = [
    {
      key: "name",
      head: "Rule name",
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>{r.name}</div>
          <div className="muted mono" style={{ fontSize: 11 }}>{r.code}</div>
        </div>
      ),
    },
    {
      key: "category",
      head: "Category",
      cell: (r) => <St tone={r.category === "ALLOWANCE" ? "done" : "bad"}>{r.category}</St>,
    },
    {
      key: "calc",
      head: "Calculation",
      className: "muted mono",
      cell: (r) => `${r.calcType} (${r.amount})`,
    },
  ];

  const totals = [
    `${totalRows} records`,
    null,
    null,
    null,
    null,
  ];

  return (
    <PayrollShell
      activeTab="compensation"
      title="Staff Compensation Packages"
      actions={
        <Button
          variant="primary"
          icon="plus"
          shortcut="N"
          onClick={() => {
            setEditingProfile(null);
            if (employees.length > 0) {
              setEmployeeId(employees[0]!.id);
            }
            setBaseAmount("1000");
            setCurrency("USD");
            setEffectiveFrom(new Date().toISOString().slice(0, 10));
            setDrawerOpen(true);
          }}
        >
          Assign compensation
        </Button>
      }
    >
      <BkPage screen="payroll-compensation" scroll={false}>
        <BkFinding
          fact={
            tab === "profiles"
              ? `${profiles.length} staff members have active compensation profiles.`
              : tab === "templates"
              ? `${templates.length} salary package templates configured.`
              : `${rules.length} allowance and deduction rules defined.`
          }
          rest="Select any record to view wage tiers, statutory rate linkages, or edit pay packages."
        />

        <BkTabs
          label="Compensation views"
          value={tab}
          onChange={(next) => {
            setTab(next as CompTab);
            setPage(1);
            selection.clear();
          }}
          items={[
            { value: "profiles", label: "Employee profiles", count: profiles.length },
            { value: "templates", label: "Salary templates", count: templates.length },
            { value: "rules", label: "Pay rules & allowances", count: rules.length },
          ]}
        />

        {selection.selected.size > 0 ? (
          <BkSelectionBar
            selection={{
              count: selection.selected.size,
              clear: selection.clear,
            }}
            actions={
              <Button variant="quiet" icon="export" onClick={handleExportCsv}>
                Export selected ({selection.selected.size})
              </Button>
            }
          />
        ) : (
          <BkTools
            find={
              tab === "profiles"
                ? "Search compensation profiles by employee name or ID..."
                : tab === "templates"
                ? "Search templates by name or code..."
                : "Search rules by name or code..."
            }
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            end={<BkQuietTools onExport={handleExportCsv} />}
          />
        )}

        <BkScroll>
          {tab === "profiles" ? (
            <Worksheet
              label="compensation profiles"
              rows={pageRows as CompensationProfileRecord[]}
              rowKey={(p) => p.id}
              columns={profileColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (p) => p.employee.name,
              }}
              totals={totals}
              onOpen={(p) => handleOpenEdit(p)}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No compensation profiles found.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Assign a base salary profile to get started.
                  </p>
                </div>
              }
            />
          ) : tab === "templates" ? (
            <Worksheet
              label="salary templates"
              rows={pageRows as CompensationTemplateRecord[]}
              rowKey={(t) => t.id}
              columns={templateColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (t) => t.name,
              }}
              totals={totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No compensation templates found.
                  </p>
                </div>
              }
            />
          ) : (
            <Worksheet
              label="compensation rules"
              rows={pageRows as CompensationRuleRecord[]}
              rowKey={(r) => r.id}
              columns={ruleColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (r) => r.name,
              }}
              totals={totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No compensation rules found.
                  </p>
                </div>
              }
            />
          )}
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />
      </BkPage>

      {/* GUIDED COMPENSATION PROFILE DRAWER */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingProfile ? "Update Compensation Profile" : "Assign Compensation Profile"}
        sub="Set base wages, currency, and statutory calculation defaults."
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
              Save profile
            </Button>
          </>
        }
      >
        <DrawerSection title="Staff Member">
          <Field label="Employee" htmlFor="comp-emp">
            {editingProfile ? (
              <Input id="comp-emp" value={editingProfile.employee.name} disabled />
            ) : (
              <select
                id="comp-emp"
                className="select"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeNumber || "No ID"})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </DrawerSection>

        <DrawerSection title="Base Salary & Currency">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
            <Field label="Base amount" htmlFor="comp-base">
              <Input
                id="comp-base"
                type="number"
                step="0.01"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
              />
            </Field>

            <Field label="Currency" htmlFor="comp-curr">
              <select
                id="comp-curr"
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </Field>
          </div>

          <Field label="Effective from" htmlFor="comp-effective">
            <Input
              id="comp-effective"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </Field>

          {/* Statutory preview hint */}
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "var(--color-surface)",
              boxShadow: "var(--shadow-ring)",
              fontSize: 12,
              color: "var(--color-muted)",
              marginTop: 8,
            }}
          >
            💡 Zimbabwean NSSA (4.5% up to statutory cap) and PAYE progressive tax brackets will
            be calculated automatically during monthly payroll run generation.
          </div>
        </DrawerSection>
      </Drawer>
    </PayrollShell>
  );
}
