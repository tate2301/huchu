"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, StatCard } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * How often this child is actually here.
 *
 * `/schools/attendance` answers the office's question — which classes have not
 * sent a register in this morning — and nothing answered the one anybody asks
 * about a particular pupil. A record page could show their guardians, their
 * enrolments and their bills and not whether they had been in school, which is
 * the first thing raised in a conversation about a child who is struggling.
 *
 * The absence board next door can write to the families of everybody it lists,
 * and this tab could not write to the one family it is about — so somebody who
 * came here from a guardian's phone call had to go back out to a board of two
 * hundred to send the letter. The notice is the same one that board sends:
 * addressed to this pupil's guardians, landing in the parent portal.
 */

type EntryStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AttendanceResponse = {
  counts: Record<EntryStatus, number>;
  marked: number;
  rate: number | null;
  recent: Array<{
    id: string;
    status: EntryStatus;
    remarks: string | null;
    date: string;
    className: string | null;
    streamName: string | null;
  }>;
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

const STATUS_TONE: Record<EntryStatus, "success" | "danger" | "warn" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warn",
  EXCUSED: "neutral",
};

/**
 * The narrowing anybody actually applies. "Not here" groups absent, late and
 * excused together because that is the shape of the question — a guardian
 * meeting is about the mornings the child was not in the room, not about which
 * of three codes a teacher chose.
 */
const STATUS_OPTIONS = [
  { value: "NOT_PRESENT", label: "Not here" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
  { value: "PRESENT", label: "Present" },
];

const EXPLAINED_OPTIONS = [
  { value: "explained", label: "With a reason" },
  { value: "unexplained", label: "No reason given" },
];

export function StudentAttendanceTab({
  studentId,
  studentName,
}: {
  studentId: string;
  /** Named in the notice, so a parent reads about their child and not "a pupil". */
  studentName?: string;
}) {
  const [status, setStatus] = useState("");
  const [explained, setExplained] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "students", studentId, "attendance"],
    queryFn: () =>
      fetchJson<AttendanceResponse>(`/api/v2/schools/students/${studentId}/attendance`),
  });

  /**
   * A notice to this pupil's guardians. `studentIds` rather than a class or an
   * audience: the route resolves whoever is on the child's record, which is the
   * rule the rest of the school follows and survives a guardian being changed.
   */
  const tellTheFamily = useMutation({
    mutationFn: (message: { title: string; body: string }) =>
      fetchJson<{ recipients: number; withoutAccount: number }>(
        "/api/v2/schools/notices",
        {
          method: "POST",
          body: JSON.stringify({
            title: message.title,
            body: message.body,
            audience: "PARENTS",
            studentIds: [studentId],
            severity: "WARNING",
          }),
        },
      ),
    onSuccess: (result) => {
      setSent(
        result.recipients === 0
          ? "Nobody on this child's record has a portal account, so the notice reached no one. Invite a guardian from the Guardians section."
          : `Sent to ${result.recipients} ${result.recipients === 1 ? "guardian" : "guardians"}.`,
      );
    },
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <StatsSkeleton count={4} />
        <TableRowsSkeleton
          headers={["Date", "Mark", "Class", "Reason"]}
          columns={[{ width: 104 }, { width: 88, badge: true }, {}, { width: 160 }]}
          rows={6}
        />
      </div>
    );
  }

  if (query.error) {
    return (
      <LoadError
        what="this pupil's attendance"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data || data.marked === 0) {
    return (
      <NothingYet
        title="No register has counted this pupil yet"
        body="Figures appear once a class teacher submits a register they are on. A register still in draft is not counted, because a percentage that moves while somebody is marking is one nobody can quote to a parent."
      />
    );
  }

  const visible = data.recent.filter((entry) => {
    if (status === "NOT_PRESENT" && entry.status === "PRESENT") return false;
    if (status && status !== "NOT_PRESENT" && entry.status !== status) return false;
    if (explained === "explained" && !entry.remarks) return false;
    if (explained === "unexplained" && entry.remarks) return false;
    return true;
  });

  const filtersInForce = [
    status ? STATUS_OPTIONS.find((option) => option.value === status)?.label : null,
    explained ? EXPLAINED_OPTIONS.find((option) => option.value === explained)?.label : null,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setStatus("");
    setExplained("");
  };

  const child = studentName ?? "Your child";
  const unexplained = data.recent.filter(
    (entry) => entry.status === "ABSENT" && !entry.remarks,
  ).length;

  return (
    <div className="space-y-4">
      {/* The band's four numbers count every submitted register, and they do
          not move when the list underneath is narrowed — which is why the
          filters sit below them and not above. */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Attendance"
          value={<span className="tabular-nums">{data.rate}%</span>}
          tone={data.rate !== null && data.rate < 90 ? "warn" : "success"}
          footer={`of ${data.marked} registers taken`}
        />
        <StatCard
          label="Absent"
          value={<span className="tabular-nums">{data.counts.ABSENT}</span>}
          tone={data.counts.ABSENT > 0 ? "danger" : "neutral"}
          footer="Not accounted for"
        />
        <StatCard
          label="Late"
          value={<span className="tabular-nums">{data.counts.LATE}</span>}
          tone={data.counts.LATE > 0 ? "warn" : "neutral"}
          footer="Here, but after the bell"
        />
        <StatCard
          label="Excused"
          value={<span className="tabular-nums">{data.counts.EXCUSED}</span>}
          footer="Away with permission"
        />
      </div>

      {tellTheFamily.isError ? (
        <SaveError what="The notice to the family" error={tellTheFamily.error} />
      ) : null}
      {sent ? (
        <p className="campus-fade-in text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {sent}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar>
          <FilterSelect
            label="Mark"
            allLabel="Every morning"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
          <FilterSelect
            label="Explained"
            allLabel="With a reason or without"
            value={explained}
            options={EXPLAINED_OPTIONS}
            onChange={setExplained}
          />
        </FilterBar>

        <RecordActions
          resource="schools.attendance"
          verbs={[
            {
              label: "Tell the family",
              action: "create",
              loading: tellTheFamily.isPending,
              // A letter about attendance to a family whose child has not
              // missed a morning is a letter that damages the next one.
              unavailable:
                unexplained === 0
                  ? "Every absence on file has a reason against it, so there is nothing to raise."
                  : undefined,
              onSelect: () => {
                setSent(null);
                tellTheFamily.mutate({
                  title: `${child} — attendance`,
                  body: `${child} has been away ${unexplained} ${
                    unexplained === 1 ? "morning" : "mornings"
                  } with no explanation on file. Please contact the school office.`,
                });
              },
            },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <NothingMatched what="mornings" filters={filtersInForce} onClear={clearFilters} />
      ) : (
        // The list dims while the notice goes out. It is the same set of
        // mornings the letter is about, and a filter changed mid-send would
        // leave the reader looking at a different list from the one they sent.
        <SavingOverlay saving={tellTheFamily.isPending} label="Sending…">
          <ul className="flex flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)]">
            {visible.map((entry, index) => (
              <li
                key={entry.id}
                className="campus-row-in flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-2.5 last:border-b-0"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <span className="w-[6.5rem] shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                  {formatSchoolDate(entry.date)}
                </span>
                <Badge tone={STATUS_TONE[entry.status]} dot className="w-[5.5rem] shrink-0">
                  {STATUS_LABEL[entry.status]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                  {[entry.className, entry.streamName].filter(Boolean).join(" · ") ||
                    "No class recorded"}
                </span>
                {entry.remarks ? (
                  <span className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                    {entry.remarks}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </SavingOverlay>
      )}
    </div>
  );
}
