"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import type { SchoolsAcademicYearRecord } from "@/lib/schools/admin-v2";

export type TermFormValues = {
  academicYearId: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

function emptyValues(defaultYearId: string): TermFormValues {
  return {
    academicYearId: defaultYearId,
    code: "",
    name: "",
    startDate: "",
    endDate: "",
    isActive: true,
  };
}

/**
 * Adding a term to an academic year.
 *
 * The year defaults to the current one, because adding a term to a year that
 * finished two years ago is almost never what someone means, and the API
 * rejects dates that fall outside the chosen year anyway.
 */
export function TermFormSheet({
  open,
  onOpenChange,
  years,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  years: SchoolsAcademicYearRecord[];
  /** The term being edited. Absent means the dialog is opening a new one. */
  initial?: TermFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: TermFormValues) => void;
}) {
  const editing = Boolean(initial);
  const defaultYearId = years.find((year) => year.isActive)?.id ?? years[0]?.id ?? "";
  const [values, setValues] = useState<TermFormValues>(
    () => initial ?? emptyValues(defaultYearId),
  );

  // Reset while rendering rather than in an effect: opening the dialog is a
  // prop change we can respond to directly, and an effect here would render the
  // previous submission's values once before clearing them.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? emptyValues(defaultYearId));
  }

  const selectedYear = years.find((year) => year.id === values.academicYearId);
  const canSubmit =
    values.academicYearId.length > 0 &&
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    values.startDate.length > 0 &&
    values.endDate.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "term"}` : "New term"}
      description="Registers, invoices and result sheets are all recorded against a term."
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
            {isSubmitting ? "Saving…" : editing ? "Save the term" : "Create term"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="term-year">Academic year</Label>
          <Select
            value={values.academicYearId}
            disabled={editing}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, academicYearId: value }))
            }
          >
            <SelectTrigger id="term-year">
              <SelectValue placeholder="Select academic year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.code} - {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedYear ? (
            <p className="text-muted-foreground font-mono">
              {selectedYear.startDate.slice(0, 10)} → {selectedYear.endDate.slice(0, 10)}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-code">Code</Label>
          <Input
            id="term-code"
            value={values.code}
            placeholder="T1"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-name">Name</Label>
          <Input
            id="term-name"
            value={values.name}
            placeholder="Term 1"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-start">Starts</Label>
          <Input
            id="term-start"
            type="date"
            value={values.startDate}
            onChange={(event) =>
              setValues((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-end">Ends</Label>
          <Input
            id="term-end"
            type="date"
            value={values.endDate}
            onChange={(event) =>
              setValues((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isActive}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isActive: checked === true }))
              }
            />
            <span>
              Make this the current term
              <span className="block text-muted-foreground">
                Everything recorded from now on defaults to it. Only one term is current.
              </span>
            </span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
