"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge } from "@corelithzw/react";

import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { fetchJson } from "@corelithzw/platform/api-client";
import { normaliseGender } from "@/lib/schools/boarding-rules";

import { AllocateBedDialog } from "@/components/schools/boarding/boarding-dialogs";
import {
  fetchHostelOccupancy,
  fetchHostels,
  type BoardingHostel,
  type HostelOccupancy,
} from "@/components/schools/boarding/boarding-data";

/**
 * The bed board.
 *
 * Built from the beds outward, so a free bed is a ROW rather than an absence —
 * which is the only thing a warden with a new boarder standing in front of them
 * is looking for. A list of allocations, which is what the boarding page used to
 * be, can tell you who is in the house and never where there is space.
 *
 * Two shapes, one component. Given a `hostelId` it is one house, which is how
 * the hostels screen and the hostel record embed it. Given none it is the whole
 * school, which is what `/schools/boarding` shows: a warden with a new boarder
 * and no house in mind is asking "where is there a bed", and a screen that made
 * them pick a house first would be asking them to guess the answer before it
 * would give it to them.
 *
 * Every bed carries its verb. "Free the bed" on a taken one, "Give it to
 * somebody" on a free one — the canvas's own words, and both of them acts
 * rather than descriptions.
 *
 * The student picker leaves the gender and capacity rules to the server. The
 * students list does not carry gender, so a client-side check would either be
 * wrong or need a second request per child; the refusal that comes back names
 * the hostel and the rule, which is what a warden needs to read anyway.
 */

type Bed = HostelOccupancy["beds"][number] & { hostel: { id: string; name: string } };

