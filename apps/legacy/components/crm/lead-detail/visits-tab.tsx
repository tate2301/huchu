"use client";

import { useMutation } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Plus, Share } from "@corelithzw/ui/lib/icons";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";

import type { LeadAppointment } from "./lead-types";

import { Stack } from "@corelithzw/react";

const VISIT_STATUS: Record<LeadAppointment["status"], { label: string; status: CanonicalUiStatus }> =
  {
    SCHEDULED: { label: "Scheduled", status: "pending" },
    COMPLETED: { label: "Completed", status: "passing" },
    CANCELLED: { label: "Cancelled", status: "inactive" },
    NO_SHOW: { label: "No show", status: "failing" },
  };

export function VisitsTab({
  appointments,
  onSchedule,
  onOpenReport,
}: {
  appointments: LeadAppointment[];
  onSchedule: () => void;
  onOpenReport: (appointment: LeadAppointment) => void;
}) {
  const { toast } = useToast();

  // Sharing mints a fresh token every time, which is also how somebody takes
  // back a link they sent to the wrong number.
  const share = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ path: string }>(`/api/v2/crm/appointments/${id}/brief`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async (result) => {
      const url = `${window.location.origin}${result.path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Send it to whoever is going." });
      } catch {
        // Clipboard is denied often enough on mobile that failing silently
        // would look like the button did nothing.
        toast({ title: "Link ready", description: url });
      }
    },
    onError: (error) =>
      toast({
        title: "Could not share the visit",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-3">
      <Button size="sm" className="gap-1.5" onClick={onSchedule}>
        <Plus className="h-3.5 w-3.5" />
        Schedule visit
      </Button>

      {appointments.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          No site visits yet. The visit is where the job gets specified — book one before quoting
          anything substantial.
        </p>
      ) : (
        <Stack as="ul" gap="xs">
          {appointments.map((visit) => {
            const status = VISIT_STATUS[visit.status];
            return (
              <li key={visit.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{visit.appointmentNo}</span>
                    <StatusChip status={status.status} label={status.label} />
                    {visit.reportCompletedAt ? (
                      <span className="text-sm text-[var(--text-muted)]">Written up</span>
                    ) : null}
                  </div>
                  <p className="text-sm">{visit.title}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    <ClientDate value={visit.scheduledStart} />
                    {visit.location ? ` · ${visit.location}` : ""}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={share.isPending}
                  onClick={() => share.mutate(visit.id)}
                >
                  <Share className="h-3.5 w-3.5" />
                  Share
                </Button>

                <Button size="sm" variant="outline" onClick={() => onOpenReport(visit)}>
                  {visit.reportCompletedAt ? "View report" : "Write up"}
                </Button>
              </li>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
