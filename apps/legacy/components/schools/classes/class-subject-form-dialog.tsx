"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson } from "@corelithzw/platform/api-client";
import {
  fetchSchoolsSubjects,
  fetchSchoolsTerms,
  fetchTeacherProfiles,
} from "@/lib/schools/admin-v2";

export type ClassSubjectFormValues = {
  termId: string;
  subjectId: string;
  streamId: string;
  teacherProfileId: string;
};

type Stream = { id: string; code: string; name: string };

/**
 * Timetabling a subject onto a class.
 *
 * Four choices, and the order matters: the term, then what is taught, then to
 * which set of the class, then by whom. A subject already timetabled for the
 * chosen term is off rather than hidden — a head of department looking for
 * Mathematics needs to see that it is there, not conclude the catalogue is
 * missing it.
 *
 * Editing narrows to the two things that genuinely change mid-term: who
 * teaches it, and which stream. Moving an assignment to a different subject
 * would orphan its marks, so the subject is fixed once it exists.
 */
export function ClassSubjectFormDialog({
  open,
  onOpenChange,
  classId,
  className,
  editing,
  takenSubjectIds,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  /** The assignment being changed. Null means a new one. */
  editing: (ClassSubjectFormValues & { subjectName: string }) | null;
  /** `termId:subjectId` pairs already timetabled, so a duplicate cannot be picked. */
  takenSubjectIds: string[];
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: ClassSubjectFormValues) => void;
}) {
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
    enabled: open,
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
    enabled: open,
  });
  const teachersQuery = useQuery({
    queryKey: ["schools", "teacher-profiles"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200, isActive: true }),
    enabled: open,
  });
  const streamsQuery = useQuery({
    queryKey: ["schools", "streams", classId],
    queryFn: () =>
      fetchJson<{ data: Stream[] }>(
        `/api/v2/schools/streams?classId=${classId}&limit=100`,
      ),
    enabled: open,
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(
    // Only what the school currently teaches: a retired subject is one nobody
    // should be able to put back onto a timetable by accident.
    () => (subjectsQuery.data?.data ?? []).filter((row) => row.isActive),
    [subjectsQuery.data],
  );
  const teachers = useMemo(() => teachersQuery.data?.data ?? [], [teachersQuery.data]);
  const streams = useMemo(() => streamsQuery.data?.data ?? [], [streamsQuery.data]);

  const currentTermId = terms.find((term) => term.isActive)?.id ?? terms[0]?.id ?? "";

  const empty: ClassSubjectFormValues = {
    termId: currentTermId,
    subjectId: "",
    streamId: "",
    teacherProfileId: "",
  };

  const [values, setValues] = useState<ClassSubjectFormValues>(editing ?? empty);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(editing ?? empty);
  }

  // The term arrives a tick after the dialog does; seed it once rather than
  // leaving the picker blank on a form whose other choices depend on it.
  if (open && !editing && !values.termId && currentTermId) {
    setValues((current) => ({ ...current, termId: currentTermId }));
  }

  const taken = new Set(takenSubjectIds);
  const canSubmit =
    values.termId.length > 0 &&
    values.subjectId.length > 0 &&
    values.teacherProfileId.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        editing ? `Change who teaches ${editing.subjectName}` : `Timetable a subject`
      }
      description={
        editing
          ? `${className}. Marks already recorded against it stay where they are.`
          : `What ${className} is taught, and by whom. Mark sheets and timetable slots are built from this.`
      }
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
            {isSubmitting
              ? "Saving…"
              : editing
                ? "Save the assignment"
                : "Timetable it"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="class-subject-term">Term</Label>
          <Select
            value={values.termId}
            disabled={Boolean(editing)}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, termId: value }))
            }
          >
            <SelectTrigger id="class-subject-term">
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
          <Label htmlFor="class-subject-subject">Subject</Label>
          <Select
            value={values.subjectId}
            disabled={Boolean(editing)}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, subjectId: value }))
            }
          >
            <SelectTrigger id="class-subject-subject">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem
                  key={subject.id}
                  value={subject.id}
                  disabled={taken.has(`${values.termId}:${subject.id}`)}
                >
                  {subject.name}
                  {taken.has(`${values.termId}:${subject.id}`)
                    ? " — already timetabled"
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editing ? (
            <p className="text-sm text-muted-foreground">
              A timetabled subject cannot be swapped for another — its marks
              would be left pointing at nothing. Take it off and add the other.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-subject-stream">Stream</Label>
          <Select
            value={values.streamId || "__whole__"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                streamId: value === "__whole__" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="class-subject-stream">
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
          <p className="text-sm text-muted-foreground">
            Leave it on the whole class unless one set is taught separately.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-subject-teacher">Teacher</Label>
          <Select
            value={values.teacherProfileId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, teacherProfileId: value }))
            }
          >
            <SelectTrigger id="class-subject-teacher">
              <SelectValue placeholder="Choose a teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </RecordDialog>
  );
}
