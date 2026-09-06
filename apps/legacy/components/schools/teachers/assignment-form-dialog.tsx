"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Switch } from "@corelithzw/react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsTerms,
  fetchTeacherProfiles,
  fetchTeacherSubjects,
} from "@/lib/schools/admin-v2";

/**
 * One line of the timetable: who teaches what, to which form, in which term.
 *
 * The bulk sheet beside this puts one subject in front of one teacher across
 * several classes at once, which is how a term is set up from nothing. This is
 * the other half — the single row, added, corrected or retired, which is what
 * the rest of the year consists of: a teacher goes on maternity leave, a set is
 * split, a subject moves to the other side of the department.
 *
 * The stream list follows the chosen class rather than listing every stream in
 * the school, because the API refuses a stream that belongs to another class
 * and a picker that offers one is a picker that offers an error.
 */

export type AssignmentFormValues = {
  id: string | null;
  termId: string;
  classId: string;
  streamId: string;
  subjectId: string;
  teacherProfileId: string;
  isActive: boolean;
};

export const EMPTY_ASSIGNMENT: AssignmentFormValues = {
  id: null,
  termId: "",
  classId: "",
  streamId: "",
  subjectId: "",
  teacherProfileId: "",
  isActive: true,
};

/** The picker's "no stream" row. A `Select` cannot hold an empty item value. */
const WHOLE_CLASS = "__whole-class__";

export function AssignmentFormDialog({
  open,
  onOpenChange,
  initial,
  /** Fixed when the dialog is opened from a teacher's own record. */
  lockedTeacherName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AssignmentFormValues;
  lockedTeacherName?: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AssignmentFormValues>(initial);

  const seed = `${open}:${initial.id ?? "new"}:${initial.teacherProfileId}`;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && seeded !== seed) {
    setSeeded(seed);
    setForm(initial);
  }

  const termsQuery = useQuery({
    queryKey: ["schools", "teachers", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
    enabled: open,
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "teachers", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
    enabled: open,
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects", "active"],
    queryFn: () => fetchTeacherSubjects({ page: 1, limit: 200, isActive: true }),
    enabled: open,
  });
  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "active"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200, isActive: true }),
    enabled: open && !lockedTeacherName,
  });

  const classes = classesQuery.data?.data ?? [];
  const streams = useMemo(
    () => classes.find((entry) => entry.id === form.classId)?.streams ?? [],
    [classes, form.classId],
  );

  const save = useMutation({
    mutationFn: () => {
      const body = {
        termId: form.termId,
        classId: form.classId,
        streamId: form.streamId || null,
        subjectId: form.subjectId,
        teacherProfileId: form.teacherProfileId,
        isActive: form.isActive,
      };
      return form.id
        ? fetchJson(`/api/v2/schools/teachers/assignments/${form.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson("/api/v2/schools/teachers/assignments", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "teacher"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      onOpenChange(false);
    },
  });

  const missing: string[] = [];
  if (!form.termId) missing.push("Which term this runs in.");
  if (!form.classId) missing.push("Which form is taught.");
  if (!form.subjectId) missing.push("Which subject.");
  if (!form.teacherProfileId) missing.push("Who teaches it.");

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Change this assignment" : "Add an assignment"}
      description={
        lockedTeacherName
          ? `What ${lockedTeacherName} teaches, and to whom.`
          : "Who teaches what, to which form, in which term."
      }
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
            {form.id ? "Save the assignment" : "Add the assignment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Picker
          id="assignment-term"
          label="Term"
          value={form.termId}
          placeholder={termsQuery.isPending ? "Loading terms…" : "Choose a term"}
          options={(termsQuery.data?.data ?? []).map((term) => ({
            value: term.id,
            label: `${term.name} · ${term.academicYear.name}`,
          }))}
          onChange={(value) => setForm((current) => ({ ...current, termId: value }))}
        />

        <Picker
          id="assignment-class"
          label="Year group"
          value={form.classId}
          placeholder={classesQuery.isPending ? "Loading classes…" : "Choose a class"}
          options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
          // Changing the class drops the stream: a stream from the old class
          // would be refused by the API and is meaningless here anyway.
          onChange={(value) =>
            setForm((current) => ({ ...current, classId: value, streamId: "" }))
          }
        />

        {streams.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="assignment-stream">Stream</Label>
            <Select
              value={form.streamId || WHOLE_CLASS}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  streamId: value === WHOLE_CLASS ? "" : value,
                }))
              }
            >
              <SelectTrigger id="assignment-stream">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_CLASS}>The whole year group</SelectItem>
                {streams.map((stream) => (
                  <SelectItem key={stream.id} value={stream.id}>
                    {stream.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Picker
          id="assignment-subject"
          label="Subject"
          value={form.subjectId}
          placeholder={subjectsQuery.isPending ? "Loading subjects…" : "Choose a subject"}
          options={(subjectsQuery.data?.data ?? []).map((subject) => ({
            value: subject.id,
            label: `${subject.name} · ${subject.code}`,
          }))}
          onChange={(value) => setForm((current) => ({ ...current, subjectId: value }))}
        />

        {lockedTeacherName ? null : (
          <Picker
            id="assignment-teacher"
            label="Teacher"
            value={form.teacherProfileId}
            placeholder={profilesQuery.isPending ? "Loading staff…" : "Choose a teacher"}
            options={(profilesQuery.data?.data ?? []).map((profile) => ({
              value: profile.id,
              label: `${profile.user.name} · ${profile.employeeCode}`,
            }))}
            onChange={(value) =>
              setForm((current) => ({ ...current, teacherProfileId: value }))
            }
          />
        )}

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <Switch
            label="Still running"
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Turning this off retires the lesson without deleting the marks
            already recorded against it.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}

function Picker({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
