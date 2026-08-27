"use client";

import { useMemo, useState } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { ClassFilter, ALL_CLASSES, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SavingOverlay,
  StatsSkeleton,
} from "@/components/schools/common/states";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";

import {
  LEAVE_STATUSES,
  fetchHostels,
  fetchLeaveRequests,
  leaveStatusLabel,
  type LeaveStatus,
} from "./boarding-data";
import { LeaveRequestDialog } from "./boarding-dialogs";
import { LeaveRequestsPanel } from "./leave-requests-panel";

/**
 * Leave and outings — who has asked to go out, and who is still not back.
 *
 * The canvas draws this inside the allocations board as a second card, and it
 * is right there: a warden reading the bed list is one question away from "and
 * who is out of the gate". But the card is a summary of a workflow with four
 * moves in it — asked, approved, signed out, signed back in — and a workflow
 * that can only be worked from inside somebody else's screen is a workflow with
 * no home. So it has both: the card there, the screen here, one table.
 *
 * The chips are the two numbers that matter at a gate. "Waiting on you" is work
 * that has not been done; "Out of the gate" is children who are not in the
 * building, and that one is checked at lights out whether or not anybody has
 * pressed anything today.
 *
 * The statuses read as the workflow's own words — APPROVED, CHECKED_IN,
 * REJECTED, CANCELED — because that is what the gate book says. A prettified
 * "Back" reads better in isolation and worse when somebody is holding this
 * screen next to the paper it replaced.
 */
