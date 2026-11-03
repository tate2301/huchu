"use client";

import Link from "next/link";

import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientDate } from "@/components/ui/client-date";
import { Plus, Share } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";

import type { LeadAppointment } from "./lead-types";

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
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={onSchedule}>
          <Plus className="h-3.5 w-3.5" />
          Schedule visit
        </Button>
      </div>

      <div className="bk-bleed">
        <table className="table" aria-label="Site visits">
          <thead>
            <tr>
              <th>Visit</th>
              <th>Scheduled</th>
              <th>Location</th>
              <th>State</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((visit) => {
              const status = VISIT_STATUS[visit.status];
              return (
                <tr key={visit.id}>
                  <td>
                    <Link
                      href={`/crm/appointments/${visit.id}`}
                      className="ref font-medium hover:underline"
                    >
                      {visit.appointmentNo}
                    </Link>{" "}
                    <span className="muted">{visit.title}</span>
                  </td>
                  <td className="muted font-mono">
                    <ClientDate value={visit.scheduledStart} />
                  </td>
                  <td className="muted">{visit.location ?? "—"}</td>
                  <td>
                    <div className="inline-flex items-center gap-2">
                      <StatusChip status={status.status} label={status.label} />
                      {visit.reportCompletedAt ? (
                        <span className="muted">Written up</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="num">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-sm"
                        disabled={share.isPending}
                        onClick={() => share.mutate(visit.id)}
                      >
                        <Share className="h-3.5 w-3.5 mr-1" />
                        Share
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-sm"
                        onClick={() => onOpenReport(visit)}
                      >
                        {visit.reportCompletedAt ? "View report" : "Write up"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted py-4 text-center">
                  No site visits yet. The visit is where the job gets specified — book one before quoting anything substantial.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
