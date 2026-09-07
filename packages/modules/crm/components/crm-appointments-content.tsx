"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Badge, Button } from "@corelithzw/react";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { fetchJson } from "@corelithzw/platform/api-client";
import { CalendarCheck, MapPin } from "@corelithzw/ui/lib/icons";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";

import { RecordListShell } from "./records/record-list-shell";
import {
  GroupedRecordList,
  bucketByDueDate,
  type RecordListSection,
} from "@corelithzw/module-records/components/record-list-groups";
import { VisitReportSheet } from "./visits/visit-report-sheet";
import { VisitScheduleSheet } from "./visits/visit-schedule-sheet";
import type { LeadFilterOwner } from "./leads/leads-filters";

type Appointment = {
  id: string;
  appointmentNo: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reportCompletedAt: string | null;
  lead: { id: string; leadNo: string; title: string | null } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  client: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
};

/**
 * Where the visit's row points, and what it says it is for.
 *
 * A site visit is always for something — a deal being specified, a lead being
 * qualified, a site being surveyed. The list used to link every row back to
 * itself unless a lead happened to be attached, which meant a coordinator
 * looking at tomorrow's visits could not tell what any of them were about.
 */
function visitSubject(visit: Appointment): { href: string; label: string } | null {
  if (visit.deal) {
    return { href: `/crm/deals/${visit.deal.id}`, label: visit.deal.title || visit.deal.dealNo };
  }
  if (visit.lead) {
    return { href: `/crm/leads/${visit.lead.id}`, label: visit.lead.title || visit.lead.leadNo };
  }
  if (visit.site) {
    return { href: `/crm/sites/${visit.site.id}`, label: visit.site.name };
  }
  if (visit.client) {
    return { href: `/crm/companies/${visit.client.id}`, label: visit.client.name };
  }
  return null;
}

const VISIT_STATUS: Record<
  Appointment["status"],
  { label: string; tone: "info" | "success" | "neutral" | "danger" }
> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "danger" },
};

/**
 * Site visits.
 *
 * You could book one from inside a lead or a deal and nowhere else, so the
 * page that lists them had no way to add one — which is what "site visits
 * weren't creating" meant from here. It has a schedule action now, and the
 * visits are grouped by when they are due rather than laid out as a table:
 * a visit is somewhere you have to be, so the useful sort is by time and the
 * useful grouping is overdue / today / tomorrow.
 */
export function CrmAppointmentsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [reportFor, setReportFor] = useState<Appointment | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const appointmentsQuery = useQuery({
    queryKey: ["crm", "appointments"],
    queryFn: () => fetchJson<{ data: Appointment[] }>("/api/v2/crm/appointments"),
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });

  const visits = useMemo(() => appointmentsQuery.data?.data ?? [], [appointmentsQuery.data]);
  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);

  const sections = useMemo<RecordListSection[]>(() => {
    const needle = debounced.trim().toLowerCase();
    const matching = visits.filter((visit) =>
      needle
        ? `${visit.title} ${visit.appointmentNo} ${visit.client?.name ?? ""} ${visit.location ?? ""}`
            .toLowerCase()
            .includes(needle)
        : true,
    );

    // Done visits have no due date left to be late for, so they sit at the
    // bottom in one band rather than being bucketed as "overdue".
    const open = matching.filter((visit) => visit.status === "SCHEDULED");
    const closed = matching.filter((visit) => visit.status !== "SCHEDULED");

    const toRow = (visit: Appointment) => {
      const status = VISIT_STATUS[visit.status];
      return {
        id: visit.id,
        href: visitSubject(visit)?.href ?? "/crm/appointments",
        leading: (
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <CalendarCheck className="size-4" />
          </span>
        ),
        title: visit.title,
        subtitle: (
          <>
            <ClientDate value={visit.scheduledStart} />
            {visitSubject(visit) ? ` · ${visitSubject(visit)!.label}` : " · Unattached"}
            {visit.location ? ` · ${visit.location}` : ""}
          </>
        ),
        status: (
          <>
            <Badge tone={status.tone} size="sm">
              {status.label}
            </Badge>
            {visit.reportCompletedAt ? (
              <Badge tone="success" size="sm">
                Report in
              </Badge>
            ) : null}
          </>
        ),
        facts: [
          { label: "Ref", value: visit.appointmentNo, mono: true },
          { label: "Going", value: visit.assignedTo?.name ?? "Unassigned" },
        ],
        actions: (
          <Button size="sm" variant="secondary" onClick={() => setReportFor(visit)}>
            {visit.reportCompletedAt ? "Report" : "Capture"}
          </Button>
        ),
      };
    };

    const buckets = bucketByDueDate(open, (visit) => visit.scheduledStart).map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      alwaysShow: bucket.id === "today",
      emptyBody: "Nothing booked for today.",
      rows: bucket.items.map(toRow),
    }));

    return [
      ...buckets,
      { id: "closed", label: "Done and cancelled", rows: closed.map(toRow) },
    ];
  }, [debounced, visits]);

  return (
    <RecordListShell
      width="narrow"
      title="Site visits"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search visits by title, reference, customer or place"
      createLabel="Schedule a visit"
      onCreate={() => setScheduling(true)}
      error={appointmentsQuery.error}
    >
      <GroupedRecordList
        sections={sections}
        isLoading={appointmentsQuery.isLoading}
        emptyTitle={debounced ? "No visits match that search" : "No site visits yet"}
        emptyBody={
          debounced
            ? undefined
            : "Book one and whoever is going gets the address, the access notes and a checklist of what to bring back."
        }
        emptyAction={
          debounced ? undefined : (
            <Button variant="primary" size="sm" onClick={() => setScheduling(true)}>
              <MapPin className="mr-1.5 size-4" />
              Schedule the first visit
            </Button>
          )
        }
      />

      <VisitScheduleSheet
        open={scheduling}
        onOpenChange={setScheduling}
        // Booked from the list rather than from a record, so the sheet asks
        // what the visit is for rather than leaving it unattached.
        subject={{}}
        owners={owners}
        currentUserId={session?.user?.id}
        onScheduled={() =>
          queryClient.invalidateQueries({ queryKey: ["crm", "appointments"] })
        }
      />

      {reportFor ? (
        <VisitReportSheet
          open
          onOpenChange={(next) => {
            if (!next) setReportFor(null);
          }}
          appointmentId={reportFor.id}
          appointmentNo={reportFor.appointmentNo}
        />
      ) : null}
    </RecordListShell>
  );
}
