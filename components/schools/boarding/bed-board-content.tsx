"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { normaliseGender } from "@/lib/schools/boarding-rules";

import { AllocateBedDialog } from "./boarding-dialogs";
import type { BoardingHostel } from "./boarding-data";

type Bed = {
  id: string;
  code: string;
  room: { id: string; code: string; floor: string | null; capacity: number | null };
  allocationId: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    gender: string | null;
  } | null;
};

type Board = {
  hostel: {
    id: string;
    code: string;
    name: string;
    genderPolicy: string;
    capacity: number | null;
  };
  unbedded: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    gender: string | null;
  }[];
  beds: Bed[];
};

/**
 * The bed board.
 *
 * Built from the beds outward, so an empty bed is a row rather than an absence
 * — which is the only thing a warden with a new boarder standing in front of
 * them is looking for. A list of allocations, which is what the boarding page
 * used to be, can tell you who is in the hostel and never where there is space.
 *
 * This component was written, reviewed and then rendered by no route at all for
 * the whole of its first life. It is now the "Beds" tab of the hostel record.
 *
 * The student picker leaves the gender and capacity rules to the server. The
 * students list does not carry gender, so a client-side check would either be
 * wrong or need a second request per child; the refusal that comes back names
 * the hostel and the rule, which is what a warden needs to read anyway.
 */
export function BedBoardContent({ hostelId }: { hostelId: string }) {
  const queryClient = useQueryClient();
  const [roomFilter, setRoomFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [allocatingTo, setAllocatingTo] = useState<Bed | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "board", hostelId],
    queryFn: () =>
      fetchJson<Board>(`/api/v2/schools/boarding/hostels/${hostelId}/occupancy`),
  });

  const board = boardQuery.data ?? null;
  const beds = useMemo(() => board?.beds ?? [], [board]);

  const rooms = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bed of beds) seen.set(bed.room.id, `Room ${bed.room.code}`);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [beds]);

  const visible = useMemo(
    () =>
      beds.filter((bed) => {
        if (roomFilter && bed.room.id !== roomFilter) return false;
        if (stateFilter === "free" && bed.student) return false;
        if (stateFilter === "taken" && !bed.student) return false;
        return true;
      }),
    [beds, roomFilter, stateFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Bed[]>();
    for (const bed of visible) {
      const key = `Room ${bed.room.code}${bed.room.floor ? ` · Floor ${bed.room.floor}` : ""}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(bed);
      else map.set(key, [bed]);
    }
    return [...map.entries()];
  }, [visible]);

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

  // The dialog wants the hostel in the shape the board page passes it. Only the
  // id and name are read from it here, so the counts are the board's own.
  const hostelOption: BoardingHostel[] = board
    ? [
        {
          id: board.hostel.id,
          code: board.hostel.code,
          name: board.hostel.name,
          genderPolicy: board.hostel.genderPolicy,
          capacity: board.hostel.capacity,
          isActive: true,
          _count: { rooms: rooms.length, beds: beds.length, allocations: taken },
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      {boardQuery.error ? (
        <LoadError
          what="the bed board"
          error={boardQuery.error}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {freeBed.error ? <SaveError what="That bed" error={freeBed.error} /> : null}

      {board ? (
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {board.hostel.name} ·{" "}
          {board.hostel.genderPolicy === "MIXED"
            ? "mixed"
            : board.hostel.genderPolicy === "MALE"
              ? "boys only"
              : "girls only"}{" "}
          · {taken} of {beds.length} bed{beds.length === 1 ? "" : "s"} taken
          {board.hostel.capacity ? ` · capacity ${board.hostel.capacity}` : ""}
        </p>
      ) : null}

      {board && board.unbedded.length > 0 ? (
        <Alert
          tone="warn"
          title={`${board.unbedded.length} boarder${board.unbedded.length === 1 ? " has" : "s have"} no bed`}
        >
          {board.unbedded.map((row) => `${row.lastName}, ${row.firstName}`).join(" · ")} —
          allocated to the hostel but not to a bed.
        </Alert>
      ) : null}

      <FilterBar>
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
      </FilterBar>

      {boardQuery.isLoading ? (
        <TableRowsSkeleton columns={[{ width: 90 }, { avatar: true, twoLine: true }, { width: 80 }, { width: 170 }]} />
      ) : grouped.length === 0 ? (
        beds.length === 0 ? (
          <NothingYet
            title="No beds are set up in this hostel"
            body="Rooms hold the beds and beds are what a child is allocated to. Add a room on the Rooms tab and the board fills itself."
          />
        ) : (
          <NothingMatched
            what="beds"
            filters={[
              rooms.find((room) => room.value === roomFilter)?.label ?? "",
              stateFilter === "free" ? "Free beds" : stateFilter === "taken" ? "Taken beds" : "",
            ].filter(Boolean)}
            onClear={() => {
              setRoomFilter("");
              setStateFilter("");
            }}
          />
        )
      ) : (
        <ul className="space-y-3">
          {grouped.map(([heading, roomBeds]) => (
            <li
              key={heading}
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                <span className="font-medium text-[color:var(--text-strong)]">
                  {heading}
                </span>
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
        hostels={hostelOption}
        defaultHostelId={hostelId}
        onClose={() => setAllocatingTo(null)}
      />
    </div>
  );
}
