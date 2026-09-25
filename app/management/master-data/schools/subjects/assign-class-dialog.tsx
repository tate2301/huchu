"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsTerms,
  fetchTeacherProfiles,
} from "@/lib/schools/admin-v2";

/**
 * Putting this subject onto a class's timetable, from the subject's side.
 *
 * `ClassSubjectFormDialog` asks the same question the other way round — it
 * fixes the class and picks the subject, because it is opened from a class.
 * The subject record is opened to ask "who takes this", so the verb on its
 * "Classes taking it" heading has to fix the subject and pick the class. Same
 * endpoint (`POST /api/v2/schools/teachers/assignments`), same four fields,
 * opposite constant — which is why this is a second dialog rather than a prop
 * on the first one: a component owned by the classes module that sometimes
 * disables its own class picker is harder to read than two short forms.
 *
 * The order the fields ask in is the order the answer arrives in: which term,
 * which class, which set of it, and who takes them.
 */

export type AssignClassValues = {
  termId: string;
  classId: string;
  streamId: string;
  teacherProfileId: string;
};

type Stream = { id: string; code: string; name: string };

export function AssignClassDialog({
  open,
  onOpenChange,
  subjectName,
  /** `termId:classId:streamId` triples already timetabled, so no duplicate. */
  takenKeys,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
  takenKeys: string[];
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: AssignClassValues) => void;
}) {
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
    enabled: open,
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
    enabled: open,
  });
  const teachersQuery = useQuery({
    queryKey: ["schools", "teacher-profiles"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200, isActive: true }),
    enabled: open,
  });

  const [values, setValues] = React.useState<AssignClassValues>({
    termId: "",
    classId: "",
    streamId: "",
    teacherProfileId: "",
  });

  // The streams of the chosen class, and only once one is chosen — a school
  // that streams Form 1 and not Form 4 should not be offered Form 1's sets
  // while Form 4 is selected.
  const streamsQuery = useQuery({
    queryKey: ["schools", "streams", values.classId],
    queryFn: () =>
      fetchJson<{ data: Stream[] }>(
        `/api/v2/schools/streams?classId=${values.classId}&limit=100`,
      ),
    enabled: open && values.classId.length > 0,
  });

  const terms = React.useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const classes = React.useMemo(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );
  const teachers = React.useMemo(
    () => teachersQuery.data?.data ?? [],
    [teachersQuery.data],
  );
  const streams = React.useMemo(
    () => streamsQuery.data?.data ?? [],
    [streamsQuery.data],
  );

  const currentTermId = terms.find((term) => term.isActive)?.id ?? terms[0]?.id ?? "";

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues({
        termId: currentTermId,
        classId: "",
        streamId: "",
        teacherProfileId: "",
      });
    }
  }

  // The terms land a tick after the dialog does; seed the current one once
  // rather than leaving blank the picker every other choice hangs off.
  if (open && !values.termId && currentTermId) {
    setValues((current) => ({ ...current, termId: currentTermId }));
  }

  const taken = new Set(takenKeys);
  const isTaken = (classId: string) =>
    taken.has(`${values.termId}:${classId}:`);

  const canSubmit =
    values.termId.length > 0 &&
    values.classId.length > 0 &&
    values.teacherProfileId.length > 0 &&
    !taken.has(`${values.termId}:${values.classId}:${values.streamId}`);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign ${subjectName} to a class`}
      size="md"
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
            {isSubmitting ? "Saving…" : "Assign it"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="assign-class-term">Term</Label>
          <Select
            value={values.termId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, termId: value }))
            }
          >
            <SelectTrigger id="assign-class-term">
              <SelectValue placeholder="Choose a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                  {term.isActive ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-class-class">Class</Label>
          <Select
            value={values.classId}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                classId: value,
                // The sets belong to the class that was just replaced.
                streamId: "",
              }))
            }
          >
            <SelectTrigger id="assign-class-class">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((row) => (
                <SelectItem
                  key={row.id}
                  value={row.id}
                  disabled={isTaken(row.id)}
                >
                  {row.name}
                  {isTaken(row.id) ? " — already takes it" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-class-stream">Stream</Label>
          <Select
            value={values.streamId || "__whole__"}
            disabled={!values.classId}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                streamId: value === "__whole__" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="assign-class-stream">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__whole__">The whole class</SelectItem>
              {streams.map((stream) => (
                <SelectItem key={stream.id} value={stream.id}>
                  {stream.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-class-teacher">Teacher</Label>
          <Select
            value={values.teacherProfileId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, teacherProfileId: value }))
            }
          >
            <SelectTrigger id="assign-class-teacher">
              <SelectValue placeholder="Choose a teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.user.name || teacher.employeeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </RecordDialog>
  );
}
