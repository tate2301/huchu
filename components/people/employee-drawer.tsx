"use client";

import * as React from "react";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Icon,
  Input,
  Person,
} from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import type {
  CompensationTemplateRecord,
  DepartmentRecord,
  EmployeeSummary,
  JobGradeRecord,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { EMPLOYMENT_TYPE_LABEL } from "@/components/records/people-directory";
import { money } from "@/lib/books/format";

export type EmployeeDrawerForm = {
  name: string;
  phone: string;
  email: string;
  nationalIdNumber: string;
  passportPhotoUrl: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  villageOfOrigin: string;
  departmentId: string;
  position: string;
  gradeId: string;
  supervisorId: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL";
  compensationTemplateId: string;
  hireDate: string;
  defaultCurrency: string;
  isActive: boolean;
};

const EMPTY_FORM: EmployeeDrawerForm = {
  name: "",
  phone: "",
  email: "",
  nationalIdNumber: "",
  passportPhotoUrl: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  villageOfOrigin: "",
  departmentId: "",
  position: "SUPPORT_STAFF",
  gradeId: "",
  supervisorId: "",
  employmentType: "FULL_TIME",
  compensationTemplateId: "",
  hireDate: new Date().toISOString().slice(0, 10),
  defaultCurrency: "USD",
  isActive: true,
};

export function EmployeeDrawer({
  open,
  onOpenChange,
  employee,
  departments,
  grades,
  templates,
  supervisors,
  positionOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EmployeeSummary | null;
  departments: DepartmentRecord[];
  grades: JobGradeRecord[];
  templates: CompensationTemplateRecord[];
  supervisors: EmployeeSummary[];
  positionOptions: Array<{ value: string; label: string }>;
  onSaved: (saved: EmployeeDrawerForm, isEdit: boolean) => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<EmployeeDrawerForm>(EMPTY_FORM);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const isEdit = Boolean(employee);

  React.useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({
        name: employee.name || "",
        phone: employee.phone || "",
        email: "",
        nationalIdNumber: employee.nationalIdNumber || "",
        passportPhotoUrl: employee.passportPhotoUrl || "",
        nextOfKinName: employee.nextOfKinName || "",
        nextOfKinPhone: employee.nextOfKinPhone || "",
        villageOfOrigin: employee.villageOfOrigin || "",
        departmentId: employee.departmentId || "",
        position: employee.position || "SUPPORT_STAFF",
        gradeId: employee.gradeId || "",
        supervisorId: employee.supervisorId || "",
        employmentType: (employee.employmentType as EmployeeDrawerForm["employmentType"]) || "FULL_TIME",
        compensationTemplateId: "",
        hireDate: employee.hireDate ? String(employee.hireDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        defaultCurrency: employee.defaultCurrency || "USD",
        isActive: employee.isActive,
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        position: positionOptions[0]?.value || "SUPPORT_STAFF",
        hireDate: new Date().toISOString().slice(0, 10),
      });
    }
    setErrors({});
  }, [open, employee, positionOptions]);

  const set = (key: keyof EmployeeDrawerForm) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const val = event.target.value;
    setForm((curr) => ({ ...curr, [key]: val }));
    if (errors[key]) {
      setErrors((curr) => {
        const next = { ...curr };
        delete next[key];
        return next;
      });
    }
  };

  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("context", "employee-passport");
      fd.append("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Photo upload failed");
      }
      setForm((curr) => ({ ...curr, passportPhotoUrl: data.url }));
      toast({ title: "Photo attached", variant: "success" });
    } catch (err) {
      toast({
        title: "Photo upload failed",
        description: err instanceof Error ? err.message : "Check connection",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  // Live Compensation preview calculation
  const selectedTemplate = React.useMemo(() => {
    return templates.find((t) => t.id === form.compensationTemplateId) || null;
  }, [templates, form.compensationTemplateId]);

  const compensationPreview = React.useMemo(() => {
    if (!selectedTemplate) return null;
    const base = Number(selectedTemplate.baseAmount) || 0;
    // Statutory NSSA 4.5% estimate (capped at $31.50 in standard Zim rules)
    const nssa = Math.min(base * 0.045, 31.5);
    // Estimated PAYE bracket estimate (effective ~15-20% on taxable portion over $100)
    const taxable = Math.max(0, base - 100);
    const paye = taxable > 0 ? taxable * 0.2 : 0;
    const deductions = nssa + paye;
    const net = Math.max(0, base - deductions);

    return {
      currency: selectedTemplate.currency || form.defaultCurrency || "USD",
      base,
      nssa,
      paye,
      deductions,
      net,
    };
  }, [selectedTemplate, form.defaultCurrency]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Full name is required";
    if (!form.phone.trim()) nextErrors.phone = "Phone number is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      // Ensure required fallback values for non-empty backend constraint
      const payload: EmployeeDrawerForm = {
        ...form,
        passportPhotoUrl: form.passportPhotoUrl || "https://corelith.app/assets/placeholder-avatar.png",
        villageOfOrigin: form.villageOfOrigin.trim() || "Harare",
        nextOfKinName: form.nextOfKinName.trim() || form.name.trim(),
        nextOfKinPhone: form.nextOfKinPhone.trim() || form.phone.trim(),
      };
      await onSaved(payload, isEdit);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: isEdit ? "Unable to update employee" : "Unable to create employee",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={isEdit ? `Edit ${form.name || "Employee"}` : "New employee"}
      sub={
        isEdit
          ? "Update team placement, role, and details."
          : "Add a member of staff to the team, payroll, and access permissions."
      }
      width={520}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={isEdit ? "check" : "plus"}
            shortcut="Ctrl ↵"
            busy={busy}
            disabled={busy}
            onClick={handleSave}
          >
            {isEdit ? "Save changes" : "Add employee"}
          </Button>
        </>
      }
    >
      {/* SECTION 1: Identity & Avatar Preview */}
      <DrawerSection title="Identity & Contact">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <Person name={form.name || "Employee"} src={form.passportPhotoUrl || undefined} />
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-line)",
                background: "var(--color-surface)",
                cursor: uploading ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-ink)",
              }}
            >
              <Icon name="upload" />
              {uploading ? "Uploading..." : form.passportPhotoUrl ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={handleUploadPhoto}
              />
            </label>
            <span style={{ display: "block", fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              Passport photo or team headshot
            </span>
          </div>
        </div>

        <Field label="Full name" htmlFor="emp-name" error={errors.name}>
          <Input
            id="emp-name"
            placeholder="e.g. Tendai Chikore"
            value={form.name}
            onChange={set("name")}
            autoFocus={!isEdit}
          />
        </Field>

        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Phone number" htmlFor="emp-phone" error={errors.phone}>
            <Input
              id="emp-phone"
              inputMode="tel"
              placeholder="+263 77..."
              value={form.phone}
              onChange={set("phone")}
            />
          </Field>
          <Field label="National ID" htmlFor="emp-national-id" optional>
            <Input
              id="emp-national-id"
              placeholder="e.g. 63-123456-X-78"
              value={form.nationalIdNumber}
              onChange={set("nationalIdNumber")}
            />
          </Field>
        </div>

        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Next of kin name" htmlFor="emp-nok-name" optional>
            <Input
              id="emp-nok-name"
              placeholder="Contact person"
              value={form.nextOfKinName}
              onChange={set("nextOfKinName")}
            />
          </Field>
          <Field label="Next of kin phone" htmlFor="emp-nok-phone" optional>
            <Input
              id="emp-nok-phone"
              inputMode="tel"
              placeholder="+263..."
              value={form.nextOfKinPhone}
              onChange={set("nextOfKinPhone")}
            />
          </Field>
        </div>
      </DrawerSection>

      {/* SECTION 2: Role & Placement */}
      <DrawerSection title="Role & Placement">
        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Department" htmlFor="emp-dept" optional>
            <select
              id="emp-dept"
              className="select"
              value={form.departmentId}
              onChange={set("departmentId")}
              style={{ width: "100%", height: 36 }}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Position / Role" htmlFor="emp-position">
            <select
              id="emp-position"
              className="select"
              value={form.position}
              onChange={set("position")}
              style={{ width: "100%", height: 36 }}
            >
              {positionOptions.map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Employment type" htmlFor="emp-type">
            <select
              id="emp-type"
              className="select"
              value={form.employmentType}
              onChange={set("employmentType")}
              style={{ width: "100%", height: 36 }}
            >
              {(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"] as const).map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Hire date" htmlFor="emp-hire">
            <Input
              id="emp-hire"
              type="date"
              value={form.hireDate}
              onChange={set("hireDate")}
            />
          </Field>
        </div>

        <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Job Grade" htmlFor="emp-grade" optional>
            <select
              id="emp-grade"
              className="select"
              value={form.gradeId}
              onChange={set("gradeId")}
              style={{ width: "100%", height: 36 }}
            >
              <option value="">Standard Grade</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reports to (Supervisor)" htmlFor="emp-supervisor" optional>
            <select
              id="emp-supervisor"
              className="select"
              value={form.supervisorId}
              onChange={set("supervisorId")}
              style={{ width: "100%", height: 36 }}
            >
              <option value="">None</option>
              {supervisors
                .filter((s) => s.id !== employee?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </DrawerSection>

      {/* SECTION 3: Compensation & Live Statutory Preview */}
      <DrawerSection title="Compensation & Payroll Preview">
        <Field
          label="Compensation Template"
          htmlFor="emp-template"
          help="Calculates gross salary, NSSA, and PAYE tax brackets automatically."
          optional
        >
          <select
            id="emp-template"
            className="select"
            value={form.compensationTemplateId}
            onChange={set("compensationTemplateId")}
            style={{ width: "100%", height: 36 }}
          >
            <option value="">No template (set salary manually in payroll)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} • {money(Number(t.baseAmount) || 0, t.currency || "USD")} ({t.employmentType || "Full time"})
              </option>
            ))}
          </select>
        </Field>

        {compensationPreview ? (
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
              <span>Base Gross Salary</span>
              <span className="num" style={{ fontWeight: 500 }}>
                {money(compensationPreview.base, compensationPreview.currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
              <span>NSSA Pension (4.5% statutory)</span>
              <span className="num">−{money(compensationPreview.nssa, compensationPreview.currency)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
              <span>Estimated PAYE Tax</span>
              <span className="num">−{money(compensationPreview.paye, compensationPreview.currency)}</span>
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
                {money(compensationPreview.net, compensationPreview.currency)}
              </span>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((curr) => ({ ...curr, isActive: e.target.checked }))}
            />
            <span style={{ color: "var(--color-ink)" }}>Employee is active on staff and roster</span>
          </label>
        </div>
      </DrawerSection>
    </Drawer>
  );
}