export function BoardingLeaveContent() {
  const [hostelFilter, setHostelFilter] = useState("");
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [status, setStatus] = useState("");
  const [requestType, setRequestType] = useState("");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);

  const hostelsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels"],
    queryFn: fetchHostels,
  });

  // Unfiltered, so the chips and the stats count the whole school however the
  // table below is narrowed. A count that moves when you pick a house is a
  // count nobody can quote.
  const allQuery = useQuery({
    queryKey: ["schools", "boarding", "leave-requests", "", "", ""],
    queryFn: () => fetchLeaveRequests(),
  });

  const hostels = useMemo(() => hostelsQuery.data ?? [], [hostelsQuery.data]);
  const all = useMemo(() => allQuery.data ?? [], [allQuery.data]);

  /**
   * The same narrowing the panel applies, worked out here as well.
   *
   * Not duplication for its own sake: the panel below owns the table and its
   * row verbs, but it cannot tell "this school has never used the gate book"
   * from "the four filters above me left nothing" — it only ever sees the rows
   * its own query returned. This screen holds the unfiltered read, so it is the
   * only thing that can tell those two apart, and they are different sentences.
   */
  const inView = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((row) => {
      if (hostelFilter && row.allocation?.hostel.id !== hostelFilter) return false;
      if (status && row.status !== status) return false;
      if (requestType && row.requestType !== requestType) return false;
      if (classValue.classId && row.student.currentClass?.id !== classValue.classId) {
        return false;
      }
      if (!needle) return true;
      return `${row.student.lastName} ${row.student.firstName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [all, hostelFilter, status, requestType, classValue.classId, search]);

  const waiting = all.filter((row) => row.status === "SUBMITTED").length;
  const out = all.filter((row) => row.status === "CHECKED_OUT").length;
  const approved = all.filter((row) => row.status === "APPROVED").length;
  const back = all.filter((row) => row.status === "CHECKED_IN").length;

  const filterNames = [
    hostels.find((hostel) => hostel.id === hostelFilter)?.name,
    status ? leaveStatusLabel(status as LeaveStatus) : null,
    requestType === "LEAVE" ? "LEAVE" : requestType === "OUTING" ? "OUTING" : null,
    search.trim() || null,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setClassValue(ALL_CLASSES);
    setStatus("");
    setRequestType("");
    setSearch("");
  };

  /**
   * Any write in flight. Deliberately unkeyed: the four gate moves live in
   * `leave-requests-panel.tsx` and its mutation carries no key of its own, so
   * asking for a keyed subset here would match nothing and the interlock would
   * quietly never engage. On this screen the only writes are gate writes.
   */
  const working = useIsMutating() > 0;

  return (
    <>
      <PageChrome title="Leave and outings">
        <CreateButton
          resource="schools.boarding"
          action="approve-leave"
          label="Record a leave request"
          onSelect={() => setRecording(true)}
        />
      </PageChrome>

      <PageBand
        chips={[
          { label: "Waiting on you", value: waiting, tone: waiting > 0 ? "warn" : "success" },
          { label: "Out of the gate", value: out, tone: out > 0 ? "danger" : "neutral" },
          { label: "Approved", value: approved },
          { label: "Back", value: back },
        ]}
      />

      {hostelsQuery.error ? (
        <LoadError
          what="the hostels"
          error={hostelsQuery.error}
          onRetry={() => void hostelsQuery.refetch()}
        />
      ) : null}
      {allQuery.error ? (
        <LoadError
          what="the leave requests"
          error={allQuery.error}
          onRetry={() => void allQuery.refetch()}
        />
      ) : null}

      {allQuery.isLoading ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Waiting on you"
            value={waiting}
            tone={waiting > 0 ? "warn" : "neutral"}
          />
          <StatCard label="Approved" value={approved} />
          <StatCard
            label="Out of the gate"
            value={out}
            tone={out > 0 ? "danger" : "neutral"}
          />
          <StatCard label="Back" value={back} tone="success" />
        </div>
      )}

      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search leave requests"
          />
        }
        filters={
          <>
            <FilterSelect
              label="Hostel"
              allLabel="Every hostel"
              value={hostelFilter}
              options={hostels.map((hostel) => ({ value: hostel.id, label: hostel.name }))}
              onChange={setHostelFilter}
            />
            <ClassFilter label="Year group" value={classValue} onChange={setClassValue} />
            <FilterSelect
              label="Status"
              allLabel="Every status"
              value={status}
              options={LEAVE_STATUSES}
              onChange={setStatus}
            />
            <FilterSelect
              label="Type"
              allLabel="Leave and outings"
              value={requestType}
              options={[
                { value: "LEAVE", label: "LEAVE" },
                { value: "OUTING", label: "OUTING" },
              ]}
              onChange={setRequestType}
            />
          </>
        }
      />

      <Card flush title="Leave and Outing Requests" subtitle="the gate book">
        {/* The four gate moves live in the panel, and each one rewrites a
            request's status. While one is in flight the whole book dims: the
            same row still shows Approve and Sign out, and a second tap while
            the first is landing signs a child out of a request that has not
            been approved yet. */}
        <SavingOverlay saving={working} label="Writing it in the gate book…">
          {allQuery.isLoading ? (
            <LeaveRequestsPanel
              filters={{
                hostelId: hostelFilter,
                status: status as LeaveStatus | "",
                requestType: requestType as "LEAVE" | "OUTING" | "",
                classId: classValue.classId,
                search,
              }}
              filterNames={filterNames}
              onClearFilters={clearFilters}
            />
          ) : all.length === 0 ? (
            // Nothing in the book at all, unfiltered — the school has not
            // started using it. The verb that fills it is in the app bar.
            <div className="px-3 py-6">
              <NothingYet
                title="Nobody has asked to go out"
                body="Leave and outings are recorded here, approved by the warden, and signed out and back in at the gate."
              />
            </div>
          ) : inView.length === 0 ? (
            <div className="px-3 py-6">
              <NothingMatched
                what="requests"
                filters={filterNames}
                onClear={clearFilters}
              />
            </div>
          ) : (
            <LeaveRequestsPanel
              filters={{
                hostelId: hostelFilter,
                status: status as LeaveStatus | "",
                requestType: requestType as "LEAVE" | "OUTING" | "",
                classId: classValue.classId,
                search,
              }}
              filterNames={filterNames}
              onClearFilters={clearFilters}
            />
          )}
        </SavingOverlay>
      </Card>

      <LeaveRequestDialog
        open={recording}
        leaveRequest={null}
        onClose={() => setRecording(false)}
      />
    </>
  );
}
