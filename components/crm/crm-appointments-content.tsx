"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Badge, Button } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { fetchJson } from "@/lib/api-client";
import { CalendarCheck, MapPin } from "@/lib/icons";
import { useDebounced } from "@/hooks/use-debounced";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  GroupedRecordList,
  bucketByDueDate,
  type RecordListSection,
} from "@/components/records/record-list-groups";
import { GeotagNotice } from "@/components/crm/visits/geotag-notice";
import { VisitReportSheet } from "@/components/crm/visits/visit-report-sheet";
import { VisitScheduleSheet } from "@/components/crm/visits/visit-schedule-sheet";
import type { CrmLeadOwner } from "@/lib/crm/crm-v2";

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
  const [viewFilter, setViewFilter] = useState<"all" | "scheduled" | "unwritten" | "completed">("all");
  const debounced = useDebounced(search, 300);

  const appointmentsQuery = useQuery({
    queryKey: ["crm", "appointments"],
    queryFn: () => fetchJson<{ data: Appointment[] }>("/api/v2/crm/appointments"),
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: CrmLeadOwner[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });

  const visits = useMemo(() => appointmentsQuery.data?.data ?? [], [appointmentsQuery.data]);
  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);

  const [now] = useState(() => Date.now());

  const unwrittenCount = useMemo(
    () =>
      visits.filter(
        (v) =>
          (v.status === "SCHEDULED" && new Date(v.scheduledStart).getTime() < now) ||
          (v.status === "COMPLETED" && !v.reportCompletedAt),
      ).length,
    [now, visits],
  );

  const sections = useMemo<RecordListSection[]>(() => {
    const needle = debounced.trim().toLowerCase();
    const matching = visits
      .filter((visit) => {
        if (viewFilter === "scheduled") return visit.status === "SCHEDULED";
        if (viewFilter === "completed") return visit.status === "COMPLETED";
        if (viewFilter === "unwritten") {
          return (
            (visit.status === "SCHEDULED" && new Date(visit.scheduledStart).getTime() < now) ||
            (visit.status === "COMPLETED" && !visit.reportCompletedAt)
          );
        }
        return true;
      })
      .filter((visit) =>
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
        // The visit's own page: what was booked, and what came back.
        href: `/crm/appointments/${visit.id}`,
        leading: (
          <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] text-[var(--color-muted)]">
            <CalendarCheck className="size-4" />
          </span>
        ),
        title: visit.title,
        subtitle: (
          <>
            <span className="font-mono"><ClientDate value={visit.scheduledStart} /></span>
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
      alwaysShow: bucket.id === "today" && viewFilter !== "completed",
      emptyBody: "Nothing booked for today.",
      rows: bucket.items.map(toRow),
    }));

    return [
      ...buckets,
      ...(closed.length > 0 ? [{ id: "closed", label: "Done and cancelled", rows: closed.map(toRow) }] : []),
    ];
  }, [debounced, now, viewFilter, visits]);

  return (
    <RecordListShell
      title="Site visits"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search visits by title, reference, customer or place"
      createLabel="Schedule a visit"
      onCreate={() => setScheduling(true)}
      error={appointmentsQuery.error}
      finding={
        unwrittenCount > 0
          ? {
              fact: `${unwrittenCount} site visit${unwrittenCount === 1 ? "" : "s"} need writing up`,
              rest: "Capture measurements and geotagged site photos so quotations can be drafted accurately.",
              end:
                viewFilter !== "unwritten" ? (
                  <button
                    type="button"
                    className="fl-act"
                    onClick={() => setViewFilter("unwritten")}
                  >
                    Filter unwritten →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fl-act"
                    onClick={() => setViewFilter("all")}
                  >
                    Show all →
                  </button>
                ),
            }
          : undefined
      }
      tabs={[
        { value: "all", label: "All visits", count: visits.length },
        {
          value: "scheduled",
          label: "Scheduled",
          count: visits.filter((v) => v.status === "SCHEDULED").length,
        },
        {
          value: "unwritten",
          label: "Needs report",
          count: unwrittenCount,
        },
        {
          value: "completed",
          label: "Completed",
          count: visits.filter((v) => v.status === "COMPLETED").length,
        },
      ]}
      activeTab={viewFilter}
      onTabChange={(tab) => setViewFilter(tab as typeof viewFilter)}
      // Said before anybody leaves for site: by the time the report is open,
      // the photos were taken with whatever camera was to hand.
      notice={<GeotagNotice />}
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
