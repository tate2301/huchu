"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Combobox } from "@corelithzw/react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";
import { RELATIONSHIP_OPTIONS } from "./relationships";

/**
 * Adding a guardian, and correcting one.
 *
 * There was no way to add a guardian at all: the list rendered a hundred
 * parents and offered one verb, "invite", so the only route onto it was the
 * spreadsheet importer or the admissions form. A school that takes a pupil in
 * mid-term had nowhere to put the mother's phone number.
 *
 * Creating one asks for the first child in the same breath, because a guardian
 * with no children is a contact of record and nothing else — they receive
 * nothing, appear on no fee letter, and are the commonest kind of orphan row
 * in this table. It is optional rather than required: a second parent whose
 * child is already on the books is added from the pupil's own record.
 */

export type GuardianFormValues = {
  id: string | null;
  guardianNo: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  nationalId: string;
};

export const EMPTY_GUARDIAN: GuardianFormValues = {
  id: null,
  guardianNo: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  nationalId: "",
};

/** Empty string means "not known", which the routes take as null. */
function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function GuardianFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null id creates; an id edits that guardian. */
  initial: GuardianFormValues;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GuardianFormValues>(initial);
  const [studentId, setStudentId] = useState("");
  const [relationship, setRelationship] = useState("MOTHER");

  // Re-seed whenever the dialog is opened on a different record, rather than
  // in an effect: a form that keeps the last guardian's phone number is how
  // one parent's details get written onto another.
  const [seeded, setSeeded] = useState<string | null>(null);
  const seed = `${open}:${initial.id ?? "new"}`;
  if (open && seeded !== seed) {
    setSeeded(seed);
    setForm(initial);
    setStudentId("");
    setRelationship("MOTHER");
  }

  const editing = initial.id !== null;

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "picker"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300 }),
    enabled: open && !editing,
  });

  const studentOptions = useMemo(
    () =>
      (studentsQuery.data?.data ?? []).map((student) => ({
        value: student.id,
        label: `${student.lastName}, ${student.firstName} · ${student.studentNo}${
          student.currentClass ? ` · ${student.currentClass.name}` : ""
        }`,
      })),
    [studentsQuery.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: orNull(form.email),
        address: orNull(form.address),
        nationalId: orNull(form.nationalId),
      };
      if (orNull(form.guardianNo)) body.guardianNo = form.guardianNo.trim();

      if (editing) {
        return fetchJson(`/api/v2/schools/guardians/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      if (studentId) {
        body.studentLinks = [{ studentId, relationship }];
      }
      return fetchJson("/api/v2/schools/guardians", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
      if (initial.id) {
        void queryClient.invalidateQueries({ queryKey: ["schools", "guardian", initial.id] });
      }
      onSaved?.();
      onOpenChange(false);
    },
  });

  const missing: string[] = [];
  if (!form.firstName.trim()) missing.push("A first name.");
  if (!form.lastName.trim()) missing.push("A surname.");
  if (!form.phone.trim()) missing.push("A phone number — it is how the school reaches them.");

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${form.firstName} ${form.lastName}`.trim() : "Add a guardian"}
      description={
        editing
          ? "Their contact details. Consent for each child is set on the child's row."
          : "Who is responsible for a pupil, and how the school reaches them."
      }
      size="lg"
      errors={save.error ? [getApiErrorMessage(save.error)] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (missing.length > 0) return;
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={missing.length > 0}
            loading={save.isPending}
          >
            {editing ? "Save the changes" : "Add the guardian"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="guardian-firstName" label="First name" required>
          <Input
            id="guardian-firstName"
            value={form.firstName}
            onChange={(event) =>
              setForm((current) => ({ ...current, firstName: event.target.value }))
            }
          />
        </Field>
        <Field id="guardian-lastName" label="Surname" required>
          <Input
            id="guardian-lastName"
            value={form.lastName}
            onChange={(event) =>
              setForm((current) => ({ ...current, lastName: event.target.value }))
            }
          />
        </Field>
        <Field id="guardian-phone" label="Phone" required>
          <Input
            id="guardian-phone"
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </Field>
        <Field
          id="guardian-email"
          label="Email"
          hint="Needed for a portal invitation. Blank is fine otherwise."
        >
          <Input
            id="guardian-email"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
          />
        </Field>
        <Field id="guardian-nationalId" label="National ID">
          <Input
            id="guardian-nationalId"
            value={form.nationalId}
            onChange={(event) =>
              setForm((current) => ({ ...current, nationalId: event.target.value }))
            }
          />
        </Field>
        <Field
          id="guardian-guardianNo"
          label="Guardian number"
          hint={editing ? undefined : "Left blank, the school's next number is taken."}
        >
          <Input
            id="guardian-guardianNo"
            value={form.guardianNo}
            onChange={(event) =>
              setForm((current) => ({ ...current, guardianNo: event.target.value }))
            }
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="guardian-address" label="Address">
            <Input
              id="guardian-address"
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
            />
          </Field>
        </div>
      </div>

      {editing ? null : (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">
            Their first child
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Optional, and more can be added from the guardian&rsquo;s record. Until
            there is one, this guardian receives nothing and can see nothing.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pupil</Label>
              <Combobox
                options={studentOptions}
                value={studentId}
                onValueChange={setStudentId}
                placeholder={
                  studentsQuery.isPending ? "Loading the roll…" : "Search the roll"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guardian-relationship">Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger id="guardian-relationship">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </RecordDialog>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-[var(--tone-danger)]"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-sm text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}
