"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchEmployeeSuggestions,
  linkTeacherEmployee,
  unlinkTeacherEmployee,
  type TeacherProfileRecord,
} from "@/lib/schools/admin-v2";

/**
 * Whether this teacher and an employee record are the same person.
 *
 * Shown as a column rather than hidden on a detail page, because the useful
 * question is "which of my staff are not joined up" and that is only answerable
 * from the list. An unlinked teacher reads as a task, not as an absence.
 *
 * The cell itself is a badge and one button; the choosing happens in a dialog.
 * Expanding inline was tried and pushed the last column off the right edge of
 * the page — a table cell is not somewhere a variable-width control can grow.
 *
 * The suggestions are fetched only when the dialog opens. A list of fourteen
 * teachers should not fire fourteen searches on load.
 */
export function EmployeeLinkCell({ profile }: { profile: TeacherProfileRecord }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestionsQuery = useQuery({
    queryKey: ["schools", "teachers", "employee-suggestions", profile.id],
    queryFn: () => fetchEmployeeSuggestions(profile.id),
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: (employeeId: string) => linkTeacherEmployee(profile.id, employeeId),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkTeacherEmployee(profile.id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  if (profile.employee) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{profile.employee.employeeId}</Badge>
        <Button
          size="sm"
          variant="ghost"
          disabled={unlinkMutation.isPending}
          onClick={() => unlinkMutation.mutate()}
        >
          Unlink
        </Button>
      </span>
    );
  }

  const suggestions = suggestionsQuery.data?.suggestions ?? [];

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">No HR record</Badge>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Find the employee
      </Button>

      <RecordDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={`Who is ${profile.user.name}?`}
        description="Linking joins this teacher's classes to their HR record — payroll, next of kin, national ID."
        size="md"
        errors={error ? [error] : undefined}
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {suggestionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Looking for a match…</p>
        ) : suggestions.length === 0 ? (
          <Alert>
            <AlertTitle>No employee record matches</AlertTitle>
            <AlertDescription>
              Nothing shares this teacher&rsquo;s login or their exact name. Near
              misses are deliberately not offered — a list of half-right names is
              how the wrong person gets linked. Add the employee under HR, or
              correct the spelling.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--edge-subtle)] p-3"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{suggestion.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {suggestion.employeeId}
                    {suggestion.jobTitle ? ` · ${suggestion.jobTitle}` : ""} ·{" "}
                    {suggestion.phone}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      suggestion.confidence === "certain" ? "secondary" : "outline"
                    }
                  >
                    {suggestion.reason}
                  </Badge>
                  <Button
                    size="sm"
                    variant={
                      suggestion.confidence === "certain" ? "default" : "outline"
                    }
                    disabled={linkMutation.isPending}
                    onClick={() => linkMutation.mutate(suggestion.id)}
                  >
                    {linkMutation.isPending ? "Linking…" : "This is them"}
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </RecordDialog>
    </span>
  );
}
