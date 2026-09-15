"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import {
  ClassFilter,
  ALL_CLASSES,
  classFilterParams,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingLeftToDo,
  NothingYet,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { RecordCell } from "@/components/records/record-table";
import { DataTable } from "@/components/ui/data-table";
import { fetchJson } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * Who has been away, and who has not been rung about it.
 *
 * The register board answers which classes have not sent a register in. This is
 * the question that comes after — the registers are in, so who keeps not being
 * in them. Those are different jobs done by different people at different times
 * of day, which is why they are two screens and not two tabs.
 *
 * Absence is counted over a window rather than listed per day, because one
 * missed morning is a cold and six in a fortnight is a safeguarding matter, and
 * a list of every absence separately buries the second inside the first.
 *
 * The row's verb is the point. Before this a school could see a child had
 * missed nine mornings and then had to go and find the mother's number itself;
 * the row carries the primary guardian and rings them, as a notice on the
 * child's record.
 */

type FollowUpRow = {
  studentId: string;
  name: string;
  admissionNo: string | null;
  isBoarding: boolean;
  className: string | null;
  streamName: string | null;
  unexplained: number;
  excused: number;
  lastAbsent: string | null;
  /** When the office last wrote home about this child, in this same window. */
  lastContactedAt: string | null;
  remarks: string[];
  guardian: {
    id: string;
    name: string;
    phone: string | null;
    relationship: string;
  } | null;
};

type FollowUpResponse = {
  rows: FollowUpRow[];
  summary: {
    pupils: number;
    absences: number;
    unexplained: number;
    sessions: number;
    toContact: number;
  };
  window: { days: number; since: string };
};

const WINDOWS = [
  { value: "14", label: "The last fortnight" },
  { value: "28", label: "The last four weeks" },
  { value: "90", label: "This term so far" },
];

const THRESHOLDS = [
  { value: "2", label: "Two or more" },
  { value: "4", label: "Four or more" },
  { value: "6", label: "Six or more" },
];

