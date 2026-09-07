"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { CustomFieldInputs } from "./custom-field-inputs";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson } from "@corelithzw/platform/api-client";
import type { FieldDefinitionRecord } from "@corelithzw/module-records/custom-fields";
import {
  fetchSchoolsClasses,
  fetchSchoolsGuardians,
} from "../../admin-v2";
import type { StudentRollRecord } from "../../students-v2";

export type StudentFormValues = {
  firstName: string;
  lastName: string;
  studentNo: string;
  admissionNo: string;
  dateOfBirth: string;
  gender: string;
  status: string;
  currentClassId: string;
  currentStreamId: string;
  isBoarding: boolean;
  admissionDate: string;
  guardianLinks: { guardianId: string; relationship: string; isPrimary: boolean }[];
  customFields: Record<string, unknown>;
};

const STATUS_OPTIONS = [
  { value: "APPLICANT", label: "Applicant" },
  { value: "ACTIVE", label: "On the roll" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Left — completed" },
  { value: "WITHDRAWN", label: "Left — withdrawn" },
];

/** Free text in the column; a short list here, because typing it is how a roll ends up with six spellings. */
const GENDER_OPTIONS = ["Female", "Male"];

function emptyValues(): StudentFormValues {
  return {
    firstName: "",
    lastName: "",
    studentNo: "",
    admissionNo: "",
    dateOfBirth: "",
    gender: "",
    // A child arriving at the desk is an applicant until somebody puts them on
    // the roll, which is what the admissions pipeline is for.
    status: "APPLICANT",
    currentClassId: "",
    currentStreamId: "",
    isBoarding: false,
    admissionDate: "",
    guardianLinks: [],
    customFields: {},
  };
}

function valuesFrom(student: StudentRollRecord): StudentFormValues {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    studentNo: student.studentNo,
    admissionNo: student.admissionNo ?? "",
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    gender: student.gender ?? "",
    status: student.status,
    currentClassId: student.currentClass?.id ?? "",
    currentStreamId: student.currentStream?.id ?? "",
    isBoarding: student.isBoarding,
    admissionDate: student.admissionDate ? student.admissionDate.slice(0, 10) : "",
    guardianLinks: [],
    customFields: (student.customFields ?? {}) as Record<string, unknown>,
  };
}

/**
 * Putting a child on the roll, and correcting the record afterwards.
 *
 * Before this there was no way to add a student anywhere in the module — the
 * only route onto the roll was an admissions application or a CSV import, so a
 * registrar taking a transfer at the counter in week three had nowhere to type
 * it. One form does both jobs, because the fields are the same fields and a
 * separate edit dialog is how the two drift apart.
 *
 * The student number is left blank by default: the server reserves one, which
 * is what stops two desks both writing CHS-1180. Somebody bringing a number
 * over from the old system can still type it.
 *
 * Guardians are only offered on create. `PATCH /students/[id]` does not take
 * `guardianLinks` — linking a parent to a child is its own endpoint, and the
 * record page is where that relationship is managed.
 */
