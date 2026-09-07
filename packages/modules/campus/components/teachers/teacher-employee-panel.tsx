"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@corelithzw/react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { FilterSelect } from "../common/filter-select";
import { RecordActions } from "../common/record-actions";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
} from "../common/states";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchEmployeeSuggestions,
  linkTeacherEmployee,
  unlinkTeacherEmployee,
} from "../../admin-v2";

/**
 * Whether this teacher and an employee record are the same person.
 *
 * The list has answered this since S-1.7, because "which of my staff are not
 * joined up" is a question you ask of a whole staff at once. What the list
 * could not answer is the one that follows it — a reader who has opened
 * Priscilla Nyathi to check her department had no way to join her up from
 * there, and went back to a table of forty-eight to find her again.
 *
 * The choosing happens in a dialog for the same reason it does in the cell:
 * the suggestions are variable width and a panel that grows by three rows when
 * you press a button is a panel that moves the thing you were reading.
 */

/**
 * How sure the match is, as a filter.
 *
 * Two members of staff with the same name is the exact case this dialog exists
 * for, and it is also the case where the dialog is hardest to read — three rows
 * that differ only in a staff number. Narrowing to the login match is how you
 * settle it without reading all three.
 */
const CONFIDENCE_OPTIONS = [
  { value: "certain", label: "Same login" },
  { value: "likely", label: "Same name" },
];

export function TeacherEmployeePanel({
  teacherProfileId,
  teacherName,
  employee,
}: {
  teacherProfileId: string;
  teacherName: string;
  employee: { id: string; employeeId: string; name: string; jobTitle: string | null } | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confidence, setConfidence] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "teacher", teacherProfileId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
  };

  const suggestionsQuery = useQuery({
    queryKey: ["schools", "teachers", "employee-suggestions", teacherProfileId],
    queryFn: () => fetchEmployeeSuggestions(teacherProfileId),
    // Only when the dialog is open: a record page should not fire a fuzzy
    // employee search nobody asked for.
    enabled: open,
  });

  const link = useMutation({
    mutationFn: (employeeId: string) => linkTeacherEmployee(teacherProfileId, employeeId),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  const unlink = useMutation({
    mutationFn: () => unlinkTeacherEmployee(teacherProfileId),
    onSuccess: invalidate,
  });

  const suggestions = useMemo(
    () => suggestionsQuery.data?.suggestions ?? [],
    [suggestionsQuery.data],
  );

  const visible = confidence
    ? suggestions.filter((suggestion) => suggestion.confidence === confidence)
    : suggestions;

  return (
    <>
      <Card
        title="HR record"
        actions={
          employee ? (
            <Badge tone="success">{employee.employeeId}</Badge>
          ) : (
            <Badge tone="warn">No HR record</Badge>
          )
        }
      >
        <div className="space-y-3">
          {unlink.isError ? <SaveError what="The unlink" error={unlink.error} /> : null}
          {/* The dialog closes on a successful link, so a link that failed has
              no dialog left to report it in. */}
          {link.isError ? <SaveError what="The link" error={link.error} /> : null}

          {employee ? (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                {`${teacherName} is joined to ${employee.name}${employee.jobTitle ? `, ${employee.jobTitle}` : ""}. Payroll, next of kin and national ID come from that record; their classes come from this one.`}
              </p>

              <RecordActions
                resource="schools.teachers"
                verbs={[
                  {
                    label: "Unlink",
                    action: "edit",
                    tone: "warning",
                    loading: unlink.isPending,
                    confirm: {
                      title: "Unlink the HR record?",
                      description:
                        "The two records go back to being separate people as far as the system is concerned. Neither is deleted.",
                      confirmLabel: "Unlink them",
                    },
                    onSelect: () => unlink.mutate(),
                  },
                ]}
              />
            </>
          ) : (
            // Half a person is missing, and the verb that supplies the other
            // half is the only thing worth offering — so this is an empty
            // state rather than a paragraph with a button under it.
            <NothingYet
              title={`Nothing in payroll is joined to ${teacherName}`}
              body="Their timetable works either way — what is missing is the other half of the person: salary, next of kin, national ID."
              action={
                <RecordActions
                  resource="schools.teachers"
                  verbs={[
                    {
                      label: "Find the employee",
                      action: "edit",
                      onSelect: () => {
                        setConfidence("");
                        link.reset();
                        setOpen(true);
                      },
                    },
                  ]}
                />
              }
            />
          )}
        </div>
      </Card>

      <RecordDialog
        open={open}
        onOpenChange={setOpen}
        title={`Who is ${teacherName}?`}
        description="Linking joins this teacher's classes to their HR record — payroll, next of kin, national ID."
        size="md"
        errors={link.error ? [getApiErrorMessage(link.error)] : undefined}
        footer={
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {suggestionsQuery.isPending ? (
          // The rows that are coming, not the sentence "Looking for a match…".
          // Each suggestion is a name, a staff number and a reason chip, which
          // is what this draws.
          <CardsSkeleton count={2} columns={1} lines={1} />
        ) : suggestionsQuery.error ? (
          <LoadError
            what="the staff list"
            error={suggestionsQuery.error}
            onRetry={() => void suggestionsQuery.refetch()}
          />
        ) : suggestions.length === 0 ? (
          // Not "nothing yet" — the school has staff on file. The matching rules
          // hid every one of them, and naming the rules is the whole answer.
          <NothingMatched
            what="employee records"
            filters={["the same login", "the same name, spelled exactly"]}
          />
        ) : visible.length === 0 ? (
          <NothingMatched
            what="employee records"
            filters={[
              CONFIDENCE_OPTIONS.find((option) => option.value === confidence)?.label ?? "",
            ].filter(Boolean)}
            onClear={() => setConfidence("")}
          />
        ) : (
          <div className="space-y-3">
            {/* Only worth a control when there is more than one row to tell
                apart; a filter over a single certain match is furniture. */}
            {suggestions.length > 1 ? (
              <FilterSelect
                label="How sure"
                allLabel="Every match"
                value={confidence}
                options={CONFIDENCE_OPTIONS}
                onChange={setConfidence}
              />
            ) : null}

            <div className="space-y-2">
              {visible.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{suggestion.name}</span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {suggestion.employeeId}
                      {suggestion.jobTitle ? ` · ${suggestion.jobTitle}` : ""} ·{" "}
                      {suggestion.phone}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={suggestion.confidence === "certain" ? "success" : "neutral"}>
                      {suggestion.reason}
                    </Badge>
                    <Button
                      size="sm"
                      variant={suggestion.confidence === "certain" ? "primary" : "secondary"}
                      loading={link.isPending}
                      onClick={() => link.mutate(suggestion.id)}
                    >
                      This is them
                    </Button>
                  </span>
                </div>
              ))}
            </div>

            <p className="text-sm text-[var(--text-muted)]">
              Near misses are deliberately not offered — a list of half-right names
              is how the wrong person gets linked. Add the employee under HR, or
              correct the spelling.
            </p>
          </div>
        )}
      </RecordDialog>
    </>
  );
}