export function AbsenceFollowUpContent() {
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [days, setDays] = useState("28");
  const [threshold, setThreshold] = useState("2");
  const [search, setSearch] = useState("");
  const [ringing, setRinging] = useState<FollowUpRow | null>(null);

  const followUpQuery = useQuery({
    queryKey: ["schools", "attendance", "follow-up", { classValue, days, threshold, search }],
    queryFn: () => {
      const params = new URLSearchParams({ days, threshold });
      const scoped = classFilterParams(classValue);
      if (scoped.classId) params.set("classId", scoped.classId);
      if (scoped.streamId) params.set("streamId", scoped.streamId);
      if (search) params.set("search", search);
      return fetchJson<FollowUpResponse>(
        `/api/v2/schools/attendance/follow-up?${params.toString()}`,
      );
    },
  });

  const rows = useMemo(() => followUpQuery.data?.rows ?? [], [followUpQuery.data]);
  const summary = followUpQuery.data?.summary;

  /**
   * The children nobody has been able to reach.
   *
   * A repeat absence with no guardian on file is the worst row on the screen
   * and the easiest to scroll past, because it looks like every other row with
   * one column blank. Named at the top instead.
   */
  const unreachable = useMemo(
    () => rows.filter((row) => !row.guardian?.phone),
    [rows],
  );

  const contactedCount = useMemo(
    () => rows.filter((row) => row.lastContactedAt).length,
    [rows],
  );

  const columns = useMemo<ColumnDef<FollowUpRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <PersonCell
            name={row.original.name}
            href={recordType("STUDENT").href(row.original.studentId)}
            reference={row.original.admissionNo}
            context={[
              [row.original.className, row.original.streamName].filter(Boolean).join(" "),
              row.original.isBoarding ? "boarder" : "day",
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ),
      },
      {
        id: "unexplained",
        header: "Away, unexplained",
        cell: ({ row }) => (
          <Badge tone={row.original.unexplained >= 6 ? "danger" : "warn"}>
            {row.original.unexplained}
          </Badge>
        ),
      },
      {
        id: "excused",
        header: "With permission",
        cell: ({ row }) => (
          <span className="font-[family-name:var(--font-mono)] text-sm tabular-nums text-muted-foreground">
            {row.original.excused}
          </span>
        ),
      },
      {
        id: "lastAbsent",
        header: "Last away",
        // The school's date, not the browser's. `toLocaleDateString` here was
        // read out of whatever locale the reader's machine happens to carry —
        // so the same register said "3 Jun" in the office and "Jun 3" on the
        // laptop beside it, and the two renders disagreed across hydration.
        cell: ({ row }) => (
          <RecordCell
            kind="date"
            value={row.original.lastAbsent ? formatSchoolDate(row.original.lastAbsent) : null}
          />
        ),
      },
      {
        id: "contacted",
        header: "Rung home",
        cell: ({ row }) =>
          row.original.lastContactedAt ? (
            <Badge tone="success">{formatSchoolDate(row.original.lastContactedAt)}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Not yet</span>
          ),
      },
      {
        id: "guardian",
        header: "Who to ring",
        cell: ({ row }) => {
          const guardian = row.original.guardian;
          // A state, not a category: a repeat absence the school cannot ring
          // about is the row on this screen to fix first.
          if (!guardian) return <Badge tone="danger">Nobody on file</Badge>;
          return (
            <PersonCell
              kind="guardian"
              name={guardian.name}
              href={recordType("GUARDIAN").href(guardian.id)}
              reference={guardian.phone ?? "No number"}
              context={guardian.relationship}
            />
          );
        },
      },
      {
        id: "actions",
        // An affordance, not a field — but the head still needs the cell.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            label={`Row actions for ${row.original.name}`}
            resource="schools.attendance"
            verbs={[
              {
                // Named for what it is the second time round. Ringing twice is
                // sometimes right — the point is that the office can see it is
                // the second call, not be told nothing has happened.
                label: row.original.lastContactedAt ? "Ring again" : "Ring home",
                action: "edit",
                onSelect: () => setRinging(row.original),
                unavailable: row.original.guardian
                  ? undefined
                  : "Nobody is on file for this child.",
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const filtered = Boolean(classValue.classId || search || days !== "28" || threshold !== "2");

  /**
   * The notice send lives inside `SendNoticeDialog`, which owns its own error
   * banner but not the table underneath it. While a send is in flight the list
   * is dimmed and stops taking taps: the row verbs open the same dialog, and a
   * second "Ring home" pressed mid-send is a second letter to the same family.
   */
  const sending = useIsMutating() > 0 && ringing !== null;

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            // The number still to do, not the number on the list. Once the
            // office has rung home the child stays visible — the absences are
            // still a fact — but they are no longer work outstanding.
            { label: "To follow up", value: summary?.toContact ?? 0, tone: "warn" },
            { label: "Already rung", value: contactedCount, tone: "success" },
            { label: "Unexplained", value: summary?.unexplained ?? 0 },
            {
              label: "Nobody to ring",
              value: unreachable.length,
              tone: unreachable.length > 0 ? "danger" : "neutral",
            },
          ]}
        />
      }
    >
      <PageChrome title="Absence follow-up" />

      {unreachable.length > 0 ? (
        <Alert
          tone="danger"
          title={`${unreachable.length} ${
            unreachable.length === 1 ? "child has" : "children have"
          } been away with nobody to ring`}
        >
          {unreachable
            .slice(0, 6)
            .map((row) => row.name)
            .join(" · ")}
          {unreachable.length > 6 ? ` and ${unreachable.length - 6} more` : ""}. A repeat
          absence the school cannot phone about is the one to fix first — add a guardian to
          the child’s record.
        </Alert>
      ) : null}

      <TableControls
        sticky
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or admission number"
          />
        }
        filterCount={activeFilterCount(
          classValue.classId,
          days === "28" ? "" : days,
          threshold === "2" ? "" : threshold,
        )}
        count={followUpQuery.isPending ? null : `${rows.length} to chase`}
        filters={
          <>
            <ClassFilter value={classValue} onChange={setClassValue} />
            <FilterSelect
              label="Over"
              value={days}
              onChange={(next) => setDays(next || "28")}
              allLabel="The last four weeks"
              options={WINDOWS}
            />
            <FilterSelect
              label="Days away"
              value={threshold}
              onChange={(next) => setThreshold(next || "2")}
              allLabel="Two or more"
              options={THRESHOLDS}
            />
          </>
        }
      />

      {followUpQuery.isPending ? (
        <TableRowsSkeleton
          headers={[
            "Student",
            "Away, unexplained",
            "With permission",
            "Last away",
            "Rung home",
            "Who to ring",
            "",
          ]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 130, badge: true },
            { width: 120, align: "right" },
            { width: 100, align: "right" },
            { width: 110, badge: true },
            { avatar: true, twoLine: true },
            { width: 44 },
          ]}
        />
      ) : followUpQuery.isError ? (
        <LoadError
          what="the follow-up list"
          error={followUpQuery.error}
          onRetry={() => void followUpQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        filtered ? (
          <NothingMatched
            what="children"
            filters={[
              classValue.classId ? "the chosen year group" : "",
              WINDOWS.find((option) => option.value === days)?.label ?? "",
              THRESHOLDS.find((option) => option.value === threshold)?.label ?? "",
              search.trim(),
            ].filter(Boolean)}
            onClear={() => {
              setClassValue(ALL_CLASSES);
              setDays("28");
              setThreshold("2");
              setSearch("");
            }}
          />
        ) : summary && summary.sessions === 0 ? (
          // No register has been taken in the window at all. That is not "the
          // chasing is done" — it is a school that has not started marking
          // attendance, and the two read identically if both say "nobody to
          // chase". The verb that fills this screen is taking a register.
          <NothingYet
            title="No register has been taken yet"
            body="This list is built from marked registers. Take one and anybody who keeps missing appears here."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/attendance">Go to the register board</Link>
              </Button>
            }
          />
        ) : (
          <NothingLeftToDo
            title="Nobody to chase"
            body="No child has been away unexplained more than once in the last four weeks."
          />
        )
      ) : (
        <SavingOverlay saving={sending} label="Sending it home…">
          <DataTable
            columns={columns}
            data={rows}
            // The search box is in the row above, where it sits on every other
            // campus list. Left on, `DataTable` draws a second one inside its
            // own toolbar — two boxes on one screen searching the same rows by
            // different rules.
            features={{ globalFilter: false }}
            mobileCardRenderer={({ row }) => (
              // Seven columns at 390px is a sideways scroll showing one and a
              // half of them. The child, what they have missed, and who to ring
              // about it — which is the whole of the row.
              <div className="space-y-2">
                <PersonCell
                  name={row.name}
                  href={recordType("STUDENT").href(row.studentId)}
                  reference={row.admissionNo}
                  context={[row.className, row.streamName].filter(Boolean).join(" ")}
                />
                <div className="flex flex-wrap items-center gap-2 pl-[2.125rem]">
                  <Badge tone={row.unexplained >= 6 ? "danger" : "warn"}>
                    {row.unexplained} unexplained
                  </Badge>
                  {row.lastContactedAt ? (
                    <Badge tone="success">
                      Rung {formatSchoolDate(row.lastContactedAt)}
                    </Badge>
                  ) : null}
                  {row.guardian ? (
                    <span className="font-mono text-sm tabular-nums text-[color:var(--text-muted)]">
                      {row.guardian.phone ?? "No number"}
                    </span>
                  ) : (
                    <Badge tone="danger">Nobody on file</Badge>
                  )}
                </div>
              </div>
            )}
          />
        </SavingOverlay>
      )}

      {ringing ? (
        <SendNoticeDialog
          open
          onOpenChange={(next) => {
            if (!next) setRinging(null);
          }}
          title={`Ring home about ${ringing.name}`}
          severity="WARNING"
          sendLabel="Send it home"
          // Addressed by pupil rather than by guardian: the notice goes to
          // whoever is on that child's record, which is the same rule the rest
          // of the school follows and survives a guardian being changed.
          audience={{
            studentIds: [ringing.studentId],
            describe: ringing.guardian
              ? `${ringing.guardian.name}, ${ringing.name}’s ${ringing.guardian.relationship.toLowerCase()}`
              : `the family of ${ringing.name}`,
          }}
          defaultSubject={`${ringing.name} — attendance`}
          defaultBody={`${ringing.name} has been away ${ringing.unexplained} ${
            ringing.unexplained === 1 ? "morning" : "mornings"
          } in the last ${days} days with no explanation on file. Please contact the school office.`}
          onSent={() => {
            setRinging(null);
            // Re-read so the row shows it has been rung. Without this the
            // office sends a warning and the list looks exactly as it did a
            // moment before, which is how a child gets rung about twice.
            void followUpQuery.refetch();
          }}
        />
      ) : null}
    </SchoolsPage>
  );
}
