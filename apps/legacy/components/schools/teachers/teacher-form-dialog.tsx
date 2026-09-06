"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Combobox, Switch } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { DEPARTMENT_SUGGESTIONS } from "@/components/schools/teachers/departments";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchTeacherProfileUsers, fetchTeacherProfiles } from "@/lib/schools/admin-v2";

/**
 * A teacher profile, created and corrected.
 *
 * The dialog this replaces could only create, and only from a `<Select>` of
 * every user in the company — which on a school of forty staff is a scrolling
 * list with no search in it. It is a combobox now, and the same form edits an
 * existing profile.
 *
 * What it does *not* offer is the teacher's name, email or phone. A teacher is
 * one person with two records — this profile, which is the school's view, and a
 * `User`, which is the account — and the account owns those. Putting a second
 * editor on them is how two screens end up disagreeing about one fact.
 */

export type TeacherFormValues = {
  id: string | null;
  userId: string;
  employeeCode: string;
  department: string;
  isClassTeacher: boolean;
  isHod: boolean;
  isActive: boolean;
  /** Shown instead of the picker when editing — the account cannot be swapped here. */
  userLabel: string;
};

export const EMPTY_TEACHER: TeacherFormValues = {
  id: null,
  userId: "",
  employeeCode: "",
  department: "",
  isClassTeacher: false,
  isHod: false,
  isActive: true,
  userLabel: "",
};

export function TeacherFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TeacherFormValues;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TeacherFormValues>(initial);

  const seed = `${open}:${initial.id ?? "new"}`;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && seeded !== seed) {
    setSeeded(seed);
    setForm(initial);
  }

  const editing = initial.id !== null;

  const usersQuery = useQuery({
    queryKey: ["schools", "teachers", "profile-users"],
    queryFn: () => fetchTeacherProfileUsers({ page: 1, limit: 500, active: true }),
    enabled: open && !editing,
  });
  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "all"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 500 }),
    enabled: open && !editing,
  });

  const taken = useMemo(
    () => new Set((profilesQuery.data?.data ?? []).map((profile) => profile.user.id)),
    [profilesQuery.data],
  );

  const userOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? [])
        // One account is one teacher; offering a colleague who already has a
        // profile offers a unique-constraint error dressed as a choice.
        .filter((user) => !taken.has(user.id))
        .map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` })),
    [usersQuery.data, taken],
  );

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        employeeCode: form.employeeCode.trim(),
        department: form.department.trim() || null,
        isClassTeacher: form.isClassTeacher,
        isHod: form.isHod,
        isActive: form.isActive,
      };
      if (editing) {
        return fetchJson(`/api/v2/schools/teachers/profiles/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      body.userId = form.userId;
      return fetchJson("/api/v2/schools/teachers/profiles", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      if (initial.id) {
        void queryClient.invalidateQueries({ queryKey: ["schools", "teacher", initial.id] });
      }
      onOpenChange(false);
    },
  });

  const missing: string[] = [];
  if (!editing && !form.userId) missing.push("Which staff account this is.");
  if (!form.employeeCode.trim()) missing.push("A staff number.");

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${form.userLabel || "this teacher"}` : "Add a teacher"}
      description="The school's view of a member of staff. Their name and contact details belong to their account."
      size="md"
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
            {editing ? "Save the changes" : "Add the teacher"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? (
          <div className="space-y-1.5">
            <Label>Account</Label>
            <p className="text-sm text-[var(--text-muted)]">
              {form.userLabel} — changed in user management, not here.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Staff account</Label>
            <Combobox
              options={userOptions}
              value={form.userId}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, userId: value }))
              }
              placeholder={
                usersQuery.isPending || profilesQuery.isPending
                  ? "Loading staff accounts…"
                  : "Search staff accounts"
              }
            />
            {!usersQuery.isPending && userOptions.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Every active account already has a teacher profile. Create the
                account under user management first.
              </p>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="teacher-employeeCode">
            Staff number<span className="text-[var(--tone-danger)]"> *</span>
          </Label>
          <Input
            id="teacher-employeeCode"
            value={form.employeeCode}
            onChange={(event) =>
              setForm((current) => ({ ...current, employeeCode: event.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="teacher-department">Department</Label>
          <Input
            id="teacher-department"
            value={form.department}
            placeholder="Mathematics"
            // A suggestion list rather than a `<Select>`: the column is free
            // text and a school that runs "Business and Enterprise" means it.
            // Offering the usual spellings stops the staff list's Department
            // filter growing a separate entry for "Maths" and "Mathematics".
            list="teacher-department-options"
            onChange={(event) =>
              setForm((current) => ({ ...current, department: event.target.value }))
            }
          />
          <datalist id="teacher-department-options">
            {DEPARTMENT_SUGGESTIONS.map((department) => (
              <option key={department} value={department} />
            ))}
          </datalist>
        </div>

        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <Switch
            label="Holds a form"
            checked={form.isClassTeacher}
            onChange={(event) =>
              setForm((current) => ({ ...current, isClassTeacher: event.target.checked }))
            }
          />
          <Switch
            label="Head of department"
            checked={form.isHod}
            onChange={(event) =>
              setForm((current) => ({ ...current, isHod: event.target.checked }))
            }
          />
          <Switch
            label="Currently teaching"
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          <p className="text-sm text-[var(--text-muted)]">
            A teacher who has left is turned off rather than deleted — their
            marks, registers and timetable history stay where they are.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
