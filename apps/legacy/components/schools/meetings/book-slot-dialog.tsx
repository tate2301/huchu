"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@corelithzw/react";

import { Label } from "@corelithzw/ui/components/label";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchSchoolsGuardians, fetchSchoolsStudents } from "@/lib/schools/admin-v2";

export type BookSlotValues = {
  studentId: string;
  guardianId: string;
  notes: string;
};

/** What an edit opens holding: the booking already on the slot. */
export type BookSlotDefaults = BookSlotValues & {
  /** Seeds the pupil search so the chosen child is in the list on open. */
  search: string;
};

/**
 * Taking a booking at the desk.
 *
 * Families book their own ten minutes from the portal, which is the point of
 * the model — but a parent without an account rings the office instead, and
 * until now the office could see the free slot and had no way to fill it. Every
 * evening ends with a handful of empty rows that somebody had asked for over
 * the telephone.
 *
 * The pupil is chosen from the roll, never typed: a booking is a row against a
 * real child, and a mistyped identifier is a meeting the teacher turns up to
 * about nobody. The guardian list narrows to that pupil's own, because the
 * question after "which child" is "which of their people is coming", and
 * offering the whole parent body is how the wrong Moyo gets recorded.
 *
 * The same form does the edit. Changing who is coming asks exactly the three
 * questions booking does, so a second dialog would be the same fields with a
 * different heading — which is how the two drift apart.
 */
export function BookSlotDialog({
  open,
  onOpenChange,
  when,
  teacherName,
  title = "Book for a family",
  submitLabel = "Book the slot",
  defaults,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "17:20 – 17:30 on 12 March 2026" — the slot being filled, stated not chosen. */
  when: string;
  teacherName: string;
  /** The dialog's heading. An edit says what it is doing. */
  title?: string;
  submitLabel?: string;
  /** Seeded on an edit; absent for a fresh booking. */
  defaults?: BookSlotDefaults;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: BookSlotValues) => void;
}) {
  const [search, setSearch] = useState(defaults?.search ?? "");
  const [studentId, setStudentId] = useState(defaults?.studentId ?? "");
  const [guardianId, setGuardianId] = useState(defaults?.guardianId ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "for-booking", search],
    queryFn: () =>
      fetchSchoolsStudents({
        page: 1,
        limit: 50,
        status: "ACTIVE",
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
  });

  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "for-booking", studentId],
    queryFn: () => fetchSchoolsGuardians({ page: 1, limit: 20, studentId }),
    enabled: Boolean(studentId),
  });

  const students = studentsQuery.data?.data ?? [];
  const guardians = guardiansQuery.data?.data ?? [];

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${when} with ${teacherName}`}
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (studentId && !isSubmitting) onSubmit({ studentId, guardianId, notes });
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!studentId} loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="danger" title="The slot was not booked">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="booking-search">Find the pupil</Label>
        <Input
          id="booking-search"
          value={search}
          placeholder="Name or student number"
          onChange={(event) => {
            setSearch(event.target.value);
            // The chosen pupil is cleared with the search that found them:
            // leaving a selection behind a list it is no longer in is how a
            // booking lands on the child somebody scrolled past.
            setStudentId("");
            setGuardianId("");
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-student">Pupil</Label>
        <Select
          value={studentId}
          onValueChange={(value) => {
            setStudentId(value);
            setGuardianId("");
          }}
        >
          <SelectTrigger id="booking-student" className="w-full">
            <SelectValue
              placeholder={
                studentsQuery.isPending ? "Reading the roll…" : "Choose a pupil"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {students.map((student) => (
              <SelectItem key={student.id} value={student.id}>
                {student.lastName}, {student.firstName} · {student.studentNo}
                {student.currentClass ? ` · ${student.currentClass.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!studentsQuery.isPending && students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody on the roll matches that. Try a surname or a student number.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-guardian">Who is coming</Label>
        <Select
          value={guardianId || "none"}
          onValueChange={(value) => setGuardianId(value === "none" ? "" : value)}
        >
          <SelectTrigger id="booking-guardian" className="w-full">
            <SelectValue placeholder="Not named" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not named</SelectItem>
            {guardians.map((guardian) => (
              <SelectItem key={guardian.id} value={guardian.id}>
                {guardian.firstName} {guardian.lastName} · {guardian.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {studentId
            ? "Optional, but a name and a number is what the teacher rings if the evening moves."
            : "Choose a pupil first and their own guardians appear here."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-notes">What they want to talk about</Label>
        <Textarea
          id="booking-notes"
          rows={3}
          value={notes}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}
