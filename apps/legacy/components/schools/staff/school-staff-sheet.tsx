"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { DepartmentRecord, EmployeeSummary } from "@/lib/api";

/**
 * Taking on, or correcting, a member of support staff.
 *
 * Deliberately not the HR wizard. That one walks a company through everything
 * an employee record can hold — compensation templates, module access, a user
 * account, a supervisor chain — because it is the front door for a mine hiring
 * a shift boss. A school secretary adding the new groundsman needs none of it,
 * and a seven-step wizard is why the job does not get done.
 *
 * So this asks for what a school office actually knows on the day: who they
 * are, how to reach them, what they do, and who to ring if something happens.
 * Everything else the HR module already knows how to fill in later, and the row
 * links straight through to it.
 *
 * The record it writes is an ordinary `Employee` carrying the `SCHOOLS` module
 * assignment. There is no school-staff table; a second one would mean a second
 * payroll, and the point of putting them in HR is that there is only ever one.
 */

const POSITION_OPTIONS = [
  { value: "ACCOUNTANT", label: "Bursary" },
  { value: "ADMINISTRATOR", label: "Administration" },
  { value: "CLERK", label: "Office and admin" },
  { value: "DRIVER", label: "Driver" },
  { value: "MANAGER", label: "Management" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "SUPPORT_STAFF", label: "Grounds and domestic" },
  { value: "TECHNICIAN", label: "Maintenance" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "On contract" },
  { value: "CASUAL", label: "Casual" },
];

type StaffFormValues = {
  name: string;
  phone: string;
  jobTitle: string;
  position: string;
  departmentId: string;
  employmentType: string;
  hireDate: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  villageOfOrigin: string;
  nationalIdNumber: string;
};

const EMPTY: StaffFormValues = {
  name: "",
  phone: "",
  jobTitle: "",
  position: "SUPPORT_STAFF",
  departmentId: "",
  employmentType: "FULL_TIME",
  hireDate: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  villageOfOrigin: "",
  nationalIdNumber: "",
};

export function SchoolStaffSheet({
  open,
  onOpenChange,
  employee,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person being corrected, or null to take somebody on. */
  employee: EmployeeSummary | null;
  departments: DepartmentRecord[];
  onSaved: () => void;
}) {
  // Remounted per subject rather than re-seeded by an effect. Syncing props
  // into state inside `useEffect` costs a second render every time the sheet
  // opens and gets the reset subtly wrong when the same person is opened
  // twice; a key is how React says "this is a different form now".
  //
  // Every create shares the id `null`, though, so keying on that alone held
  // one "new" form open across every use of the button: cancel half-way
  // through adding a groundsman, press Add again, and his half-typed details
  // were still sitting there waiting to be saved against somebody else. The
  // open-count makes each create its own form.
  //
  // Derived during render from the previous value rather than in an effect —
  // React's own "adjusting state when a prop changes" pattern, which settles
  // before paint instead of rendering the stale form first.
  const [seen, setSeen] = useState(open);
  const [creates, setCreates] = useState(0);
  if (seen !== open) {
    setSeen(open);
    if (open && !employee) setCreates((n) => n + 1);
  }

  return (
    <StaffForm
      key={employee?.id ?? `new-${creates}`}
      open={open}
      onOpenChange={onOpenChange}
      employee={employee}
      departments={departments}
      onSaved={onSaved}
    />
  );
}

