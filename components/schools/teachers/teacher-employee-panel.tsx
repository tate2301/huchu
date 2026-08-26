"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SaveError } from "@/components/schools/common/states";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchEmployeeSuggestions,
  linkTeacherEmployee,
  unlinkTeacherEmployee,
} from "@/lib/schools/admin-v2";

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

  const suggestions = suggestionsQuery.data?.suggestions ?? [];

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

          <p className="text-sm text-[var(--text-muted)]">
            {employee
              ? `${teacherName} is joined to ${employee.name}${employee.jobTitle ? `, ${employee.jobTitle}` : ""}. Payroll, next of kin and national ID come from that record; their classes come from this one.`
              : `Nothing in payroll is joined to ${teacherName}. Their timetable works either way — what is missing is the other half of the person: salary, next of kin, national ID.`}
          </p>

          <RecordActions
            resource="schools.teachers"
            verbs={
              employee
                ? [
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
                  ]
                : [
                    {
                      label: "Find the employee",
                      action: "edit",
                      onSelect: () => setOpen(true),
                    },
                  ]
            }
          />
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
          <p className="text-sm text-[var(--text-muted)]">Looking for a match…</p>
        ) : suggestions.length === 0 ? (
          <Alert tone="info" title="No employee record matches">
            Nothing shares this teacher&rsquo;s login or their exact name. Near
            misses are deliberately not offered — a list of half-right names is
            how the wrong person gets linked. Add the employee under HR, or
            correct the spelling.
          </Alert>
        ) : (
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
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
        )}
      </RecordDialog>
    </>
  );
}
