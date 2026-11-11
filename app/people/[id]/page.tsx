"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Amt,
  BkPage,
  BkTabs,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import {
  Button,
  ButtonLink,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchDepartments,
  fetchJobGrades,
  type DepartmentRecord,
  type JobGradeRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { EMPLOYMENT_TYPE_LABEL } from "@/components/records/people-directory";
import {
  CreditCard,
  Buildings,
  FileCheck,
  IdentificationCard,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  UserRound,
  Wallet,
} from "@/lib/icons";

type TabKey = "overview" | "compensation" | "attendance" | "leave" | "documents";

type EmployeeDetail = {
  id: string;
  employeeId: string;
  userId: string | null;
  name: string;
  phone: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  passportPhotoUrl: string;
  nationalIdNumber: string | null;
  nationalIdDocumentUrl: string | null;
  villageOfOrigin: string;
  jobTitle: string | null;
  position: string;
  departmentId: string | null;
  gradeId: string | null;
  supervisorId: string | null;
  employmentType: string;
  hireDate: string | null;
  terminationDate: string | null;
  dateOfBirth: string | null;
  hasDisability: boolean;
  overtimeHourlyRate: string | number | null;
  taxNumber: string | null;
  nssaNumber: string | null;
  taxStatus: "STANDARD" | "SPECIAL" | "EXEMPT";
  bankName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  mobileMoneyProvider: string | null;
  mobileMoneyNumber: string | null;
  defaultCurrency: string;
  isActive: boolean;
  companyId: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  } | null;
  department: { id: string; code: string; name: string } | null;
  grade: { id: string; code: string; name: string; rank: number } | null;
  supervisor: { id: string; employeeId: string; name: string } | null;
  supervisees: Array<{ id: string; employeeId: string; name: string; position: string }>;
  fixedSalary: {
    id: string;
    monthlyAmount: number;
    currency: string;
    isActive: boolean;
    updatedAt: string;
  } | null;
  compensationProfiles: Array<{
    id: string;
    baseAmount: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
    workflowStatus: string;
  }>;
  attendance: Array<{
    id: string;
    date: string;
    shift: string;
    status: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "EXCUSED";
    overtime: number | null;
    notes: string | null;
  }>;
  leaveRequests: Array<{
    id: string;
    startDate: string;
    endDate: string;
    workingDays: number | string;
    status: string;
    reason: string;
    leaveType: { id: string; name: string; code: string };
  }>;
  leaveEntitlements: Array<{
    id: string;
    year: number;
    granted: number | string;
    carriedOver: number | string;
    adjustment: number | string;
    leaveType: { id: string; name: string; code: string };
  }>;
  payrollLineItems: Array<{
    id: string;
    grossAmount: number | string;
    netAmount: number | string;
    baseAmount: number | string;
    currency: string;
    createdAt: string;
    payrollRun: {
      id: string;
      runNumber: number;
      period: { periodKey: string; name: string | null };
    };
  }>;
  hrIncidents: Array<{
    id: string;
    incidentType: string;
    title: string;
    incidentDate: string;
    severity: string;
    status: string;
  }>;
  moduleAssignments: Array<{
    id: string;
    module: string;
    accessRole: string | null;
    requiresUserAccess: boolean;
    isPrimary: boolean;
    isActive: boolean;
  }>;
};

