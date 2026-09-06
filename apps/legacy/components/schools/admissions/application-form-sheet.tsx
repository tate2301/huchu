"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import type { SchoolsApplicationRecord } from "@/lib/schools/admissions-v2";

const SOURCES = ["Walk-in", "Referral", "Website", "Open day", "Sibling"];

export type ApplicationFormValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  previousSchool: string;
  source: string;
  appliedForClassId: string;
  notes: string;
  /** The entrance test. Only the edit form collects it. */
  assessmentScore: string;
  assessmentAt: string;
};

function emptyValues(): ApplicationFormValues {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    previousSchool: "",
    source: "",
    appliedForClassId: "",
    notes: "",
    assessmentScore: "",
    assessmentAt: "",
  };
}

/**
 * An existing application, in the form's shape.
 *
 * `PATCH /applications/[id]` does not take a name, a date of birth, a gender,
 * a previous school or a source — those are what the family filled in, and
 * correcting them is a new application rather than an edit. They are still
 * loaded so the form shows who it is about, and shown read-only.
 */
function valuesFrom(application: SchoolsApplicationRecord): ApplicationFormValues {
  return {
    firstName: application.firstName,
    lastName: application.lastName,
    dateOfBirth: application.dateOfBirth ? application.dateOfBirth.slice(0, 10) : "",
    gender: application.gender ?? "",
    guardianName: application.guardianName ?? "",
    guardianPhone: application.guardianPhone ?? "",
    guardianEmail: application.guardianEmail ?? "",
    previousSchool: application.previousSchool ?? "",
    source: application.source ?? "",
    appliedForClassId: application.appliedForClass?.id ?? "",
    notes: application.notes ?? "",
    assessmentScore:
      application.assessmentScore === null ? "" : String(application.assessmentScore),
    assessmentAt: application.assessmentAt ? application.assessmentAt.slice(0, 10) : "",
  };
}

/**
 * Taking an application at the desk.
 *
 * Only the child's name is required. An enquiry usually arrives as half a
 * conversation — a name, a phone number, "for Form 1 next year" — and a form
 * that refuses to save without a date of birth is a form the registrar fills in
 * afterwards from a sticky note.
 *
 * The application number is issued by the server rather than typed, so two
 * people at two desks cannot both write APP-0042.
 */
export function ApplicationFormSheet({
  open,
  onOpenChange,
  classes,
  application,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: { id: string; name: string }[];
  /** Absent to take a new application; present to correct one already taken. */
  application?: SchoolsApplicationRecord | null;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: ApplicationFormValues) => void;
}) {
  const editing = Boolean(application);
  const [values, setValues] = useState<ApplicationFormValues>(emptyValues);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(application ? valuesFrom(application) : emptyValues());
  }

  const set = (patch: Partial<ApplicationFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const canSubmit =
    values.firstName.trim().length > 0 && values.lastName.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        editing
          ? `${application?.lastName}, ${application?.firstName}`
          : "New application"
      }
      description={
        editing
          ? "What the office holds. The child's own details came from the family's form; a change to those is a new application."
          : "Only the child's name is needed to start. The rest can follow."
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
            {isSubmitting ? "Saving…" : editing ? "Save changes" : "Take the application"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="application-first">First name</Label>
          <Input
            id="application-first"
            disabled={editing}
            value={values.firstName}
            maxLength={80}
            onChange={(event) => set({ firstName: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-last">Surname</Label>
          <Input
            id="application-last"
            disabled={editing}
            value={values.lastName}
            maxLength={80}
            onChange={(event) => set({ lastName: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-dob">Date of birth</Label>
          <Input
            id="application-dob"
            type="date"
            disabled={editing}
            value={values.dateOfBirth}
            onChange={(event) => set({ dateOfBirth: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-class">Applying for</Label>
          <Select
            value={values.appliedForClassId || "__none__"}
            onValueChange={(value) =>
              set({ appliedForClassId: value === "__none__" ? "" : value })
            }
          >
            <SelectTrigger id="application-class">
              <SelectValue placeholder="Not decided" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not decided</SelectItem>
              {classes.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-guardian">Parent or guardian</Label>
          <Input
            id="application-guardian"
            value={values.guardianName}
            maxLength={120}
            onChange={(event) => set({ guardianName: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-phone">Phone</Label>
          <Input
            id="application-phone"
            value={values.guardianPhone}
            maxLength={40}
            onChange={(event) => set({ guardianPhone: event.target.value })}
          />
          <p className="text-sm text-muted-foreground">
            Also how a sibling already applying is spotted.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-email">Email</Label>
          <Input
            id="application-email"
            type="email"
            value={values.guardianEmail}
            maxLength={160}
            onChange={(event) => set({ guardianEmail: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-previous">Previous school</Label>
          <Input
            id="application-previous"
            disabled={editing}
            value={values.previousSchool}
            maxLength={160}
            onChange={(event) => set({ previousSchool: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="application-source">How they heard</Label>
          <Select
            value={values.source || "__none__"}
            disabled={editing}
            onValueChange={(value) => set({ source: value === "__none__" ? "" : value })}
          >
            <SelectTrigger id="application-source">
              <SelectValue placeholder="Not recorded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not recorded</SelectItem>
              {SOURCES.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {editing ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="application-score">Entrance mark</Label>
              <Input
                id="application-score"
                type="number"
                min={0}
                max={100}
                value={values.assessmentScore}
                onChange={(event) => set({ assessmentScore: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="application-assessed">Assessed on</Label>
              <Input
                id="application-assessed"
                type="date"
                value={values.assessmentAt}
                onChange={(event) => set({ assessmentAt: event.target.value })}
              />
            </div>
          </>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="application-notes">Notes</Label>
          <Textarea
            id="application-notes"
            value={values.notes}
            rows={2}
            maxLength={1000}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </div>
      </div>
    </RecordDialog>
  );
}
