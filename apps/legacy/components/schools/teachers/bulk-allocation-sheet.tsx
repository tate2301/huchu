"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import type {
  SchoolsClassRecord,
  TeacherProfileRecord,
  TeacherSubjectRecord,
} from "@/lib/schools/admin-v2";

export type BulkAllocationValues = {
  subjectId: string;
  teacherProfileId: string;
  classIds: string[];
};

export type BulkAllocationResult = {
  created: number;
  reassigned: number;
  unchanged: number;
  nowClashing: string[];
};

/**
 * Giving one teacher a subject across several year groups at once.
 *
 * The other half-day a term start costs. A head of department assigning maths
 * across six forms does the same thing six times through a dialog, and the
 * sixth is where the mistake goes in.
 *
 * Creating an allocation and moving one are the same action here, deliberately:
 * the question being answered is "who teaches Form 2 maths this term", and
 * whether a row already exists is not something the person answering it should
 * have to know first.
 */
export function BulkAllocationSheet({
  open,
  onOpenChange,
  subjects,
  teachers,
  classes,
  isSubmitting,
  error,
  result,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: TeacherSubjectRecord[];
  teachers: TeacherProfileRecord[];
  classes: SchoolsClassRecord[];
  isSubmitting: boolean;
  error: string | null;
  result: BulkAllocationResult | null;
  onSubmit: (values: BulkAllocationValues) => void;
}) {
  const [values, setValues] = useState<BulkAllocationValues>({
    subjectId: "",
    teacherProfileId: "",
    classIds: [],
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues({ subjectId: "", teacherProfileId: "", classIds: [] });
  }

  function toggleClass(classId: string) {
    setValues((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }));
  }

  const canSubmit =
    Boolean(values.subjectId) &&
    Boolean(values.teacherProfileId) &&
    values.classIds.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Allocate a teacher"
      description="Give one teacher a subject across several year groups."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button disabled={!canSubmit || isSubmitting} onClick={() => onSubmit(values)}>
            {isSubmitting ? "Allocating…" : "Allocate"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not allocate</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <AlertTitle>
              {result.created + result.reassigned} allocation
              {result.created + result.reassigned === 1 ? "" : "s"} written
            </AlertTitle>
            <AlertDescription>
              <p>
                {result.created} new, {result.reassigned} moved to this teacher,{" "}
                {result.unchanged} already theirs.
              </p>
              {result.nowClashing.length > 0 ? (
                <p>
                  {result.nowClashing.length} timetabled lesson
                  {result.nowClashing.length === 1 ? "" : "s"} now clash with
                  something else this teacher is doing. Nothing was removed —
                  open the timetable and move them.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="bulk-subject">Subject</Label>
          <Select
            value={values.subjectId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, subjectId: value }))
            }
          >
            <SelectTrigger id="bulk-subject" className="w-full">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bulk-teacher">Teacher</Label>
          <Select
            value={values.teacherProfileId}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, teacherProfileId: value }))
            }
          >
            <SelectTrigger id="bulk-teacher" className="w-full">
              <SelectValue placeholder="Choose a teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.user.name}
                  {teacher.department ? ` · ${teacher.department}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Year groups</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((schoolClass) => (
              <label key={schoolClass.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.classIds.includes(schoolClass.id)}
                  onCheckedChange={() => toggleClass(schoolClass.id)}
                />
                {schoolClass.name}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            A year group that already has this subject under another teacher is
            moved to this one.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
