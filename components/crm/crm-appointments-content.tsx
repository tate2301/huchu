"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { CrmFinding } from "@/components/crm/crm-finding";
import { StatusDot } from "@/components/management/ui";
import {
  RecordTable,
  type RecordTableColumn,
  RecordTableName,
  RecordCell,
} from "@/components/records/record-table";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatDate } from "@/components/crm/money/money";
import { useDebounced } from "@/hooks/use-debounced";
import { GeotagNotice } from "@/components/crm/visits/geotag-notice";
import { VisitReportSheet } from "@/components/crm/visits/visit-report-sheet";
import { VisitScheduleSheet } from "@/components/crm/visits/visit-schedule-sheet";
import { VISIT_STATUS_LABELS, VISIT_TONE } from "@/lib/crm/tones";
import type { CrmLeadOwner } from "@/lib/crm/crm-v2";
import {
  ci_site_visit,
  ci_calendar_clock,
  ci_alert_circle,
  ci_check_circle,
  ci_download,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import { downloadCsv } from "@/components/books/bk-list";

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

function formatVisitTime(value: string): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(value)}, ${time}`;
}

export function CrmAppointmentsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [reportFor, setReportFor] = useState<Appointment | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState("");
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

  const scheduledCount = useMemo(
    () => visits.filter((v) => v.status === "SCHEDULED").length,
    [visits],
  );

  const completedCount = useMemo(
    () => visits.filter((v) => v.status === "COMPLETED").length,
    [visits],
  );

  const matchingVisits = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return visits
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
      .filter((visit) => {
        if (!repFilter) return true;
        return visit.assignedTo?.id === repFilter;
      })
      .filter((visit) =>
        needle
          ? `${visit.title} ${visit.appointmentNo} ${visit.client?.name ?? ""} ${visit.location ?? ""}`
              .toLowerCase()
              .includes(needle)
          : true,
      );
  }, [debounced, now, repFilter, viewFilter, visits]);

  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "scheduled",
    dir: "asc",
  });

  const sortedVisits = useMemo(() => {
    const list = [...matchingVisits];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "visit") {
        cmp = a.title.localeCompare(b.title);
      } else if (sort.key === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sort.key === "customer") {
        const aSub = visitSubject(a)?.label ?? "";
        const bSub = visitSubject(b)?.label ?? "";
        cmp = aSub.localeCompare(bSub);
      } else if (sort.key === "scheduled") {
        cmp = new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
      } else if (sort.key === "rep") {
        const aRep = a.assignedTo?.name ?? "";
        const bRep = b.assignedTo?.name ?? "";
        cmp = aRep.localeCompare(bRep);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [matchingVisits, sort]);

  const handleExportCsv = () => {
    const head = [
      "Appointment No",
      "Title",
      "Status",
      "Customer / Subject",
      "Scheduled Date",
      "Assigned Rep",
      "Location",
      "Report Written",
    ];
    const data = sortedVisits.map((v) => {
      const subj = visitSubject(v);
      return [
        v.appointmentNo,
        v.title,
        VISIT_STATUS_LABELS[v.status] ?? v.status,
        subj?.label ?? "Unattached",
        v.scheduledStart ? new Date(v.scheduledStart).toISOString() : "",
        v.assignedTo?.name ?? "Unassigned",
        v.location ?? "",
        v.reportCompletedAt ? "Yes" : "No",
      ];
    });
    downloadCsv("site-visits.csv", head, data);
  };

  const columns = useMemo<RecordTableColumn<Appointment>[]>(
    () => [
      {
        id: "visit",
        label: "Visit",
        sortKey: "visit",
        cell: (v) => (
          <RecordTableName
            title={v.title}
            subtitle={`${v.appointmentNo}${v.location ? ` · ${v.location}` : ""}`}
          />
        ),
      },
      {
        id: "status",
        label: "Status",
        width: "11rem",
        sortKey: "status",
        cell: (v) => (
          <div className="flex items-center gap-2">
            <StatusDot
              tone={VISIT_TONE[v.status] ?? "neutral"}
              label={VISIT_STATUS_LABELS[v.status] ?? v.status}
            />
            {v.reportCompletedAt ? (
              <span className="rounded bg-[var(--badge-ok-bg)] px-1.5 py-0.5 text-sm font-medium text-[var(--badge-ok-fg)]">
                Report in
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "subject",
        label: "Customer / Subject",
        width: "14rem",
        sortKey: "customer",
        cell: (v) => {
          const subj = visitSubject(v);
          return (
            <RecordCell
              kind="relation"
              value={subj?.label ?? "Unattached"}
              href={subj?.href ?? null}
            />
          );
        },
      },
      {
        id: "scheduled",
        label: "Scheduled",
        width: "13rem",
        sortKey: "scheduled",
        cell: (v) => <RecordCell kind="date" value={formatVisitTime(v.scheduledStart)} />,
      },
      {
        id: "rep",
        label: "Rep",
        width: "10rem",
        sortKey: "rep",
        cell: (v) => (
          <RecordCell
            kind="text"
            value={v.assignedTo?.name ?? "Unassigned"}
            className={!v.assignedTo ? "font-medium text-[var(--color-warn)]" : undefined}
          />
        ),
      },
      {
        id: "action",
        label: "",
        width: "6.5rem",
        align: "end",
        cell: (v) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setReportFor(v);
            }}
          >
            {v.reportCompletedAt ? "Report" : "Capture"}
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="crm-bk-worksheet">
      <PageChrome
        title="Site visits"
        primary={{
          label: "Schedule visit",
          icon: "plus",
          shortcut: "N",
          onClick: () => setScheduling(true),
        }}
      />

      {unwrittenCount > 0 ? (
        <CrmFinding
          label="Needs report"
          tone="danger"
          fact={`${unwrittenCount} site visit${unwrittenCount === 1 ? "" : "s"} need writing up`}
          rest="— capture measurements and geotagged site photos so quotations can be drafted accurately."
          action={{
            label: viewFilter !== "unwritten" ? "Filter unwritten →" : "Show all →",
            onClick: () => setViewFilter(viewFilter !== "unwritten" ? "unwritten" : "all"),
          }}
        />
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Visit status views">
        <div className="crm-bk-tabs">
          {[
            { value: "all", label: "All visits", count: visits.length, glyph: ci_site_visit },
            { value: "scheduled", label: "Scheduled", count: scheduledCount, glyph: ci_calendar_clock },
            { value: "unwritten", label: "Needs report", count: unwrittenCount, glyph: ci_alert_circle },
            { value: "completed", label: "Completed", count: completedCount, glyph: ci_check_circle },
          ].map((tab) => {
            const isCurrent = viewFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                data-active={isCurrent || undefined}
                onClick={() => setViewFilter(tab.value as typeof viewFilter)}
                className="crm-bk-tab"
              >
                <CiGlyphIcon glyph={tab.glyph} size={16} className="shrink-0" />
                <span>{tab.label}</span>
                <span className="n">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search visits by title, reference, customer or place"
          narrow
        />

        <select
          value={repFilter}
          onChange={(event) => setRepFilter(event.target.value)}
          aria-label="Filter by rep"
          className="h-7 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
        >
          <option value="">Any rep</option>
          {owners.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name ?? "Unnamed"}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
            {sortedVisits.length} {sortedVisits.length === 1 ? "visit" : "visits"}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="h-7 text-sm font-medium"
          >
            <CiGlyphIcon glyph={ci_download} size={14} className="mr-1.5 shrink-0" />
            Export
          </Button>
        </div>
      </div>

      {appointmentsQuery.error ? (
        <div className="px-5 py-3">
          <Alert tone="danger" title="Unable to load site visits">
            {getApiErrorMessage(appointmentsQuery.error)}
          </Alert>
        </div>
      ) : null}

      <GeotagNotice />

      <RecordTable
        columns={columns}
        rows={sortedVisits}
        sort={{
          key: sort.key,
          dir: sort.dir,
          onSort: (key) =>
            setSort((prev) => ({
              key,
              dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
            })),
        }}
        rowHref={(v) => `/crm/appointments/${v.id}`}
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
              <CiGlyphIcon glyph={ci_site_visit} size={16} className="mr-1.5 shrink-0" />
              Schedule the first visit
            </Button>
          )
        }
      />

      <VisitScheduleSheet
        open={scheduling}
        onOpenChange={setScheduling}
        subject={{}}
        owners={owners}
        currentUserId={session?.user?.id}
        onScheduled={() => queryClient.invalidateQueries({ queryKey: ["crm", "appointments"] })}
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
    </div>
  );
}
