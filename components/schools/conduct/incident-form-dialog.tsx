"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchStudentRoll } from "@/lib/schools/students-v2";
import {
  logIncident,
  updateIncident,
  type ConductCategory,
  type IncidentRow,
} from "@/lib/schools/conduct-v2";

/**
 * `Log an incident`.
 *
 * A dialog rather than a page, per rule 4 of the expansion canvas's
 * composition rules: forms live in dialogs. Seven fields, so a dialog and not a
 * sheet.
 *
 * The sanction is optional on purpose. A teacher logging what happened in her
 * lesson at 11:58 is not the person who decides the sanction, and forcing one
 * here would either invent a decision or stop the log being written until
 * somebody senior was free. `Not decided` is a real state and the band chip
 * counts it.
 */

type Values = {
  studentId: string;
  categoryId: string;
  occurredAt: string;
  summary: string;
  location: string;
  period: string;
  sanction: string;
  sanctionTone: "PLAIN" | "WARN" | "BAD";
  homeToldNeeded: boolean;
};

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EMPTY = (): Values => ({
  studentId: "",
  categoryId: "",
  occurredAt: localDateTime(),
  summary: "",
  location: "",
  period: "",
  sanction: "",
  sanctionTone: "PLAIN",
  homeToldNeeded: true,
});

export function IncidentFormDialog({
  open,
  onOpenChange,
  incident,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The incident being corrected. Absent means a new one. */
  incident: IncidentRow | null;
  categories: ConductCategory[];
  onSaved: () => void;
}) {
  const editing = Boolean(incident);
  const [values, setValues] = useState<Values>(EMPTY());
  const [error, setError] = useState<string | null>(null);
  const [pupilSearch, setPupilSearch] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setPupilSearch("");
      setValues(
        incident
          ? {
              studentId: incident.student.id,
              categoryId: incident.category.id,
              occurredAt: localDateTime(incident.occurredAt),
              summary: incident.summary,
              location: incident.location ?? "",
              period: incident.period ? String(incident.period) : "",
              sanction: incident.sanction ?? "",
              sanctionTone: incident.sanctionTone,
              homeToldNeeded: incident.homeToldNeeded,
            }
          : EMPTY(),
      );
    }
  }

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "picker", pupilSearch],
    queryFn: () => fetchStudentRoll({ limit: 25, search: pupilSearch || undefined, status: "ACTIVE" }),
    enabled: open && !editing,
  });

  const pupils = useMemo(() => rollQuery.data?.data ?? [], [rollQuery.data]);
  const category = categories.find((entry) => entry.id === values.categoryId);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        studentId: values.studentId,
        categoryId: values.categoryId,
        occurredAt: new Date(values.occurredAt).toISOString(),
        summary: values.summary.trim(),
        location: values.location.trim() || null,
        period: values.period ? Number(values.period) : null,
        sanction: values.sanction.trim() || null,
        sanctionTone: values.sanctionTone,
        homeToldNeeded: values.homeToldNeeded,
      };
      return incident ? updateIncident(incident.id, payload) : logIncident(payload);
    },
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const canSubmit =
    values.categoryId.length > 0 &&
    values.summary.trim().length > 0 &&
    (editing || values.studentId.length > 0);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Correct ${incident?.reference}` : "Log an incident"}
      description="One thing that happened, once. The sanction can be decided later; the fact cannot be added later."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !save.isPending) save.mutate();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save the correction" : "Log it"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {editing ? (
          <div className="space-y-1 sm:col-span-2">
            <Label>Pupil</Label>
            <p className="text-sm text-[color:var(--text-body)]">
              {incident?.student.lastName}, {incident?.student.firstName}{" "}
              <span className="font-mono text-xs text-[color:var(--text-muted)]">
                {incident?.student.studentNo}
              </span>
            </p>
            {/* The pupil is not editable on a correction. An incident logged
                against the wrong child is a new incident and a deleted one,
                not a row that quietly changes whose record it is on. */}
            <p className="text-xs text-[color:var(--text-muted)]">
              Logged against the wrong pupil? Log it again on the right one — this row stays
              where it is.
            </p>
          </div>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="incident-pupil-search">Pupil</Label>
            <Input
              id="incident-pupil-search"
              value={pupilSearch}
              onChange={(event) => setPupilSearch(event.target.value)}
              placeholder="Search name or number"
            />
            <Select
              value={values.studentId}
              onValueChange={(next) => setValues((current) => ({ ...current, studentId: next }))}
            >
              <SelectTrigger id="incident-pupil">
                <SelectValue placeholder={rollQuery.isPending ? "Reading the roll…" : "Pick a pupil"} />
              </SelectTrigger>
              <SelectContent>
                {pupils.map((pupil) => (
                  <SelectItem key={pupil.id} value={pupil.id}>
                    {pupil.lastName}, {pupil.firstName} · {pupil.studentNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="incident-category">What happened</Label>
          <Select
            value={values.categoryId}
            onValueChange={(next) => setValues((current) => ({ ...current, categoryId: next }))}
          >
            <SelectTrigger id="incident-category">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category?.demeritPoints ? (
            // Said before the click rather than discovered afterwards: one act,
            // two rows.
            <p className="text-xs text-[color:var(--text-muted)]">
              Logging this also records {category.demeritPoints}{" "}
              {category.demeritPoints === 1 ? "demerit" : "demerits"}.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="incident-when">When</Label>
          <Input
            id="incident-when"
            type="datetime-local"
            value={values.occurredAt}
            onChange={(event) =>
              setValues((current) => ({ ...current, occurredAt: event.target.value }))
            }
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="incident-summary">One line of fact</Label>
          <Textarea
            id="incident-summary"
            value={values.summary}
            rows={2}
            maxLength={500}
            onChange={(event) =>
              setValues((current) => ({ ...current, summary: event.target.value }))
            }
            placeholder="Late again, missed registration"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="incident-where">Where</Label>
          <Input
            id="incident-where"
            value={values.location}
            onChange={(event) =>
              setValues((current) => ({ ...current, location: event.target.value }))
            }
            placeholder="Combined Science laboratory 2"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="incident-period">Period</Label>
          <Input
            id="incident-period"
            type="number"
            min={1}
            max={20}
            value={values.period}
            onChange={(event) =>
              setValues((current) => ({ ...current, period: event.target.value }))
            }
            placeholder="4"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="incident-sanction">Sanction</Label>
          <Input
            id="incident-sanction"
            value={values.sanction}
            onChange={(event) =>
              setValues((current) => ({ ...current, sanction: event.target.value }))
            }
            placeholder="Friday detention ×2"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            Leave it empty if it has not been decided. It shows as Not decided until it is.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="incident-tone">How it reads</Label>
          <Select
            value={values.sanctionTone}
            onValueChange={(next) =>
              setValues((current) => ({
                ...current,
                sanctionTone: next as Values["sanctionTone"],
              }))
            }
          >
            <SelectTrigger id="incident-tone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PLAIN">Ordinary</SelectItem>
              <SelectItem value="WARN">Worth a second look</SelectItem>
              <SelectItem value="BAD">Serious</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={!values.homeToldNeeded}
            onChange={(event) =>
              setValues((current) => ({ ...current, homeToldNeeded: !event.target.checked }))
            }
          />
          <span className="text-sm">
            Home does not need telling
            <span className="block text-xs text-[color:var(--text-muted)]">
              For the bus that was late and the thing that was nobody&rsquo;s fault. It stops
              counting towards Home not told.
            </span>
          </span>
        </label>
      </div>
    </RecordDialog>
  );
}