function StaffForm({
  open,
  onOpenChange,
  employee,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeSummary | null;
  departments: DepartmentRecord[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<StaffFormValues>(() =>
    employee
      ? {
          name: employee.name,
          phone: employee.phone,
          jobTitle: employee.jobTitle ?? "",
          position: employee.position,
          departmentId: employee.departmentId ?? "",
          employmentType: employee.employmentType ?? "FULL_TIME",
          hireDate: employee.hireDate?.slice(0, 10) ?? "",
          nextOfKinName: employee.nextOfKinName,
          nextOfKinPhone: employee.nextOfKinPhone,
          villageOfOrigin: employee.villageOfOrigin,
          nationalIdNumber: employee.nationalIdNumber ?? "",
        }
      : EMPTY,
  );

  const set = <K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Editing distinguishes "leave it alone" from "clear it", and only an
      // explicit null says the second. `|| undefined` drops the key out of the
      // JSON altogether, so emptying a job title or a department in the form
      // saved cleanly and changed nothing — the old value was still in the
      // database and reappeared next time the sheet opened. On create there is
      // nothing to clear, so an absent field stays absent.
      const optional = (value: string) =>
        value ? value : employee ? null : undefined;

      const payload = {
        name: values.name.trim(),
        phone: values.phone.trim(),
        jobTitle: optional(values.jobTitle.trim()),
        position: values.position,
        departmentId: optional(values.departmentId),
        employmentType: values.employmentType,
        hireDate: values.hireDate || undefined,
        nextOfKinName: values.nextOfKinName.trim(),
        nextOfKinPhone: values.nextOfKinPhone.trim(),
        villageOfOrigin: values.villageOfOrigin.trim(),
        nationalIdNumber: optional(values.nationalIdNumber.trim()),
        // The API requires a photo. A school office adding a groundsman has no
        // photograph to hand and would abandon the form over it, so the record
        // is created without one and HR fills it in — the placeholder is a
        // known sentinel rather than an invented URL.
        passportPhotoUrl: employee?.passportPhotoUrl ?? "/placeholder-avatar.svg",
        // What makes this a school's employee rather than the company's.
        moduleAssignments: [
          { module: "SCHOOLS" as const, isPrimary: true, isActive: true },
        ],
      };

      return employee
        ? fetchJson(`/api/v2/schools/staff/${employee.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : fetchJson("/api/v2/schools/staff", {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: onSaved,
  });

  const errors = useMemo(() => {
    const found: string[] = [];
    if (!values.name.trim()) found.push("A name is needed.");
    if (!values.phone.trim()) found.push("A phone number is needed.");
    if (!values.nextOfKinName.trim() || !values.nextOfKinPhone.trim()) {
      found.push("Next of kin — a name and a number somebody can ring.");
    }
    if (!values.villageOfOrigin.trim()) found.push("Home area is needed.");
    if (saveMutation.isError) found.push(getApiErrorMessage(saveMutation.error));
    return found;
  }, [values, saveMutation.isError, saveMutation.error]);

  const blocked = errors.length > 0 && !saveMutation.isError ? errors.length : 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Edit ${employee.name}` : "Add a staff member"}
      description="Support staff are employees, so this record is the one payroll and leave run from."
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked > 0) return;
        saveMutation.mutate();
      }}
      errors={saveMutation.isError ? [getApiErrorMessage(saveMutation.error)] : undefined}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending || blocked > 0}>
            {saveMutation.isPending
              ? "Saving…"
              : employee
                ? "Save changes"
                : "Add to the staff"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Tendai Chikwanda"
          />
        </Field>
        <Field label="Phone" required>
          <Input
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            placeholder="+263 77 000 0000"
          />
        </Field>

        <Field label="What they do">
          <Select value={values.position} onValueChange={(next) => set("position", next)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Job title" hint="What it says on their contract.">
          <Input
            value={values.jobTitle}
            onChange={(event) => set("jobTitle", event.target.value)}
            placeholder="Groundsman"
          />
        </Field>

        <Field label="Department">
          <Select
            value={values.departmentId || "__none__"}
            onValueChange={(next) => set("departmentId", next === "__none__" ? "" : next)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not set</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Employment">
          <Select
            value={values.employmentType}
            onValueChange={(next) => set("employmentType", next)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Started">
          <Input
            type="date"
            value={values.hireDate}
            onChange={(event) => set("hireDate", event.target.value)}
          />
        </Field>
        <Field label="National ID">
          <Input
            value={values.nationalIdNumber}
            onChange={(event) => set("nationalIdNumber", event.target.value)}
            placeholder="63-1234567-A-00"
          />
        </Field>

        <Field label="Home area" required>
          <Input
            value={values.villageOfOrigin}
            onChange={(event) => set("villageOfOrigin", event.target.value)}
            placeholder="Chishawasha"
          />
        </Field>
        <div className="hidden sm:block" />

        <Field label="Next of kin" required>
          <Input
            value={values.nextOfKinName}
            onChange={(event) => set("nextOfKinName", event.target.value)}
            placeholder="Grace Chikwanda"
          />
        </Field>
        <Field label="Next of kin phone" required hint="Who the school rings in an emergency.">
          <Input
            value={values.nextOfKinPhone}
            onChange={(event) => set("nextOfKinPhone", event.target.value)}
            placeholder="+263 77 000 0000"
          />
        </Field>
      </div>
    </RecordDialog>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-[color:var(--tone-danger)]">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