export function BedBoardContent({
  hostelId,
}: {
  /** One house. Omit for the whole school. */
  hostelId?: string;
}) {
  const queryClient = useQueryClient();
  const [hostelFilter, setHostelFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [allocatingTo, setAllocatingTo] = useState<Bed | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const schoolWide = !hostelId;

  const hostelsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels"],
    queryFn: fetchHostels,
    enabled: schoolWide,
  });

  const hostels = useMemo<BoardingHostel[]>(
    () => hostelsQuery.data ?? [],
    [hostelsQuery.data],
  );

  // One occupancy read per house. The endpoint answers for a house because a
  // bed belongs to a room and a room belongs to a house; a school-wide board is
  // those answers laid end to end rather than a sixth endpoint that returns the
  // same rows in a different shape.
  const ids = schoolWide ? hostels.map((hostel) => hostel.id) : [hostelId];
  const boards = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["schools", "boarding", "board", id],
      queryFn: () => fetchHostelOccupancy(id),
    })),
  });

  const loading =
    (schoolWide && hostelsQuery.isLoading) || boards.some((board) => board.isLoading);
  const loadError =
    hostelsQuery.error ?? boards.find((board) => board.error)?.error ?? null;
  const loaded = boards
    .map((board) => board.data)
    .filter((board): board is HostelOccupancy => Boolean(board));

  /*
   * Flattened plainly rather than memoised. The occupancy answers are already
   * cached by the query client, so this runs over a few hundred beds on a
   * render that was going to happen anyway — and a memo keyed on an array the
   * query hook rebuilds every render would be a memo that never hits.
   */
  const beds: Bed[] = loaded.flatMap((board) =>
    board.beds.map((bed) => ({
      ...bed,
      hostel: { id: board.hostel.id, name: board.hostel.name },
    })),
  );

  const unbedded = loaded.flatMap((board) =>
    board.unbedded.map((student) => ({ ...student, hostel: board.hostel.name })),
  );

  const rooms = (() => {
    const seen = new Map<string, string>();
    for (const bed of beds) {
      if (hostelFilter && bed.hostel.id !== hostelFilter) continue;
      seen.set(bed.room.id, `Room ${bed.room.code}`);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  })();

  const needle = search.trim().toLowerCase();
  const visible = beds.filter((bed) => {
    if (hostelFilter && bed.hostel.id !== hostelFilter) return false;
    if (roomFilter && bed.room.id !== roomFilter) return false;
    if (stateFilter === "free" && bed.student) return false;
    if (stateFilter === "taken" && !bed.student) return false;
    if (!needle) return true;
    const who = bed.student
      ? `${bed.student.lastName} ${bed.student.firstName} ${bed.student.studentNo}`
      : "";
    return `${bed.hostel.name} ${bed.room.code} ${bed.code} ${who}`
      .toLowerCase()
      .includes(needle);
  });

  /**
   * Grouped by room, headed `Room 12 · 6 of 8`. The house is in the heading too
   * on the school-wide board, because "Room 12" on its own names four rooms in
   * a school with four houses.
   */
  const grouped = (() => {
    const map = new Map<string, Bed[]>();
    for (const bed of visible) {
      const key = [
        schoolWide ? bed.hostel.name : null,
        `Room ${bed.room.code}`,
        bed.room.floor ? `Floor ${bed.room.floor}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const bucket = map.get(key);
      if (bucket) bucket.push(bed);
      else map.set(key, [bed]);
    }
    return [...map.entries()];
  })();

  const freeBed = useMutation({
    mutationFn: (allocationId: string) =>
      fetchJson(`/api/v2/schools/boarding/allocations/${allocationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ENDED" }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      void queryClient.invalidateQueries({ queryKey: ["records"] });
    },
  });

  const taken = beds.filter((bed) => bed.student).length;

  // The allocate dialog wants houses in the board's own shape. Only the id and
  // the name are read from it, so the counts here are the board's rather than a
  // second read of the same numbers.
  const hostelOptions: BoardingHostel[] = schoolWide
    ? hostels
    : loaded.map((board) => ({
        id: board.hostel.id,
        code: board.hostel.code,
        name: board.hostel.name,
        genderPolicy: board.hostel.genderPolicy,
        capacity: board.hostel.capacity,
        isActive: true,
        _count: {
          rooms: new Set(board.beds.map((bed) => bed.room.id)).size,
          beds: board.beds.length,
          allocations: board.beds.filter((bed) => bed.student).length,
        },
      }));

  const filterNames = [
    hostels.find((hostel) => hostel.id === hostelFilter)?.name,
    rooms.find((room) => room.value === roomFilter)?.label,
    stateFilter === "free" ? "Free beds" : stateFilter === "taken" ? "Taken beds" : null,
    search.trim() || null,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setRoomFilter("");
    setStateFilter("");
    setSearch("");
  };

  return (
    <div className="space-y-3">
      {loadError ? (
        <LoadError
          what="the bed board"
          error={loadError}
          onRetry={() => {
            void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
          }}
        />
      ) : null}
      {freeBed.error ? <SaveError what="That bed" error={freeBed.error} /> : null}

      {loaded.length > 0 ? (
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {taken} of {beds.length} bed{beds.length === 1 ? "" : "s"} taken across{" "}
          {loaded.length} house{loaded.length === 1 ? "" : "s"}.
        </p>
      ) : null}

      {unbedded.length > 0 ? (
        <Alert
          tone="warn"
          title={`${unbedded.length} boarder${unbedded.length === 1 ? " has" : "s have"} no bed`}
        >
          {unbedded.map((row) => `${row.lastName}, ${row.firstName}`).join(" · ")} —
          allocated to a house but not to a bed.
        </Alert>
      ) : null}

      <TableControls
        search={
          <TableSearch value={search} onChange={setSearch} placeholder="Search beds" />
        }
        filters={
          <>
            {schoolWide ? (
              <FilterSelect
                label="Hostel"
                allLabel="Every hostel"
                value={hostelFilter}
                options={hostels.map((hostel) => ({
                  value: hostel.id,
                  label: hostel.name,
                }))}
                onChange={(value) => {
                  setHostelFilter(value);
                  setRoomFilter("");
                }}
              />
            ) : null}
            <FilterSelect
              label="Room"
              allLabel="Every room"
              value={roomFilter}
              options={rooms}
              onChange={setRoomFilter}
            />
            <FilterSelect
              label="Bed"
              allLabel="Every bed"
              value={stateFilter}
              options={[
                { value: "free", label: "Free beds" },
                { value: "taken", label: "Taken beds" },
              ]}
              onChange={setStateFilter}
            />
          </>
        }
      />

      {loading ? (
        <TableRowsSkeleton
          columns={[
            { width: 90 },
            { avatar: true, twoLine: true },
            { width: 80 },
            { width: 170 },
          ]}
        />
      ) : grouped.length === 0 ? (
        beds.length === 0 ? (
          <NothingYet
            title="No beds are set up"
            body="Rooms hold the beds and beds are what a child is allocated to. Add a room to a house and the board fills itself."
          />
        ) : (
          <NothingMatched what="beds" filters={filterNames} onClear={clearFilters} />
        )
      ) : (
        <ul className="space-y-3">
          {grouped.map(([heading, roomBeds]) => (
            <li
              key={heading}
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                <span className="font-medium text-[color:var(--text-strong)]">{heading}</span>
                <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                  {roomBeds.filter((bed) => bed.student).length} of {roomBeds.length}
                </span>
              </div>
              <ul className="divide-y divide-[color:var(--border-subtle)]">
                {roomBeds.map((bed) => {
                  const gender = bed.student ? normaliseGender(bed.student.gender) : null;
                  return (
                    <li key={bed.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="w-[70px] shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)]">
                        Bed {bed.code}
                      </span>
                      {bed.student ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <PersonAvatar
                            firstName={bed.student.firstName}
                            lastName={bed.student.lastName}
                          />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {bed.student.lastName}, {bed.student.firstName}
                            </span>
                            <span className="block truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                              {bed.student.studentNo}
                              {gender ? ` · ${gender === "MALE" ? "boy" : "girl"}` : ""}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 text-[color:var(--text-muted)]">
                          Free
                        </span>
                      )}
                      <Badge tone={bed.student ? "brand" : "success"}>
                        {bed.student ? "Taken" : "Free"}
                      </Badge>
                      <RecordActions
                        resource="schools.boarding"
                        verbs={
                          bed.student
                            ? [
                                {
                                  label: "Free the bed",
                                  action: "allocate-bed",
                                  tone: "warning",
                                  loading: pendingId === bed.id,
                                  confirm: {
                                    title: "Free the bed",
                                    description: `${bed.student.firstName} ${bed.student.lastName} moves out of bed ${bed.code}, the bed goes back on the board, and they stop counting as a boarder if this was their only bed.`,
                                    confirmLabel: "Free it",
                                  },
                                  onSelect: () => {
                                    if (!bed.allocationId) return;
                                    setPendingId(bed.id);
                                    freeBed.mutate(bed.allocationId);
                                  },
                                },
                              ]
                            : [
                                {
                                  label: "Give it to somebody",
                                  action: "allocate-bed",
                                  onSelect: () => setAllocatingTo(bed),
                                },
                              ]
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <AllocateBedDialog
        open={allocatingTo !== null}
        hostels={hostelOptions}
        defaultHostelId={allocatingTo?.hostel.id ?? hostelId}
        onClose={() => setAllocatingTo(null)}
      />
    </div>
  );
}