export function StudentFormSheet({
  open,
  onOpenChange,
  student,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent for a new pupil; present to correct an existing one. */
  student?: StudentRollRecord | null;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: StudentFormValues) => void;
}) {
  const editing = Boolean(student);
  const [values, setValues] = useState<StudentFormValues>(emptyValues);

  // Reset while rendering rather than in an effect, the way the academic year
  // sheet does: opening is a prop change, and an effect would paint the last
  // submission's values once before clearing them.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(student ? valuesFrom(student) : emptyValues());
  }

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
    enabled: open,
  });
  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "picker"],
    queryFn: () => fetchSchoolsGuardians({ page: 1, limit: 300 }),
    enabled: open && !editing,
  });
  const fieldsQuery = useQuery({
    queryKey: ["records", "field-definitions", "STUDENT"],
    queryFn: () =>
      fetchJson<{ data: FieldDefinitionRecord[] }>(
        "/api/v2/schools/field-definitions?entity=STUDENT",
      ),
    enabled: open,
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const guardians = useMemo(() => guardiansQuery.data?.data ?? [], [guardiansQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === values.currentClassId)?.streams ?? [],
    [classes, values.currentClassId],
  );

  const set = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const canSubmit =
    values.firstName.trim().length > 0 &&
    values.lastName.trim().length > 0 &&
    values.guardianLinks.every(
      (link) => link.guardianId !== "" && link.relationship.trim().length > 0,
    );

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${student?.firstName} ${student?.lastName}` : "New student"}
      description={
        editing
          ? "Correcting what the office holds. Guardians and documents are managed on the pupil's own page."
          : "A child joining the school. Leave the student number blank and one is allocated."
      }
      size="lg"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add to the roll"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-first">First name *</Label>
          <Input
            id="student-first"
            value={values.firstName}
            maxLength={120}
            onChange={(event) => set("firstName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-last">Surname *</Label>
          <Input
            id="student-last"
            value={values.lastName}
            maxLength={120}
            onChange={(event) => set("lastName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-no">Student number</Label>
          <Input
            id="student-no"
            value={values.studentNo}
            maxLength={40}
            placeholder={editing ? "" : "Allocated when left blank"}
            onChange={(event) => set("studentNo", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-admission-no">Admission number</Label>
          <Input
            id="student-admission-no"
            value={values.admissionNo}
            maxLength={80}
            placeholder="ADM-0942"
            onChange={(event) => set("admissionNo", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-dob">Date of birth</Label>
          <Input
            id="student-dob"
            type="date"
            value={values.dateOfBirth}
            onChange={(event) => set("dateOfBirth", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-gender">Gender</Label>
          <Select
            value={values.gender || "__none__"}
            onValueChange={(next) => set("gender", next === "__none__" ? "" : next)}
          >
            <SelectTrigger id="student-gender">
              <SelectValue placeholder="Not recorded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not recorded</SelectItem>
              {GENDER_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-year-group">Year group</Label>
          <Select
            value={values.currentClassId || "__none__"}
            onValueChange={(next) => {
              const chosen = next === "__none__" ? "" : next;
              setValues((current) => ({
                ...current,
                currentClassId: chosen,
                // A stream belongs to one year group; keeping the old one
                // across a change is how a pupil lands in Form 2 Blue while
                // sitting in Form 3.
                currentStreamId: "",
              }));
            }}
          >
            <SelectTrigger id="student-year-group">
              <SelectValue placeholder="Not in a year group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not in a year group</SelectItem>
              {classes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-stream">Class</Label>
          <Select
            value={values.currentStreamId || "__none__"}
            onValueChange={(next) =>
              set("currentStreamId", next === "__none__" ? "" : next)
            }
            disabled={streams.length === 0}
          >
            <SelectTrigger id="student-stream">
              <SelectValue
                placeholder={
                  values.currentClassId
                    ? streams.length === 0
                      ? "This year group has no classes"
                      : "Not in a class"
                    : "Choose a year group first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not in a class</SelectItem>
              {streams.map((stream) => (
                <SelectItem key={stream.id} value={stream.id}>
                  {stream.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-status">Status</Label>
          <Select value={values.status} onValueChange={(next) => set("status", next)}>
            <SelectTrigger id="student-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-admitted">Admitted</Label>
          <Input
            id="student-admitted"
            type="date"
            value={values.admissionDate}
            onChange={(event) => set("admissionDate", event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isBoarding}
              onCheckedChange={(checked) => set("isBoarding", checked === true)}
            />
            <span>
              Boarder
              <span className="block text-muted-foreground">
                The warden allocates the bed; this only says the child sleeps here.
              </span>
            </span>
          </Label>
        </div>
      </div>

      {!editing ? (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Guardians</h3>
              <p className="text-sm text-muted-foreground">
                Who the school rings. A child with nobody linked has nobody to bill or
                to tell.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set("guardianLinks", [
                  ...values.guardianLinks,
                  {
                    guardianId: "",
                    relationship: "",
                    isPrimary: values.guardianLinks.length === 0,
                  },
                ])
              }
            >
              Link a guardian
            </Button>
          </div>

          {values.guardianLinks.map((link, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor={`student-guardian-${index}`}>Guardian</Label>
                <Select
                  value={link.guardianId || "__none__"}
                  onValueChange={(next) =>
                    set(
                      "guardianLinks",
                      values.guardianLinks.map((entry, position) =>
                        position === index
                          ? { ...entry, guardianId: next === "__none__" ? "" : next }
                          : entry,
                      ),
                    )
                  }
                >
                  <SelectTrigger id={`student-guardian-${index}`}>
                    <SelectValue placeholder="Choose a parent or guardian" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Choose a parent or guardian</SelectItem>
                    {guardians.map((guardian) => (
                      <SelectItem key={guardian.id} value={guardian.id}>
                        {guardian.lastName}, {guardian.firstName} · {guardian.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`student-relationship-${index}`}>Relationship</Label>
                <Input
                  id={`student-relationship-${index}`}
                  value={link.relationship}
                  placeholder="Mother"
                  maxLength={120}
                  onChange={(event) =>
                    set(
                      "guardianLinks",
                      values.guardianLinks.map((entry, position) =>
                        position === index
                          ? { ...entry, relationship: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={link.isPrimary}
                    onCheckedChange={(checked) =>
                      set(
                        "guardianLinks",
                        // Only one guardian is the one the school rings first,
                        // so choosing a new primary stands the old one down
                        // rather than letting the server refuse the whole form.
                        values.guardianLinks.map((entry, position) => ({
                          ...entry,
                          isPrimary: checked === true ? position === index : entry.isPrimary && position !== index,
                        })),
                      )
                    }
                  />
                  <span>Primary</span>
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set(
                      "guardianLinks",
                      values.guardianLinks.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {(fieldsQuery.data?.data ?? []).length > 0 ? (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <h3 className="text-sm font-medium">This school&rsquo;s own fields</h3>
          <CustomFieldInputs
            idPrefix="student-cf"
            definitions={fieldsQuery.data?.data ?? []}
            values={values.customFields}
            onChange={(key, value) =>
              setValues((current) => ({
                ...current,
                customFields: { ...current.customFields, [key]: value },
              }))
            }
          />
        </div>
      ) : null}
    </RecordDialog>
  );
}
