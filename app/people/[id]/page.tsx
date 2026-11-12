"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  Amt,
  BkBlock,
  BkEmpty,
  BkFacts,
  BkNote,
  BkPage,
  BkRecord,
  BkRecordHead,
  BkTabs,
  None,
  St,
  Worksheet,
  type BkTone,
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
  Select,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { EMPLOYMENT_TYPE_LABEL } from "@/components/records/people-directory";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchDepartments,
  fetchJobGrades,
  type DepartmentRecord,
  type JobGradeRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";
import { employeePositionLabel, getEmployeePositionOptions } from "@/lib/platform/vertical-defaults";

type TabKey = "profile" | "pay" | "attendance" | "leave";

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
  taxStatus: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  mobileMoneyProvider: string | null;
  mobileMoneyNumber: string | null;
  defaultCurrency: string;
  isActive: boolean;
  companyId: string;
  user: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
  department: { id: string; code: string; name: string } | null;
  grade: { id: string; code: string; name: string; rank: number } | null;
  supervisor: { id: string; employeeId: string; name: string } | null;
  supervisees: Array<{ id: string; employeeId: string; name: string; position: string }>;
  fixedSalary: { id: string; monthlyAmount: number; currency: string; isActive: boolean; updatedAt: string } | null;
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
  payrollLineItems: Array<{
    id: string;
    grossAmount: number | string;
    netAmount: number | string;
    baseAmount: number | string;
    currency: string;
    createdAt: string;
    run?: { id: string; runNumber: number; period: { periodKey: string; name?: string | null } };
    payrollRun?: { id: string; runNumber: number; period: { periodKey: string; name?: string | null } };
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

type LeaveBalance = {
  leaveTypeId: string;
  code: string;
  name: string;
  entitled: string;
  taken: string;
  pending: string;
  remaining: string;
  isUnlimited: boolean;
};

type TrainingRecord = {
  id: string;
  trainingType: string;
  trainingDate: string;
  expiryDate: string | null;
  trainedBy: string | null;
  certificateUrl: string | null;
  notes: string | null;
};

type Page<T> = { data: T[] };

const DAY_MS = 86_400_000;
const RENEWAL_WINDOW_DAYS = 30;

const day = (value: string | null | undefined) => (value ? shortDay(value.slice(0, 10)) : null);
const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
const days = (n: number | string) => `${Number(n)} ${Number(n) === 1 ? "day" : "days"}`;

/** A certificate's state from its expiry: nothing expires, expired, renewal due inside 30 days, or valid. */
function certificateState(expiry: string | null, now: number): { tone: BkTone; label: string; left: number | null } {
  if (!expiry) return { tone: "draft", label: "No expiry", left: null };
  const left = Math.ceil((new Date(expiry).getTime() - now) / DAY_MS);
  if (left < 0) return { tone: "bad", label: "Expired", left };
  if (left <= RENEWAL_WINDOW_DAYS) return { tone: "warn", label: "Renewal due", left };
  return { tone: "done", label: "Valid", left };
}

const ATTENDANCE_TONE: Record<EmployeeDetail["attendance"][number]["status"], BkTone> = {
  PRESENT: "done",
  LATE: "warn",
  HALF_DAY: "warn",
  EXCUSED: "info",
  ABSENT: "bad",
};

const LEAVE_TONE: Record<string, BkTone> = { APPROVED: "done", REJECTED: "bad", DRAFT: "draft", SUBMITTED: "warn", PENDING: "warn" };

type EditForm = {
  name: string;
  phone: string;
  jobTitle: string;
  position: string;
  departmentId: string;
  gradeId: string;
  employmentType: string;
  hireDate: string;
  salary: string;
  bankName: string;
  bankAccount: string;
  bankBranch: string;
  mobileProvider: string;
  mobileNumber: string;
  taxNumber: string;
  nssaNumber: string;
};

const editFormOf = (employee: EmployeeDetail): EditForm => ({
  name: employee.name,
  phone: employee.phone,
  jobTitle: employee.jobTitle ?? "",
  position: employee.position,
  departmentId: employee.departmentId ?? "",
  gradeId: employee.gradeId ?? "",
  employmentType: employee.employmentType || "FULL_TIME",
  hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : "",
  salary: employee.fixedSalary ? String(employee.fixedSalary.monthlyAmount) : "",
  bankName: employee.bankName ?? "",
  bankAccount: employee.bankAccountNumber ?? "",
  bankBranch: employee.bankBranchCode ?? "",
  mobileProvider: employee.mobileMoneyProvider ?? "",
  mobileNumber: employee.mobileMoneyNumber ?? "",
  taxNumber: employee.taxNumber ?? "",
  nssaNumber: employee.nssaNumber ?? "",
});

const today = () => new Date().toISOString().slice(0, 10);

/** One person's record: the head and facts, then the sections, with certificates, incidents and the account beside. */
export default function EmployeeRecordPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [now] = React.useState(() => Date.now());
  const [tab, setTab] = React.useState<TabKey>("profile");
  const [editOpen, setEditOpen] = React.useState(false);
  const [form, setForm] = React.useState<EditForm | null>(null);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [leave, setLeave] = React.useState({ leaveTypeId: "", startDate: today(), endDate: today(), reason: "" });
  const [certOpen, setCertOpen] = React.useState(false);
  const [cert, setCert] = React.useState({ trainingType: "", trainingDate: today(), expiryDate: "", trainedBy: "" });

  const employeeQuery = useQuery<EmployeeDetail>({
    queryKey: ["employee", id],
    queryFn: () => fetchJson<EmployeeDetail>(`/api/employees/${id}`),
    enabled: Boolean(id),
  });
  const employee = employeeQuery.data;

  const departments = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepartments({ active: true, limit: 100 }) }).data?.data ?? [];
  const grades = useQuery({ queryKey: ["job-grades"], queryFn: () => fetchJobGrades({ active: true, limit: 100 }) }).data?.data ?? [];

  const balances = useQuery({
    queryKey: ["people", "leave-balances", id],
    queryFn: () => fetchJson<{ balances: LeaveBalance[] }>(`/api/people/leave/balances?employeeId=${id}`),
    enabled: Boolean(id),
  }).data?.balances ?? [];
  const leaveTypes =
    useQuery({
      queryKey: ["people", "leave-types"],
      queryFn: () => fetchJson<{ types: Array<{ id: string; name: string; code: string }> }>("/api/people/leave/types"),
    }).data?.types ?? [];

  const userId = employee?.user?.id ?? null;
  const certificatesQuery = useQuery({
    queryKey: ["training-records", userId],
    queryFn: () => fetchJson<Page<TrainingRecord>>(`/api/compliance/training-records?userId=${userId}&limit=100`),
    enabled: Boolean(userId),
  });
  const certificates = React.useMemo(() => certificatesQuery.data?.data ?? [], [certificatesQuery.data]);

  const positionOptions = React.useMemo(() => {
    const user = session?.user as { workspaceProfile?: string; enabledFeatures?: string[] } | undefined;
    return getEmployeePositionOptions({ workspaceProfile: user?.workspaceProfile, enabledFeatures: user?.enabledFeatures });
  }, [session]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["employee", id] });
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
  };
  const failed = (error: unknown) => toast({ title: getApiErrorMessage(error), variant: "destructive" });

  const update = useMutation({
    mutationFn: (values: Record<string, unknown>) => fetchJson(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: (_, values) => {
      toast({ title: "isActive" in values ? `Marked ${values.isActive ? "active" : "inactive"}` : "Saved" });
      setEditOpen(false);
      refresh();
    },
    onError: failed,
  });

  const requestLeave = useMutation({
    mutationFn: () =>
      fetchJson("/api/people/leave/requests", {
        method: "POST",
        body: JSON.stringify({ employeeId: id, ...leave, submit: true }),
      }),
    onSuccess: () => {
      toast({ title: "Leave requested" });
      setLeaveOpen(false);
      setLeave({ leaveTypeId: "", startDate: today(), endDate: today(), reason: "" });
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-balances", id] });
      void queryClient.invalidateQueries({ queryKey: ["people", "leave-requests"] });
    },
    onError: failed,
  });

  const addCertificate = useMutation({
    mutationFn: () =>
      fetchJson("/api/compliance/training-records", {
        method: "POST",
        body: JSON.stringify({
          userId,
          trainingType: cert.trainingType.trim(),
          trainingDate: cert.trainingDate,
          ...(cert.expiryDate ? { expiryDate: cert.expiryDate } : {}),
          ...(cert.trainedBy.trim() ? { trainedBy: cert.trainedBy.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Certificate recorded" });
      setCertOpen(false);
      setCert({ trainingType: "", trainingDate: today(), expiryDate: "", trainedBy: "" });
      void queryClient.invalidateQueries({ queryKey: ["training-records", userId] });
    },
    onError: failed,
  });

  if (employeeQuery.isLoading) return <BooksLoading />;
  if (employeeQuery.error || !employee) {
    return (
      <BooksError
        what="Employee"
        error={employeeQuery.error instanceof Error ? employeeQuery.error.message : "This employee was not found."}
        onRetry={() => void employeeQuery.refetch()}
      />
    );
  }

  const states = certificates.map((record) => ({ record, state: certificateState(record.expiryDate, now) }));
  const expired = states.filter((entry) => entry.state.tone === "bad").length;
  const renewing = states.filter((entry) => entry.state.tone === "warn").length;

  const openEdit = () => {
    setForm(editFormOf(employee));
    setEditOpen(true);
  };
  const set = <K extends keyof EditForm>(key: K) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    update.mutate({
      name: form.name,
      phone: form.phone,
      jobTitle: form.jobTitle || null,
      position: form.position,
      departmentId: form.departmentId || null,
      gradeId: form.gradeId || null,
      employmentType: form.employmentType,
      hireDate: form.hireDate || null,
      bankName: form.bankName || null,
      bankAccountNumber: form.bankAccount || null,
      bankBranchCode: form.bankBranch || null,
      mobileMoneyProvider: form.mobileProvider || null,
      mobileMoneyNumber: form.mobileNumber || null,
      taxNumber: form.taxNumber || null,
      nssaNumber: form.nssaNumber || null,
      ...(form.salary.trim() ? { monthlyAmount: Number(form.salary) } : {}),
    });
  };

  const actions: MenuEntry[] = [
    { key: "leave", label: "Book leave", icon: "calendar", onSelect: () => setLeaveOpen(true) },
    {
      key: "toggle",
      label: employee.isActive ? "Deactivate" : "Reactivate",
      icon: "retire",
      danger: employee.isActive,
      onSelect: () => update.mutate({ isActive: !employee.isActive }),
    },
  ];

  const payslips: Array<WsColumn<EmployeeDetail["payrollLineItems"][number]>> = [
    {
      key: "period",
      head: "Period",
      cell: (row) => {
        const run = row.run ?? row.payrollRun;
        return (
          <>
            {run?.period ? run.period.name || run.period.periodKey : <None />}
            {run?.runNumber != null ? <span className="muted"> Run {run.runNumber}</span> : null}
          </>
        );
      },
    },
    { key: "base", head: "Basic", right: true, cell: (row) => <Amt value={Number(row.baseAmount)} currency={null} /> },
    { key: "gross", head: "Gross", right: true, cell: (row) => <Amt value={Number(row.grossAmount)} currency={null} /> },
    { key: "net", head: "Net", right: true, cell: (row) => <Amt value={Number(row.netAmount)} currency={row.currency} /> },
    { key: "date", head: "Paid", className: "mono muted", cell: (row) => day(row.createdAt) ?? <None /> },
    {
      key: "payslip",
      head: "",
      right: true,
      cell: (row) => (
        <a href={`/api/payroll/payslips/${row.id}/pdf`} target="_blank" rel="noopener noreferrer">
          Payslip
        </a>
      ),
    },
  ];

  const attendance: Array<WsColumn<EmployeeDetail["attendance"][number]>> = [
    { key: "date", head: "Date", className: "mono", cell: (row) => day(row.date) },
    { key: "shift", head: "Shift", cell: (row) => words(row.shift) },
    { key: "status", head: "Status", cell: (row) => <St tone={ATTENDANCE_TONE[row.status]}>{words(row.status)}</St> },
    { key: "overtime", head: "Overtime, hours", right: true, className: "mono", cell: (row) => (row.overtime ? row.overtime : <None />) },
    { key: "notes", head: "Notes", className: "muted", cell: (row) => row.notes || <None /> },
  ];

  const balanceColumns: Array<WsColumn<LeaveBalance>> = [
    { key: "type", head: "Leave", cell: (row) => row.name },
    { key: "entitled", head: "Entitled", right: true, className: "mono", cell: (row) => (row.isUnlimited ? "No limit" : row.entitled) },
    { key: "taken", head: "Taken", right: true, className: "mono", cell: (row) => row.taken },
    { key: "pending", head: "Waiting", right: true, className: "mono", cell: (row) => row.pending },
    { key: "left", head: "Left", right: true, className: "mono", cell: (row) => (row.isUnlimited ? <None /> : row.remaining) },
  ];

  const requests: Array<WsColumn<EmployeeDetail["leaveRequests"][number]>> = [
    { key: "type", head: "Leave", cell: (row) => row.leaveType.name },
    { key: "dates", head: "Dates", className: "mono", cell: (row) => `${day(row.startDate)} to ${day(row.endDate)}` },
    { key: "days", head: "Days", right: true, className: "mono", cell: (row) => Number(row.workingDays) },
    { key: "status", head: "Status", cell: (row) => <St tone={LEAVE_TONE[row.status] ?? "draft"}>{words(row.status)}</St> },
    { key: "reason", head: "Reason", className: "muted", cell: (row) => row.reason || <None /> },
  ];

  const typeLabel = EMPLOYMENT_TYPE_LABEL[employee.employmentType] ?? employee.employmentType;
  const documents = [
    { label: "National ID", url: employee.nationalIdDocumentUrl, view: "View" },
    { label: "Passport photo", url: employee.passportPhotoUrl, view: "View" },
  ];

  const side = (
    <>
      <BkBlock
        icon="permits"
        title="Certificates"
        meta={
          certificates.length ? (
            <span>
              {certificates.length}
              {expired ? `, ${expired} expired` : renewing ? `, ${renewing} due` : ""}
            </span>
          ) : null
        }
      >
        {!userId ? (
          <p className="muted">Certificates are kept against a sign-in. {employee.name.split(" ")[0]} has none yet.</p>
        ) : certificates.length === 0 ? (
          <BkEmpty action={<Button onClick={() => setCertOpen(true)}>Record one</Button>}>No certificates recorded.</BkEmpty>
        ) : (
          <>
            <ul className="k-hist">
              {states.map(({ record, state }) => (
                <li key={record.id}>
                  <span />
                  <span>
                    <b>{record.trainingType}</b>{" "}
                    <span className="muted">
                      {record.trainedBy ? `${record.trainedBy}, ` : ""}
                      {state.left === null ? "no expiry" : state.left < 0 ? `${days(-state.left)} overdue` : `${days(state.left)} left`}
                    </span>
                  </span>
                  <St tone={state.tone}>{state.label}</St>
                </li>
              ))}
            </ul>
            <Button onClick={() => setCertOpen(true)} icon="add">
              Record a certificate
            </Button>
          </>
        )}
      </BkBlock>

      <BkBlock icon="incidents" title="Incidents" meta={employee.hrIncidents.length ? String(employee.hrIncidents.length) : null}>
        {employee.hrIncidents.length === 0 ? (
          <p className="muted">None recorded.</p>
        ) : (
          <ul className="k-hist">
            {employee.hrIncidents.map((incident) => (
              <li key={incident.id}>
                <span />
                <span>
                  <b>{incident.title}</b> <span className="muted mono">{day(incident.incidentDate)}</span>
                </span>
                <St tone={incident.severity === "HIGH" || incident.severity === "CRITICAL" ? "bad" : "warn"}>{words(incident.severity)}</St>
              </li>
            ))}
          </ul>
        )}
        <ButtonLink href="/people/incidents" variant="quiet">
          Open incidents
        </ButtonLink>
      </BkBlock>

      <BkBlock icon="access" title="Sign-in">
        {employee.user ? (
          <BkFacts
            items={[
              { label: "Email", value: employee.user.email },
              { label: "Role", value: words(employee.user.role) },
              { label: "Account", value: <St tone={employee.user.isActive ? "done" : "void"}>{employee.user.isActive ? "Active" : "Suspended"}</St> },
            ]}
          />
        ) : (
          <p className="muted">No sign-in. Managed through HR and Payroll only.</p>
        )}
        {employee.moduleAssignments.length ? (
          <p className="muted">
            {employee.moduleAssignments.map((assignment) => `${words(assignment.module)}${assignment.accessRole ? `, ${words(assignment.accessRole)}` : ""}`).join(" · ")}
          </p>
        ) : null}
      </BkBlock>

      <BkBlock icon="users" title="Reporting line">
        <BkFacts items={[{ label: "Reports to", value: employee.supervisor?.name ?? "Nobody" }]} />
        {employee.supervisees.length ? (
          <ul className="k-hist">
            {employee.supervisees.map((report) => (
              <li key={report.id}>
                <Person name={report.name}>
                  <Link href={`/people/${report.id}`}>{report.name}</Link>
                </Person>
                <span className="muted mono">{report.employeeId}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </BkBlock>
    </>
  );

  return (
    <>
      <PageChrome
        title={employee.name}
        reference={employee.employeeId}
        backHref="/people"
        backLabel="Staff"
        primary={{ label: "Edit", icon: "edit", onClick: openEdit }}
      >
        <MenuButton items={actions} label="More" />
      </PageChrome>

      <BkPage screen="people-record" scroll={false}>
        <BkRecord side={side}>
          <BkRecordHead
            title={employee.name}
            meta={[
              <St key="state" tone={employee.isActive ? "done" : "void"}>
                {employee.isActive ? "Active" : "Inactive"}
              </St>,
              typeLabel,
              <span key="id" className="mono">
                {employee.employeeId}
              </span>,
              employee.jobTitle || employeePositionLabel(employee.position),
            ]}
          />

          {expired > 0 ? (
            <BkNote tone="bad" action={<Button onClick={() => setCertOpen(true)}>Record a renewal</Button>}>
              <b>{expired === 1 ? "A certificate has expired." : `${expired} certificates have expired.`}</b>
            </BkNote>
          ) : renewing > 0 ? (
            <BkNote tone="warn" action={<Button onClick={() => setCertOpen(true)}>Record a renewal</Button>}>
              <b>{renewing === 1 ? "A certificate is due for renewal." : `${renewing} certificates are due for renewal.`}</b>
            </BkNote>
          ) : null}

          <BkFacts
            items={[
              { label: "Department", value: employee.department?.name ?? <None /> },
              { label: "Grade", value: employee.grade ? `${employee.grade.name} (${employee.grade.code})` : <None /> },
              { label: "Hired", value: day(employee.hireDate) ?? <None />, mono: true },
              { label: "Phone", value: employee.phone || <None />, mono: true },
            ]}
          />

          <BkTabs
            label="Employee sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: "profile", label: "Profile", icon: "profile" },
              { value: "pay", label: "Pay", icon: "payments", count: employee.payrollLineItems.length },
              { value: "attendance", label: "Attendance", icon: "clock", count: employee.attendance.length },
              { value: "leave", label: "Leave", icon: "calendar", count: employee.leaveRequests.length },
            ]}
          />

          {tab === "profile" ? (
            <>
              <BkBlock icon="person" title="Personal">
                <BkFacts
                  items={[
                    { label: "National ID", value: employee.nationalIdNumber || <None />, mono: true },
                    { label: "Born", value: day(employee.dateOfBirth) ?? <None />, mono: true },
                    { label: "Home village", value: employee.villageOfOrigin || <None /> },
                    { label: "Disability", value: employee.hasDisability ? "Registered" : "None registered" },
                    { label: "Next of kin", value: employee.nextOfKinName || <None /> },
                    { label: "Their phone", value: employee.nextOfKinPhone || <None />, mono: true },
                  ]}
                />
              </BkBlock>
              <BkBlock icon="docs" title="Documents">
                <BkFacts
                  items={documents.map((doc) => ({
                    label: doc.label,
                    value: doc.url ? (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        {doc.view}
                      </a>
                    ) : (
                      <None />
                    ),
                  }))}
                />
              </BkBlock>
            </>
          ) : null}

          {tab === "pay" ? (
            <>
              <BkBlock
                icon="money"
                title="Pay"
                meta={
                  employee.fixedSalary ? (
                    <span>
                      <Amt value={employee.fixedSalary.monthlyAmount} currency={employee.fixedSalary.currency} /> a month
                    </span>
                  ) : null
                }
              >
                {employee.fixedSalary ? null : (
                  <BkEmpty action={<Button onClick={openEdit}>Set salary</Button>}>No monthly salary set.</BkEmpty>
                )}
                <BkFacts
                  items={[
                    { label: "Bank", value: employee.bankName || <None /> },
                    { label: "Account", value: employee.bankAccountNumber || <None />, mono: true },
                    { label: "Branch", value: employee.bankBranchCode || <None />, mono: true },
                    {
                      label: "Mobile money",
                      value: employee.mobileMoneyProvider ? `${employee.mobileMoneyProvider} ${employee.mobileMoneyNumber ?? ""}` : <None />,
                      mono: true,
                    },
                    { label: "ZIMRA BP number", value: employee.taxNumber || <None />, mono: true },
                    { label: "NSSA number", value: employee.nssaNumber || <None />, mono: true },
                    { label: "Tax status", value: words(employee.taxStatus || "STANDARD") },
                    { label: "Overtime rate", value: employee.overtimeHourlyRate ? <Amt value={Number(employee.overtimeHourlyRate)} currency={employee.defaultCurrency} /> : "Company rule" },
                  ]}
                />
              </BkBlock>
              <Worksheet label="payslips" rows={employee.payrollLineItems} rowKey={(row) => row.id} columns={payslips} empty="No pay recorded yet." />
            </>
          ) : null}

          {tab === "attendance" ? (
            <>
              <Worksheet label="attendance" rows={employee.attendance} rowKey={(row) => row.id} columns={attendance} empty="No shifts recorded yet." />
              <ButtonLink href="/people/attendance" variant="quiet">
                Open the attendance register
              </ButtonLink>
            </>
          ) : null}

          {tab === "leave" ? (
            <>
              <Worksheet label="leave-balances" rows={balances} rowKey={(row) => row.leaveTypeId} columns={balanceColumns} empty="No leave types set up." />
              <Worksheet label="leave-requests" rows={employee.leaveRequests} rowKey={(row) => row.id} columns={requests} empty="No leave requested yet." />
              <Button onClick={() => setLeaveOpen(true)} icon="calendar">
                Book leave
              </Button>
            </>
          ) : null}
        </BkRecord>
      </BkPage>

      <Drawer
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${employee.name}`}
        footer={
          <>
            <Button variant="quiet" type="button" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="employee-edit" disabled={update.isPending}>
              {update.isPending ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        {form ? (
          <form id="employee-edit" onSubmit={save}>
            <DrawerSection title="Person">
              <Field label="Full name">
                <Input value={form.name} onChange={set("name")} required />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={set("phone")} required />
              </Field>
            </DrawerSection>

            <DrawerSection title="Job">
              <Field label="Job title" optional>
                <Input value={form.jobTitle} onChange={set("jobTitle")} />
              </Field>
              <Field label="Position">
                <Select value={form.position} onChange={set("position")}>
                  {positionOptions.some((option) => option.value === form.position) ? null : (
                    <option value={form.position}>{employeePositionLabel(form.position)}</option>
                  )}
                  {positionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Department">
                <Select value={form.departmentId} onChange={set("departmentId")}>
                  <option value="">None</option>
                  {departments.map((department: DepartmentRecord) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Grade">
                <Select value={form.gradeId} onChange={set("gradeId")}>
                  <option value="">Standard</option>
                  {grades.map((grade: JobGradeRecord) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name} ({grade.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Employment">
                <Select value={form.employmentType} onChange={set("employmentType")}>
                  {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hired">
                <Input type="date" value={form.hireDate} onChange={set("hireDate")} />
              </Field>
            </DrawerSection>

            <DrawerSection title="Pay">
              <Field label="Monthly salary" optional>
                <Input type="number" min={0} step="0.01" value={form.salary} onChange={set("salary")} />
              </Field>
              <Field label="Bank" optional>
                <Input value={form.bankName} onChange={set("bankName")} />
              </Field>
              <Field label="Account number" optional>
                <Input value={form.bankAccount} onChange={set("bankAccount")} />
              </Field>
              <Field label="Branch code" optional>
                <Input value={form.bankBranch} onChange={set("bankBranch")} />
              </Field>
              <Field label="Mobile money provider" optional>
                <Input value={form.mobileProvider} onChange={set("mobileProvider")} />
              </Field>
              <Field label="Mobile money number" optional>
                <Input value={form.mobileNumber} onChange={set("mobileNumber")} />
              </Field>
            </DrawerSection>

            <DrawerSection title="Tax">
              <Field label="ZIMRA BP number" optional>
                <Input value={form.taxNumber} onChange={set("taxNumber")} />
              </Field>
              <Field label="NSSA number" optional>
                <Input value={form.nssaNumber} onChange={set("nssaNumber")} />
              </Field>
            </DrawerSection>
          </form>
        ) : null}
      </Drawer>

      <Drawer
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={`Book leave for ${employee.name}`}
        footer={
          <>
            <Button variant="quiet" type="button" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="employee-leave" disabled={requestLeave.isPending || !leave.leaveTypeId}>
              {requestLeave.isPending ? "Sending" : "Request leave"}
            </Button>
          </>
        }
      >
        <form
          id="employee-leave"
          onSubmit={(event) => {
            event.preventDefault();
            requestLeave.mutate();
          }}
        >
          <DrawerSection title="Leave">
            <Field label="Type">
              <Select value={leave.leaveTypeId} onChange={(event) => setLeave({ ...leave, leaveTypeId: event.target.value })} required>
                <option value="">Choose</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From">
              <Input type="date" value={leave.startDate} onChange={(event) => setLeave({ ...leave, startDate: event.target.value })} required />
            </Field>
            <Field label="To">
              <Input type="date" min={leave.startDate} value={leave.endDate} onChange={(event) => setLeave({ ...leave, endDate: event.target.value })} required />
            </Field>
            <Field label="Reason">
              <Input value={leave.reason} onChange={(event) => setLeave({ ...leave, reason: event.target.value })} required />
            </Field>
          </DrawerSection>
        </form>
      </Drawer>

      <Drawer
        open={certOpen}
        onOpenChange={setCertOpen}
        title="Record a certificate"
        sub={employee.name}
        footer={
          <>
            <Button variant="quiet" type="button" onClick={() => setCertOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="employee-cert" disabled={addCertificate.isPending || !userId}>
              {addCertificate.isPending ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <form
          id="employee-cert"
          onSubmit={(event) => {
            event.preventDefault();
            addCertificate.mutate();
          }}
        >
          <DrawerSection title="Certificate">
            <Field label="Name">
              <Input value={cert.trainingType} onChange={(event) => setCert({ ...cert, trainingType: event.target.value })} required />
            </Field>
            <Field label="Issued">
              <Input type="date" value={cert.trainingDate} onChange={(event) => setCert({ ...cert, trainingDate: event.target.value })} required />
            </Field>
            <Field label="Expires" optional>
              <Input type="date" min={cert.trainingDate} value={cert.expiryDate} onChange={(event) => setCert({ ...cert, expiryDate: event.target.value })} />
            </Field>
            <Field label="Issued by" optional>
              <Input value={cert.trainedBy} onChange={(event) => setCert({ ...cert, trainedBy: event.target.value })} />
            </Field>
          </DrawerSection>
        </form>
      </Drawer>
    </>
  );
}