export default function EmployeeRecordPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const id = params?.id;
  const [tab, setTab] = React.useState<TabKey>("overview");

  // Edit Drawer state
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [editJobTitle, setEditJobTitle] = React.useState("");
  const [editDepartmentId, setEditDepartmentId] = React.useState("");
  const [editGradeId, setEditGradeId] = React.useState("");
  const [editEmploymentType, setEditEmploymentType] = React.useState("FULL_TIME");
  const [editSalary, setEditSalary] = React.useState("");
  const [editBankName, setEditBankName] = React.useState("");
  const [editBankAccount, setEditBankAccount] = React.useState("");
  const [editBankBranch, setEditBankBranch] = React.useState("");
  const [editMobileProvider, setEditMobileProvider] = React.useState("");
  const [editMobileNumber, setEditMobileNumber] = React.useState("");
  const [editTaxNumber, setEditTaxNumber] = React.useState("");
  const [editNssaNumber, setEditNssaNumber] = React.useState("");

  // Leave modal state
  const [leaveModalOpen, setLeaveModalOpen] = React.useState(false);
  const [leaveStartDate, setLeaveStartDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [leaveEndDate, setLeaveEndDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = React.useState("");
  const [leaveTypeId, setLeaveTypeId] = React.useState("");

  const { data: employee, isLoading, error } = useQuery<EmployeeDetail>({
    queryKey: ["employee", id],
    queryFn: () => fetchJson<EmployeeDetail>(`/api/employees/${id}`),
    enabled: Boolean(id),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchDepartments({ active: true, limit: 100 }),
  });
  const departments = deptsData?.data ?? [];

  const { data: gradesData } = useQuery({
    queryKey: ["job-grades"],
    queryFn: () => fetchJobGrades({ active: true, limit: 100 }),
  });
  const grades = gradesData?.data ?? [];

  // Populate drawer when opening
  React.useEffect(() => {
    if (employee && editDrawerOpen) {
      setEditName(employee.name);
      setEditPhone(employee.phone);
      setEditJobTitle(employee.jobTitle || "");
      setEditDepartmentId(employee.departmentId || "");
      setEditGradeId(employee.gradeId || "");
      setEditEmploymentType(employee.employmentType || "FULL_TIME");
      setEditSalary(employee.fixedSalary ? String(employee.fixedSalary.monthlyAmount) : "");
      setEditBankName(employee.bankName || "");
      setEditBankAccount(employee.bankAccountNumber || "");
      setEditBankBranch(employee.bankBranchCode || "");
      setEditMobileProvider(employee.mobileMoneyProvider || "");
      setEditMobileNumber(employee.mobileMoneyNumber || "");
      setEditTaxNumber(employee.taxNumber || "");
      setEditNssaNumber(employee.nssaNumber || "");
    }
  }, [employee, editDrawerOpen]);

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Employee profile updated" });
      setEditDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["employee", id] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_, isActive) => {
      toast({ title: `Employee marked as ${isActive ? "active" : "inactive"}` });
      void queryClient.invalidateQueries({ queryKey: ["employee", id] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const requestLeaveMutation = useMutation({
    mutationFn: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
      fetchJson("/api/leave/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeId: id,
          ...payload,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Leave request submitted" });
      setLeaveModalOpen(false);
      setLeaveReason("");
      void queryClient.invalidateQueries({ queryKey: ["employee", id] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: editName,
      phone: editPhone,
      jobTitle: editJobTitle || null,
      departmentId: editDepartmentId || null,
      gradeId: editGradeId || null,
      employmentType: editEmploymentType,
      bankName: editBankName || null,
      bankAccountNumber: editBankAccount || null,
      bankBranchCode: editBankBranch || null,
      mobileMoneyProvider: editMobileProvider || null,
      mobileMoneyNumber: editMobileNumber || null,
      taxNumber: editTaxNumber || null,
      nssaNumber: editNssaNumber || null,
    };
    if (editSalary.trim()) {
      payload.monthlyAmount = parseFloat(editSalary);
    }
    updateMutation.mutate(payload);
  };

  if (isLoading) return <BooksLoading />;
  if (error || !employee) {
    return (
      <BooksError
        what="Employee profile"
        error={error instanceof Error ? error.message : "Employee record not found."}
        onRetry={() => void queryClient.invalidateQueries({ queryKey: ["employee", id] })}
      />
    );
  }

  const attendanceColumns: Array<WsColumn<EmployeeDetail["attendance"][number]>> = [
    {
      key: "date",
      head: "Date",
      className: "mono font-medium",
      cell: (r) => new Date(r.date).toLocaleDateString("en-GB"),
    },
    {
      key: "shift",
      head: "Shift",
      cell: (r) => r.shift,
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => (
        <St tone={r.status === "PRESENT" ? "done" : r.status === "LATE" ? "warn" : "void"}>
          {r.status}
        </St>
      ),
    },
    {
      key: "overtime",
      head: "Overtime (hrs)",
      className: "mono",
      right: true,
      cell: (r) => (r.overtime ? `${r.overtime}h` : "—"),
    },
    {
      key: "notes",
      head: "Notes",
      className: "muted",
      cell: (r) => r.notes || <None />,
    },
  ];

  const leaveColumns: Array<WsColumn<EmployeeDetail["leaveRequests"][number]>> = [
    {
      key: "type",
      head: "Leave type",
      cell: (r) => <span className="font-medium">{r.leaveType.name}</span>,
    },
    {
      key: "dates",
      head: "Period",
      className: "mono",
      cell: (r) =>
        `${new Date(r.startDate).toLocaleDateString("en-GB")} – ${new Date(r.endDate).toLocaleDateString("en-GB")}`,
    },
    {
      key: "days",
      head: "Days",
      className: "mono font-medium",
      cell: (r) => `${r.workingDays}d`,
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => (
        <St
          tone={
            r.status === "APPROVED"
              ? "done"
              : r.status === "REJECTED"
              ? "void"
              : "draft"
          }
        >
          {r.status}
        </St>
      ),
    },
    {
      key: "reason",
      head: "Reason",
      className: "muted",
      cell: (r) => r.reason || <None />,
    },
  ];

  const payrollColumns: Array<WsColumn<EmployeeDetail["payrollLineItems"][number]>> = [
    {
      key: "period",
      head: "Payroll period",
      cell: (r) => (
        <span className="font-medium">
          {r.payrollRun.period.name || r.payrollRun.period.periodKey} (Run #{r.payrollRun.runNumber})
        </span>
      ),
    },
    {
      key: "base",
      head: "Basic salary",
      right: true,
      className: "mono",
      cell: (r) => <Amt value={Number(r.baseAmount)} currency={r.currency} />,
    },
    {
      key: "gross",
      head: "Gross pay",
      right: true,
      className: "mono",
      cell: (r) => <Amt value={Number(r.grossAmount)} currency={r.currency} />,
    },
    {
      key: "net",
      head: "Net payout",
      right: true,
      className: "mono font-semibold",
      cell: (r) => <Amt value={Number(r.netAmount)} currency={r.currency} />,
    },
    {
      key: "date",
      head: "Date paid",
      className: "mono muted",
      cell: (r) => new Date(r.createdAt).toLocaleDateString("en-GB"),
    },
  ];

  const actions: MenuEntry[] = [
    {
      key: "edit",
      label: "Edit profile & compensation",
      icon: "edit",
      onSelect: () => setEditDrawerOpen(true),
    },
    {
      key: "leave",
      label: "Book leave request",
      icon: "calendar",
      onSelect: () => setLeaveModalOpen(true),
    },
    {
      key: "toggle",
      label: employee.isActive ? "Deactivate employee" : "Reactivate employee",
      icon: "retire",
      danger: employee.isActive,
      onSelect: () => toggleStatusMutation.mutate(!employee.isActive),
    },
  ];

  return (
    <>
      <PageChrome
        title={employee.name}
        reference={employee.employeeId}
        backHref="/people"
        backLabel="Team Members"
        primary={{
          label: "Edit profile",
          icon: "edit",
          onClick: () => setEditDrawerOpen(true),
        }}
      >
        <MenuButton items={actions} label="Employee actions" />
      </PageChrome>

      <BkPage screen="people" scroll={true}>
        {/* Identity Header Card */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            padding: "20px 24px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Person name={employee.name} size={40} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
                  {employee.name}
                </h1>
                <St tone={employee.isActive ? "done" : "void"}>
                  {employee.isActive ? "Active" : "Inactive"}
                </St>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--surface-sunken)",
                    color: "var(--ink-2)",
                    fontWeight: 500,
                  }}
                >
                  {EMPLOYMENT_TYPE_LABEL[employee.employmentType] || employee.employmentType}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--ink-2)",
                }}
              >
                <span>
                  <strong>ID:</strong> <span className="mono">{employee.employeeId}</span>
                </span>
                {employee.jobTitle && (
                  <span>
                    <strong>Title:</strong> {employee.jobTitle}
                  </span>
                )}
                {employee.department && (
                  <span>
                    <strong>Department:</strong> {employee.department.name}
                  </span>
                )}
                {employee.phone && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Phone className="size-3.5 text-[var(--ink-3)]" />
                    <span className="mono">{employee.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button variant="quiet" onClick={() => setLeaveModalOpen(true)}>
              Book leave
            </Button>
            <Button variant="primary" onClick={() => setEditDrawerOpen(true)}>
              Edit details
            </Button>
          </div>
        </div>

        {/* Horizontal Navigation Tabs */}
        <BkTabs
          label="Employee sections"
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          items={[
            { value: "overview", label: "Overview & Profile", icon: "users" },
            {
              value: "compensation",
              label: "Compensation & Banking",
              icon: "bank",
              count: employee.fixedSalary ? 1 : undefined,
            },
            {
              value: "attendance",
              label: "Attendance & Shifts",
              icon: "clock",
              count: employee.attendance.length,
            },
            {
              value: "leave",
              label: "Leave & Balances",
              icon: "calendar",
              count: employee.leaveRequests.length,
            },
            {
              value: "documents",
              label: "Identity & Safety",
              icon: "lock",
              count: employee.hrIncidents.length > 0 ? employee.hrIncidents.length : undefined,
            },
          ]}
        />

        {/* Tab 1: Overview & Profile */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
            {/* Personal Details */}
            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <UserRound className="size-4 text-[var(--ink-3)]" />
                Personal Information
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", fontSize: 13 }}>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Full name</span>
                  <strong>{employee.name}</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Phone number</span>
                  <span className="mono">{employee.phone || "—"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>National ID</span>
                  <span className="mono font-medium">{employee.nationalIdNumber || "—"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Date of birth</span>
                  <span className="mono">{employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString("en-GB") : "—"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Village / Origin</span>
                  <span>{employee.villageOfOrigin || "—"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Disability status</span>
                  <span>{employee.hasDisability ? "Disability registered" : "None registered"}</span>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Next of Kin</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Contact name</span>
                    <span>{employee.nextOfKinName || "—"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Contact phone</span>
                    <span className="mono">{employee.nextOfKinPhone || "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Employment & Organization */}
            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <Buildings className="size-4 text-[var(--ink-3)]" />
                Employment & Placement
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", fontSize: 13 }}>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Department</span>
                  <strong>{employee.department?.name || "Unassigned"}</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Job Grade</span>
                  <span>{employee.grade ? `${employee.grade.name} (${employee.grade.code})` : "Standard"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Position</span>
                  <span>{employee.position}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Employment type</span>
                  <span>{EMPLOYMENT_TYPE_LABEL[employee.employmentType] || employee.employmentType}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Hire date</span>
                  <span className="mono">{employee.hireDate ? new Date(employee.hireDate).toLocaleDateString("en-GB") : "—"}</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>Direct Supervisor</span>
                  <span>{employee.supervisor ? employee.supervisor.name : "None (Reports to Head)"}</span>
                </div>
              </div>

              {employee.supervisees.length > 0 && (
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                    Direct Reports ({employee.supervisees.length})
                  </h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {employee.supervisees.map((sub) => (
                      <Link
                        key={sub.id}
                        href={`/people/${sub.id}`}
                        className="chipsel"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                      >
                        <Person name={sub.name} size={20} />
                        <span>{sub.name}</span>
                        <span className="mono muted">({sub.employeeId})</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* System Access & Assignments */}
            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <Lock className="size-4 text-[var(--ink-3)]" />
                System Account & Modules
              </h3>
              {employee.user ? (
                <div style={{ fontSize: 13, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Mail className="size-4 text-[var(--ink-3)]" />
                    <span><strong>Email:</strong> {employee.user.email}</span>
                  </div>
                  <div>
                    <strong>System Role:</strong> <span className="mono">{employee.user.role}</span>
                  </div>
                  <div>
                    <strong>Account Status:</strong>{" "}
                    <St tone={employee.user.isActive ? "done" : "void"}>
                      {employee.user.isActive ? "Active login" : "Suspended"}
                    </St>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: "0 0 12px 0" }}>
                  No linked user account. This employee is currently managed strictly through HR/Payroll records.
                </p>
              )}

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  Assigned Modules
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {employee.moduleAssignments.map((mod) => (
                    <span
                      key={mod.id}
                      style={{
                        fontSize: 12,
                        padding: "3px 10px",
                        background: mod.isPrimary ? "var(--accent-tint)" : "var(--surface-sunken)",
                        color: mod.isPrimary ? "var(--accent)" : "var(--ink)",
                        fontWeight: mod.isPrimary ? 600 : 500,
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      {mod.module} {mod.accessRole ? `(${mod.accessRole})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Compensation & Banking */}
        {tab === "compensation" && (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {/* Base Salary Card */}
              <div className="bk-card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <Wallet className="size-4 text-[var(--ink-3)]" />
                  Base Compensation
                </h3>
                {employee.fixedSalary ? (
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>
                      <Amt value={employee.fixedSalary.monthlyAmount} currency={employee.fixedSalary.currency} />
                      <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-2)", marginLeft: 8 }}>
                        per month
                      </span>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 13, color: "var(--ink-2)" }}>
                      Status:{" "}
                      <St tone={employee.fixedSalary.isActive ? "done" : "void"}>
                        {employee.fixedSalary.isActive ? "Active fixed salary" : "Inactive"}
                      </St>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="muted" style={{ fontSize: 13 }}>No fixed base salary configured.</p>
                    <Button variant="quiet" onClick={() => setEditDrawerOpen(true)}>
                      Set monthly salary
                    </Button>
                  </div>
                )}
              </div>

              {/* Disbursement / Banking Card */}
              <div className="bk-card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <CreditCard className="size-4 text-[var(--ink-3)]" />
                  Banking & Disbursement
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", fontSize: 13 }}>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Bank name</span>
                    <strong>{employee.bankName || "Not configured"}</strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Account number</span>
                    <span className="mono font-semibold">{employee.bankAccountNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Branch code</span>
                    <span className="mono">{employee.bankBranchCode || "—"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Mobile money</span>
                    <span className="mono">
                      {employee.mobileMoneyProvider ? `${employee.mobileMoneyProvider}: ${employee.mobileMoneyNumber}` : "None"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statutory Registrations */}
              <div className="bk-card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <FileCheck className="size-4 text-[var(--ink-3)]" />
                  Statutory Registrations
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", fontSize: 13 }}>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>ZIMRA Tax BP #</span>
                    <span className="mono font-medium">{employee.taxNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>NSSA Number</span>
                    <span className="mono font-medium">{employee.nssaNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Tax Status</span>
                    <span>{employee.taxStatus || "STANDARD"}</span>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Overtime rate</span>
                    <span className="mono">{employee.overtimeHourlyRate ? `$${employee.overtimeHourlyRate}/hr` : "Standard rule"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Payslips */}
            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 600 }}>
                Recent Payroll Runs & Payslip History
              </h3>
              <Worksheet
                label="payroll-history"
                rows={employee.payrollLineItems}
                rowKey={(r) => r.id}
                columns={payrollColumns}
                empty="No payroll payments recorded for this employee yet."
              />
            </div>
          </div>
        )}

        {/* Tab 3: Attendance & Shifts */}
        {tab === "attendance" && (
          <div style={{ marginTop: 16 }}>
            <div className="bk-card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                    Attendance Logs & Timesheets
                  </h3>
                  <p className="muted" style={{ margin: "4px 0 0 0", fontSize: 13 }}>
                    Showing recent work shifts, clock-ins, and recorded exceptions.
                  </p>
                </div>
                <ButtonLink href="/people/attendance" variant="quiet">
                  Open full attendance register
                </ButtonLink>
              </div>
            </div>

            <Worksheet
              label="attendance-history"
              rows={employee.attendance}
              rowKey={(r) => r.id}
              columns={attendanceColumns}
              empty="No shift attendance records logged yet."
            />
          </div>
        )}

        {/* Tab 4: Leave & Balances */}
        {tab === "leave" && (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {/* Entitlements Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {employee.leaveEntitlements.map((ent) => (
                <div key={ent.id} className="bk-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>
                    {ent.leaveType.name} ({ent.year})
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                    {Number(ent.granted) + Number(ent.carriedOver) + Number(ent.adjustment)} days
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                    Granted: {ent.granted}d | Carry: {ent.carriedOver}d
                  </div>
                </div>
              ))}
              {employee.leaveEntitlements.length === 0 && (
                <div className="bk-card" style={{ padding: 16, gridColumn: "1 / -1" }}>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Standard statutory leave entitlements apply (Annual leave, Sick leave, Compassionate).
                  </p>
                </div>
              )}
            </div>

            {/* Leave Requests Table */}
            <div className="bk-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Leave Request History
                </h3>
                <Button variant="primary" onClick={() => setLeaveModalOpen(true)}>
                  Book leave
                </Button>
              </div>

              <Worksheet
                label="leave-history"
                rows={employee.leaveRequests}
                rowKey={(r) => r.id}
                columns={leaveColumns}
                empty="No leave requests submitted yet."
              />
            </div>
          </div>
        )}

        {/* Tab 5: Identity & Safety / Incidents */}
        {tab === "documents" && (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck className="size-4 text-[var(--ink-3)]" />
                Workforce Incidents & Safety Record
              </h3>
              {employee.hrIncidents.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {employee.hrIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      style={{
                        padding: 12,
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface-sunken)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <strong>{inc.title}</strong>
                        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
                          Type: {inc.incidentType} | Date: {new Date(inc.incidentDate).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <St tone={inc.severity === "HIGH" ? "void" : "warn"}>
                        {inc.severity}
                      </St>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Clean safety record. No incidents or disciplinary actions logged.
                </p>
              )}
            </div>

            <div className="bk-card" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <IdentificationCard className="size-4 text-[var(--ink-3)]" />
                Attached Identity Documentation
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>National ID Document</span>
                  {employee.nationalIdDocumentUrl ? (
                    <a
                      href={employee.nationalIdDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chipsel"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <FileCheck className="size-4" />
                      View uploaded national ID
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>No document uploaded</span>
                  )}
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Passport Photograph</span>
                  {employee.passportPhotoUrl ? (
                    <a
                      href={employee.passportPhotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chipsel"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <UserCheck className="size-4" />
                      View passport photograph
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>No photo uploaded</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </BkPage>

      {/* Edit Drawer */}
      <Drawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        title={`Edit ${employee.name}`}
      >
        <form onSubmit={handleSaveEdit}>
          <DrawerSection title="Personal details">
            <Field label="Full name">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </Field>
            <Field label="Phone number">
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Role & Placement">
            <Field label="Job title">
              <Input
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
                placeholder="e.g. Senior Accountant"
              />
            </Field>
            <Field label="Department">
              <select
                className="select"
                value={editDepartmentId}
                onChange={(e) => setEditDepartmentId(e.target.value)}
                style={{ width: "100%", height: 36, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}
              >
                <option value="">Unassigned</option>
                {departments.map((d: DepartmentRecord) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Job Grade">
              <select
                className="select"
                value={editGradeId}
                onChange={(e) => setEditGradeId(e.target.value)}
                style={{ width: "100%", height: 36, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}
              >
                <option value="">Standard Grade</option>
                {grades.map((g: JobGradeRecord) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
                ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select
                className="select"
                value={editEmploymentType}
                onChange={(e) => setEditEmploymentType(e.target.value)}
                style={{ width: "100%", height: 36, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="CASUAL">Casual</option>
              </select>
            </Field>
          </DrawerSection>

          <DrawerSection title="Compensation">
            <Field label="Monthly basic salary (USD)">
              <Input
                type="number"
                step="any"
                value={editSalary}
                onChange={(e) => setEditSalary(e.target.value)}
                placeholder="e.g. 1500"
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Disbursement & Banking">
            <Field label="Bank name">
              <Input
                value={editBankName}
                onChange={(e) => setEditBankName(e.target.value)}
                placeholder="e.g. Stanbic Bank"
              />
            </Field>
            <Field label="Bank account number">
              <Input
                value={editBankAccount}
                onChange={(e) => setEditBankAccount(e.target.value)}
                placeholder="e.g. 9140001234567"
              />
            </Field>
            <Field label="Branch code">
              <Input
                value={editBankBranch}
                onChange={(e) => setEditBankBranch(e.target.value)}
                placeholder="e.g. 02100"
              />
            </Field>
            <Field label="Mobile money provider">
              <Input
                value={editMobileProvider}
                onChange={(e) => setEditMobileProvider(e.target.value)}
                placeholder="e.g. EcoCash"
              />
            </Field>
            <Field label="Mobile money number">
              <Input
                value={editMobileNumber}
                onChange={(e) => setEditMobileNumber(e.target.value)}
                placeholder="e.g. 0771234567"
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Statutory identity">
            <Field label="ZIMRA Tax BP number">
              <Input
                value={editTaxNumber}
                onChange={(e) => setEditTaxNumber(e.target.value)}
                placeholder="e.g. 200123456"
              />
            </Field>
            <Field label="NSSA member number">
              <Input
                value={editNssaNumber}
                onChange={(e) => setEditNssaNumber(e.target.value)}
                placeholder="e.g. 80012345B"
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 16 }}>
            <Button variant="quiet" onClick={() => setEditDrawerOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Book Leave Drawer */}
      <Drawer
        open={leaveModalOpen}
        onOpenChange={setLeaveModalOpen}
        title={`Book Leave for ${employee.name}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestLeaveMutation.mutate({
              leaveTypeId: leaveTypeId || employee.leaveEntitlements[0]?.leaveType.id || "",
              startDate: leaveStartDate,
              endDate: leaveEndDate,
              reason: leaveReason,
            });
          }}
        >
          <DrawerSection title="Leave details">
            <Field label="Leave type">
              <select
                className="select"
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                style={{ width: "100%", height: 36, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}
                required
              >
                <option value="">Select type...</option>
                {employee.leaveEntitlements.map((ent) => (
                  <option key={ent.leaveType.id} value={ent.leaveType.id}>
                    {ent.leaveType.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <Input
                type="date"
                value={leaveStartDate}
                onChange={(e) => setLeaveStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={leaveEndDate}
                onChange={(e) => setLeaveEndDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Reason / notes">
              <Input
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="e.g. Annual holiday"
                required
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 16 }}>
            <Button variant="quiet" onClick={() => setLeaveModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={requestLeaveMutation.isPending}>
              {requestLeaveMutation.isPending ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
