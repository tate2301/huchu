"use client";

import * as React from "react";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
  BkEmpty,
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
  Select,
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

function CompensationContent() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tab = (searchParams.get("tab") as CompTab) || "profiles";
  const search = searchParams.get("q") || "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 20;

  const onQuery = React.useCallback(
    (next: { tab?: string; q?: string; page?: number }) => {
      const merged = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty =
          value === null ||
          value === undefined ||
          value === "" ||
          (key === "tab" && value === "profiles") ||
          (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const setTab = (nextTab: CompTab) => onQuery({ tab: nextTab, page: 1 });
  const setSearch = (nextQ: string) => onQuery({ q: nextQ, page: 1 });
  const setPage = (nextPage: number) => onQuery({ page: nextPage });

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
      list = list.filter((t) => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
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
        ["Template Name", "Currency", "Base Amount", "Active"],
        filteredTemplates.map((t) => [t.name, t.currency, String(t.baseAmount), t.isActive ? "Yes" : "No"])
      );
    } else {
      downloadCsv(
        `compensation-rules-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Rule Name", "Type", "Method", "Value"],
        filteredRules.map((r) => [r.name, r.type, r.calcMethod, String(r.value)])
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
      head: "Employee",
      cell: (p) => (
        <Person name={p.employee.name} sub={p.employee.employeeId} />
      ),
    },
    {
      key: "baseAmount",
      head: "Base salary",
      right: true,
      cell: (p) => <Amt value={p.baseAmount} currency={p.currency} />,
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (p) => p.currency,
    },
    {
      key: "effectiveFrom",
      head: "From",
      className: "muted mono",
      cell: (p) => (p.effectiveFrom ? format(new Date(p.effectiveFrom), "d MMM yyyy") : <None />),
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (p) => {
        const items: MenuEntry[] = [
          {
            key: "edit",
            label: "Edit salary",
            icon: "edit",
            onSelect: () => handleOpenEdit(p),
          },
          {
            key: "delete",
            label: "Remove",
            icon: "retire",
            danger: true,
            onSelect: () => deleteProfileMutation.mutate(p.id),
          },
        ];
        return <MenuButton label="Actions" items={items} />;
      },
    },
  ];

  // Columns for templates
  const templateColumns: Array<WsColumn<CompensationTemplateRecord>> = [
    {
      key: "name",
      head: "Template",
      cell: (t) => (
        <>
          {t.name}
          {t.description ? <span className="muted truncate"> {t.description}</span> : null}
        </>
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
      head: "Rule",
      cell: (r) => (
        <>
          {r.name}
          <span className="muted"> {r.taxable ? "taxable" : "not taxable"}</span>
        </>
      ),
    },
    {
      key: "type",
      head: "Type",
      cell: (r) => <St tone={r.type === "ALLOWANCE" ? "done" : "bad"}>{r.type === "ALLOWANCE" ? "Allowance" : "Deduction"}</St>,
    },
    {
      key: "calc",
      head: "How it is worked out",
      className: "muted mono",
      cell: (r) => `${r.calcMethod} (${r.value})`,
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
      title="Pay packages"
      primary={{
        label: "Set pay",
        icon: "plus",
        shortcut: "N",
        onClick: () => {
          setEditingProfile(null);
          if (employees.length > 0) {
            setEmployeeId(employees[0]!.id);
          }
          setBaseAmount("1000");
          setCurrency("USD");
          setEffectiveFrom(new Date().toISOString().slice(0, 10));
          setDrawerOpen(true);
        },
      }}
    >
      <BkPage screen="payroll-compensation" scroll={false}>
        <BkFinding
          fact={
            tab === "profiles"
              ? `${profiles.length} ${profiles.length === 1 ? "person has" : "people have"} a salary.`
              : tab === "templates"
              ? `${templates.length} ${templates.length === 1 ? "template" : "templates"}.`
              : `${rules.length} ${rules.length === 1 ? "rule" : "rules"}.`
          }
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
            { value: "profiles", label: "Salaries", count: profiles.length, icon: "person" },
            { value: "templates", label: "Templates", count: templates.length, icon: "docs" },
            { value: "rules", label: "Rules", count: rules.length, icon: "figure" },
          ]}
        />

        <BkTools
          find={tab === "profiles" ? "Search employees" : "Search by name"}
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

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
              openHref={(p) => `/people/${p.employee.id}`}
              empty={
                <BkEmpty>No salaries yet.</BkEmpty>
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
                <BkEmpty>No templates.</BkEmpty>
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
                <BkEmpty>No rules.</BkEmpty>
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

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
          actions={
            <Button variant="quiet" icon="export" onClick={handleExportCsv}>
              Export
            </Button>
          }
        />
      </BkPage>

      {/* GUIDED COMPENSATION PROFILE DRAWER */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingProfile ? "Edit salary" : "Set pay"}
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
              Save
            </Button>
          </>
        }
      >
        <DrawerSection title="Employee">
          <Field label="Employee" htmlFor="comp-emp">
            {editingProfile ? (
              <Input id="comp-emp" value={editingProfile.employee.name} disabled />
            ) : (
              <Select id="comp-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeId || "no ID"})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </DrawerSection>

        <DrawerSection title="Salary">
          <Field label="Base amount" htmlFor="comp-base">
            <Input id="comp-base" type="number" step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} />
          </Field>
          <Field label="Currency" htmlFor="comp-curr">
            <Select id="comp-curr" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </Field>
          <Field label="From" htmlFor="comp-effective">
            <Input id="comp-effective" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
        </DrawerSection>
      </Drawer>
    </PayrollShell>
  );
}

export default function CompensationPage() {
  return (
    <React.Suspense
      fallback={
        <PayrollShell activeTab="compensation">
          <BooksLoading />
        </PayrollShell>
      }
    >
      <CompensationContent />
    </React.Suspense>
  );
}
