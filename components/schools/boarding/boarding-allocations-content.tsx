"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, toast } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { ClassFilter, ALL_CLASSES, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell, RecordNameCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  ListRowsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsStudents, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  bedRefusal,
  bedScore,
  type PlaceableBed,
  type PlaceablePupil,
} from "@/lib/schools/boarding-rules";
import { cn } from "@/lib/utils";

import {
  ALLOCATION_STATUSES,
  allocationStatusLabel,
  allocationTone,
  fetchBoardingDashboard,
  fetchHostelOccupancy,
  fetchHostelRooms,
  shortDate,
  type AllocationStatus,
  type BoardingAllocation,
} from "@/components/schools/boarding/boarding-data";
import { AllocateBedDialog, AllocationDialog } from "@/components/schools/boarding/boarding-dialogs";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";

/**
 * Who is in which bed this term — and the placer that puts the rest of them in
 * one.
 *
 * ## The rail is the queue, the table is the record
 *
 * A list of allocations can tell you who is in the house and never where there
 * is space, which is the only thing a warden with a new boarder standing in
 * front of them is looking for. So the page grew a rail down its left side: the
 * pupils who have no bed, one per row, with the bed the rules would give them.
 * Pick one up and the beds that can take them light up; the ones that cannot
 * are dimmed and carry the sentence saying why — `bedRefusal`'s own words,
 * verbatim, because "Nyanga House takes boys only" tells a warden they picked
 * the wrong house and "not eligible" tells them nothing.
 *
 * The table beside it is still allocations and nothing else (§1). The filters
 * above govern it and the row count counts it, which is the property a second
 * subject on this page would have cost.
 *
 * ## Nothing bulk is written until it is committed
 *
 * A single placement applies at once and puts Undo in the toast — one child,
 * one bed, one mistake to walk back.
 *
 * A mass fill does not. It batches into a PENDING set the warden reviews, bed
 * by bed, and then commits or discards in one go. A mass allocation you cannot
 * see before it writes is how a school loses a term of data: twenty-one
 * children moved into the wrong house at nine o'clock on a Sunday night, with
 * nothing on screen between the button and the database.
 *
 * Pending placements are held in this component and are deliberately not
 * optimistic — nothing in the table moves, no bed changes hands, and closing
 * the page throws the proposal away rather than half-writing it.
 */

/* ── what the placer needs of the world ──────────────────────────────── */

/** A pupil waiting for a bed, with everything the rules ask about them. */
type WaitingPupil = PlaceablePupil & {
  studentNo: string;
  className: string | null;
};

/** A bed on the board, ready to be handed to `bedRefusal` and `bedScore`. */
type BoardBed = PlaceableBed & {
  code: string;
  hostelName: string;
  roomCode: string;
};

/** One proposed placement, before anything is written. */
type Placement = {
  pupil: WaitingPupil;
  bed: BoardBed;
};

/**
 * The students endpoint returns every scalar on the record; the shared type
 * only names the ones the roll needs. The placer asks about three more, so it
 * widens the shape here rather than changing a type four other screens read.
 */
type StudentWithPlacerFields = {
  id: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  isBoarding: boolean;
  gender?: string | null;
  isPrefect?: boolean;
  currentClass: { id: string; code: string; name: string } | null;
};

function pupilName(pupil: { firstName: string; lastName: string }): string {
  return `${pupil.firstName} ${pupil.lastName}`;
}

function bedAddress(bed: BoardBed): string {
  return `${bed.hostelName} · room ${bed.roomCode} · bed ${bed.code}`;
}

function tierWord(bed: BoardBed): string {
  if (bed.tier === "U") return "upper bunk";
  if (bed.tier === "L") return "lower bunk";
  return "";
}

export function BoardingAllocationsContent() {
  const queryClient = useQueryClient();

  const [hostelFilter, setHostelFilter] = useState("");
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [editing, setEditing] = useState<BoardingAllocation | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  /** The pupil in hand. Everything on the board is measured against them. */
  const [heldPupilId, setHeldPupilId] = useState<string | null>(null);
  /** Proposed placements, keyed by bed. Written nowhere until committed. */
  const [pending, setPending] = useState<Map<string, Placement>>(new Map());
  const [reviewing, setReviewing] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", hostelFilter, status],
    queryFn: () =>
      fetchBoardingDashboard({
        ...(hostelFilter ? { hostelId: hostelFilter } : {}),
        ...(status ? { status: status as AllocationStatus } : {}),
      }),
  });

  /*
   * The whole register, unnarrowed. The board query above is filtered by the
   * controls, and working out who has no bed from a filtered answer would put
   * a child on the waiting list the moment somebody narrowed to one house.
   */
  const registerQuery = useQuery({
    queryKey: ["schools", "boarding", "register"],
    queryFn: () => fetchBoardingDashboard(),
  });

  const boardersQuery = useQuery({
    queryKey: ["schools", "boarding", "boarders"],
    queryFn: () =>
      fetchSchoolsStudents({ page: 1, limit: 400, status: "ACTIVE", isBoarding: true }),
  });

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "active"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 20, isActive: true }),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;
  const openHouses = useMemo(
    () => (registerQuery.data?.hostels ?? []).filter((hostel) => hostel.isActive),
    [registerQuery.data],
  );

  /*
   * One occupancy read and one room read per open house. The endpoints answer
   * for a house because a bed belongs to a room and a room to a house; a
   * school-wide board is those answers laid end to end rather than a new
   * endpoint returning the same rows in a different shape.
   *
   * Rooms come separately because occupancy does not carry the two facts the
   * rules turn on — whether a dormitory is for prefects, and which classes
   * it is meant for.
   */
  const occupancyQueries = useQueries({
    queries: openHouses.map((hostel) => ({
      queryKey: ["schools", "boarding", "board", hostel.id],
      queryFn: () => fetchHostelOccupancy(hostel.id),
    })),
  });

  const roomQueries = useQueries({
    queries: openHouses.map((hostel) => ({
      queryKey: ["schools", "boarding", "rooms", hostel.id],
      queryFn: () => fetchHostelRooms(hostel.id),
    })),
  });

  const boardLoading =
    registerQuery.isPending ||
    occupancyQueries.some((query) => query.isPending) ||
    roomQueries.some((query) => query.isPending);

  /** Who already has a bed, so the queue is boarders minus these. */
  const beddedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const allocation of registerQuery.data?.data ?? []) {
      if (allocation.status !== "ACTIVE" || allocation.endDate) continue;
      if (!allocation.bed) continue;
      ids.add(allocation.student.id);
    }
    return ids;
  }, [registerQuery.data]);

  /** Which classes are already in a room, for the year-mates half of the score. */
  const roomClassIds = useMemo(() => {
    const byRoom = new Map<string, string[]>();
    for (const allocation of registerQuery.data?.data ?? []) {
      if (allocation.status !== "ACTIVE" || allocation.endDate) continue;
      const roomId = allocation.room?.id;
      const classId = allocation.student.currentClass?.id;
      if (!roomId || !classId) continue;
      byRoom.set(roomId, [...(byRoom.get(roomId) ?? []), classId]);
    }
    return byRoom;
  }, [registerQuery.data]);

  const beds = useMemo<BoardBed[]>(() => {
    /*
     * Two reads per house, because neither endpoint alone can answer the
     * placer's question.
     *
     * Occupancy says who is in a bed and nothing about the bed's own state —
     * a bed nobody is in reads as empty there whether or not it can be slept
     * in. The rooms endpoint carries `status`, which is the half that makes
     * **out of service is not free** true: a broken bed reaches `bedRefusal`
     * carrying its real status and is refused there, rather than being quietly
     * filtered out somewhere upstream where a second rule could disagree.
     */
    const roomFacts = new Map<
      string,
      { isPrefectDorm: boolean; yearGroupIds: string[]; code: string }
    >();
    const bedStatus = new Map<string, { status: string; bay: number | null; tier: string | null }>();

    for (const query of roomQueries) {
      for (const room of query.data ?? []) {
        const extendedRoom = room as typeof room & {
          isPrefectDorm?: boolean;
          yearGroupIds?: string[];
        };
        roomFacts.set(room.id, {
          isPrefectDorm: extendedRoom.isPrefectDorm ?? false,
          yearGroupIds: extendedRoom.yearGroupIds ?? [],
          code: room.code,
        });
        for (const bed of room.beds) {
          const extendedBed = bed as typeof bed & { bay?: number | null; tier?: string | null };
          bedStatus.set(bed.id, {
            // A bed taken out of use entirely is not a bed; it is refused for
            // the same reason a broken one is, and says so in the same voice.
            status: bed.isActive ? bed.status : "WITHDRAWN",
            bay: extendedBed.bay ?? null,
            tier: extendedBed.tier ?? null,
          });
        }
      }
    }

    const out: BoardBed[] = [];
    for (const query of occupancyQueries) {
      const board = query.data;
      if (!board) continue;
      for (const bed of board.beds) {
        const facts = roomFacts.get(bed.room.id);
        const state = bedStatus.get(bed.id);
        out.push({
          id: bed.id,
          code: bed.code,
          // The bed's own status wins where it is known. Falling back to
          // "occupied because somebody is in it" only covers the case where
          // the rooms read has not landed, and never turns a broken bed into
          // an available one.
          status: state?.status ?? (bed.student ? "OCCUPIED" : "AVAILABLE"),
          bay: state?.bay ?? null,
          tier: state?.tier ?? null,
          room: {
            id: bed.room.id,
            isPrefectDorm: facts?.isPrefectDorm ?? false,
            yearGroupIds: facts?.yearGroupIds ?? [],
          },
          hostel: {
            id: board.hostel.id,
            name: board.hostel.name,
            genderPolicy: board.hostel.genderPolicy,
          },
          occupantId: bed.student?.id ?? null,
          hostelName: board.hostel.name,
          roomCode: facts?.code ?? bed.room.code,
        });
      }
    }
    return out;
  }, [occupancyQueries, roomQueries]);

  /** Every boarder with no bed of their own. The rail, in order of arrival. */
  const waiting = useMemo<WaitingPupil[]>(() => {
    const records = (boardersQuery.data?.data ?? []) as unknown as StudentWithPlacerFields[];
    return records
      .filter((record) => !beddedStudentIds.has(record.id))
      .map((record) => ({
        id: record.id,
        firstName: record.firstName,
        lastName: record.lastName,
        gender: record.gender ?? null,
        isPrefect: record.isPrefect ?? false,
        currentClassId: record.currentClass?.id ?? null,
        studentNo: record.studentNo,
        className: record.currentClass?.name ?? null,
      }))
      .sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
      );
  }, [boardersQuery.data, beddedStudentIds]);

  const heldPupil = useMemo(
    () => waiting.find((pupil) => pupil.id === heldPupilId) ?? null,
    [waiting, heldPupilId],
  );

  /**
   * The best bed for one pupil, and why every other bed is not.
   *
   * `bedRefusal` decides, never this — including for a bed that is out of
   * service, which it refuses rather than filtering out, so exactly one place
   * decides whether a bed can take a child.
   */
  const rank = useMemo(() => {
    const houseFreeRatio = new Map<string, number>();
    for (const hostel of openHouses) {
      const inHouse = beds.filter((bed) => bed.hostel.id === hostel.id);
      const free = inHouse.filter(
        (bed) => bed.occupantId === null && bed.status === "AVAILABLE",
      ).length;
      houseFreeRatio.set(hostel.id, inHouse.length === 0 ? 0 : free / inHouse.length);
    }

    return (pupil: PlaceablePupil, takenBedIds: ReadonlySet<string>) =>
      beds
        .map((bed) => {
          const refusal = takenBedIds.has(bed.id)
            ? "Somebody is already in this bed"
            : bedRefusal(bed, pupil);
          return {
            bed,
            refusal,
            score: refusal
              ? -1
              : bedScore(bed, pupil, {
                  dormOccupantClassIds: roomClassIds.get(bed.room.id) ?? [],
                  houseFreeRatio: houseFreeRatio.get(bed.hostel.id) ?? 0,
                }),
          };
        })
        .sort((left, right) => right.score - left.score || left.bed.code.localeCompare(right.bed.code));
  }, [beds, openHouses, roomClassIds]);

  /** Beds this proposal has already spoken for, so a fill cannot double-book. */
  const claimedBedIds = useMemo(() => new Set(pending.keys()), [pending]);

  const proposalFor = (pupil: WaitingPupil) => {
    const offered = rank(pupil, claimedBedIds).find((row) => row.refusal === null);
    return offered?.bed ?? null;
  };

  /* ── writing ───────────────────────────────────────────────────────── */

  const termId = termsQuery.data?.data?.[0]?.id ?? "";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
  };

  const place = useMutation({
    mutationFn: (input: { pupilId: string; bedId: string; roomId: string; hostelId: string }) =>
      fetchJson<{ id: string }>("/api/v2/schools/boarding/allocations", {
        method: "POST",
        body: JSON.stringify({
          studentId: input.pupilId,
          termId,
          hostelId: input.hostelId,
          roomId: input.roomId,
          bedId: input.bedId,
        }),
      }),
    onSuccess: (created, input) => {
      invalidate();
      const pupil = waiting.find((row) => row.id === input.pupilId);
      // Undo lives in the toast because a single placement is one child and
      // one bed: the smallest thing anybody can get wrong, and the cheapest to
      // walk back. It ends the allocation rather than deleting it — where a
      // child slept is a safeguarding record even when it lasted ten seconds.
      toast(`${pupil ? pupil.firstName : "They"} has a bed.`, {
        tone: "success",
        action: {
          label: "Undo",
          onClick: () => {
            void fetchJson(`/api/v2/schools/boarding/allocations/${created.id}`, {
              method: "DELETE",
            }).then(invalidate);
          },
        },
      });
    },
  });

  const commit = useMutation({
    mutationFn: async (placements: Placement[]) => {
      // One at a time and in order, so a refusal halfway through leaves a
      // partial write somebody can see and finish rather than a transaction
      // that rolled back without saying which bed was the problem.
      const failures: string[] = [];
      for (const placement of placements) {
        try {
          await fetchJson("/api/v2/schools/boarding/allocations", {
            method: "POST",
            body: JSON.stringify({
              studentId: placement.pupil.id,
              termId,
              hostelId: placement.bed.hostel.id,
              roomId: placement.bed.room.id,
              bedId: placement.bed.id,
            }),
          });
        } catch (cause) {
          failures.push(`${pupilName(placement.pupil)} — ${getApiErrorMessage(cause)}`);
        }
      }
      return failures;
    },
    onSuccess: (failures, placements) => {
      invalidate();
      setPending(new Map());
      setReviewing(false);
      if (failures.length === 0) {
        toast(
          placements.length === 1
            ? "One pupil placed."
            : `${placements.length} pupils placed.`,
          { tone: "success" },
        );
        return;
      }
      toast(
        `${placements.length - failures.length} of ${placements.length} placed — ${failures.length} refused.`,
        { tone: "warn", description: failures.join(" · "), duration: 12000 },
      );
    },
  });

  const allocationAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/allocations/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  /** Put one pupil on one bed, now. */
  const placeNow = (pupil: WaitingPupil, bed: BoardBed) => {
    setHeldPupilId(null);
    place.mutate({
      pupilId: pupil.id,
      bedId: bed.id,
      roomId: bed.room.id,
      hostelId: bed.hostel.id,
    });
  };

  /**
   * Propose a bed for everybody on the rail.
   *
   * Nothing is written. Each pupil takes the best bed left after the ones
   * before them, so the proposal is internally consistent and the review can
   * be read as a whole rather than a list of separately-plausible rows.
   */
  const proposeForAll = () => {
    const next = new Map<string, Placement>();
    const taken = new Set<string>();
    for (const pupil of waiting) {
      const offered = rank(pupil, taken).find((row) => row.refusal === null);
      if (!offered) continue;
      taken.add(offered.bed.id);
      next.set(offered.bed.id, { pupil, bed: offered.bed });
    }
    setPending(next);
    setHeldPupilId(null);
    if (next.size === 0) {
      toast("No bed in the school can take anybody on this list.", { tone: "warn" });
      return;
    }
    setReviewing(true);
  };

  /* ── the table ─────────────────────────────────────────────────────── */

  const allocations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (boardQuery.data?.data ?? []).filter((row) => {
      if (classValue.classId && row.student.currentClass?.id !== classValue.classId) {
        return false;
      }
      if (!needle) return true;
      return `${row.student.lastName} ${row.student.firstName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [boardQuery.data, classValue.classId, search]);

  const columns = useMemo<ColumnDef<BoardingAllocation>[]>(
    () => [
      {
        id: "student",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            kind="student"
            href={`/schools/students/${row.original.student.id}`}
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            reference={row.original.student.studentNo}
            context={row.original.student.currentClass?.name}
          />
        ),
      },
      {
        id: "location",
        header: "Hostel / room / bed",
        // One cell rather than three: where a child sleeps is an address, the
        // thing a warden reads out over the phone at nine on a Sunday night,
        // and split across columns the reader reassembles it on every row.
        //
        // A dash stands in for a part that is missing: an allocation to a
        // house with no bed yet is a real state, and hiding the gap makes it
        // invisible.
        cell: ({ row }) => (
          <RecordNameCell
            kind="hostel"
            href={`/schools/boarding/${row.original.hostel.id}`}
            name={row.original.hostel.name}
            reference={`${row.original.room?.code ?? "—"} / ${row.original.bed?.code ?? "—"}`}
          />
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => <NumericCell align="left">{row.original.term.code}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={allocationTone(row.original.status)}>
            {allocationStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => <NumericCell>{shortDate(row.original.startDate)}</NumericCell>,
      },
      {
        id: "end",
        header: "End",
        cell: ({ row }) => <NumericCell>{shortDate(row.original.endDate)}</NumericCell>,
      },
      {
        id: "verbs",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const allocation = row.original;
          const verbs: RecordVerb[] = [
            {
              label: "Edit",
              action: "allocate-bed",
              onSelect: () => setEditing(allocation),
            },
          ];
          if (allocation.status === "ACTIVE") {
            verbs.push({
              label: "Free the bed",
              action: "allocate-bed",
              tone: "warning",
              loading: pendingId === allocation.id,
              confirm: {
                title: "Free the bed",
                description: `${pupilName(allocation.student)} moves out of ${allocation.hostel.name}, bed ${allocation.bed?.code ?? "—"} goes back on the board, and they go back on the waiting list rather than quietly vanishing.`,
                confirmLabel: "Free it",
              },
              onSelect: () => {
                setPendingId(allocation.id);
                allocationAction.mutate({ id: allocation.id, body: { status: "ENDED" } });
              },
            });
          }
          verbs.push({
            label: "Delete",
            action: "archive",
            tone: "danger",
            loading: pendingId === allocation.id,
            confirm: {
              title: "Delete this allocation",
              description:
                "The row goes for good, as though the child was never given this bed. Use it only for an allocation made in error — a child who left is ended, not deleted.",
              confirmLabel: "Delete it",
            },
            onSelect: () => {
              setPendingId(allocation.id);
              allocationAction.mutate({ id: allocation.id, remove: true });
            },
          });
          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.boarding"
                label={`Actions for ${pupilName(allocation.student)}`}
                verbs={verbs}
              />
            </div>
          );
        },
      },
    ],
    [allocationAction, pendingId],
  );

  const filterNames = [
    hostels.find((hostel) => hostel.id === hostelFilter)?.name,
    status ? allocationStatusLabel(status as AllocationStatus) : null,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setClassValue(ALL_CLASSES);
    setStatus("");
    setSearch("");
  };

  const pendingList = [...pending.values()];

  return (
    <>
      <PageChrome title="Allocations">
        <CreateButton
          resource="schools.boarding"
          action="allocate-bed"
          label="Allocate a bed"
          onSelect={() => setAllocating(true)}
          unavailable={
            hostels.length === 0 ? "There is no hostel to put anybody in." : undefined
          }
        />
      </PageChrome>

      {boardQuery.error ? (
        <LoadError
          what="the boarding board"
          error={boardQuery.error}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {place.error ? <SaveError what="That placement" error={place.error} /> : null}
      {allocationAction.error ? (
        <SaveError what="That allocation" error={allocationAction.error} />
      ) : null}
      {termsQuery.data && !termId ? (
        <Alert tone="warn" title="No term is running">
          A bed is given out for a term, so nobody can be placed until one is set as
          active.
        </Alert>
      ) : null}

      <TableControls
        tabs={
          <BoardingViews
            allocations={summary?.totalAllocations}
            hostels={summary?.hostels}
          />
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or admission number"
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
            <ClassFilter value={classValue} onChange={setClassValue} />
            <FilterSelect
              label="Status"
              allLabel="Every status"
              value={status}
              options={ALLOCATION_STATUSES}
              onChange={setStatus}
            />
          </>
        }
        count={
          // Against the whole register, not against the response. The house and
          // status filters are applied by the server, so reading the
          // denominator off `boardQuery` makes it agree with the numerator the
          // moment either is used — "12 of 12" on a school with three hundred
          // allocations, which is the control saying nothing precisely when it
          // is being asked something.
          boardQuery.isPending
            ? null
            : `${allocations.length} of ${summary?.totalAllocations ?? allocations.length}`
        }
      />

      {/* The rail is a bounded side panel and takes a border; the table is the
          page and takes none. §5 is about a card drawn around something that
          already fills the screen, not about every edge on it. */}
      <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)] lg:items-start">
        <PlacerRail
          waiting={waiting}
          loading={boardersQuery.isPending || boardLoading}
          error={boardersQuery.error ?? registerQuery.error ?? null}
          heldPupilId={heldPupilId}
          proposalFor={proposalFor}
          pendingCount={pending.size}
          onHold={(pupil) =>
            setHeldPupilId((current) => (current === pupil.id ? null : pupil.id))
          }
          onProposeForAll={proposeForAll}
        />

        <div className="min-w-0 space-y-3">
          {heldPupil ? (
            <BedPicker
              pupil={heldPupil}
              rows={rank(heldPupil, claimedBedIds)}
              placing={place.isPending}
              onPlace={(bed) => placeNow(heldPupil, bed)}
              onPutDown={() => setHeldPupilId(null)}
            />
          ) : null}

          {boardQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Pupil", "Hostel / room / bed", "Term", "Status", "Start", "End", ""]}
              columns={[
                { avatar: true, twoLine: true },
                {},
                { width: 70 },
                { width: 100, badge: true },
                { width: 80 },
                { width: 80 },
                { width: 40 },
              ]}
            />
          ) : (
            <DataTable
              data={allocations}
              columns={columns}
              pagination={{ enabled: true }}
              emptyState={
                hostels.length === 0 ? (
                  <NothingYet
                    title="No beds have been given out"
                    body="A boarding house, its rooms and its beds come first; after that this is where the term's allocations live."
                    action={
                      <Button asChild variant="secondary">
                        <Link href="/schools/boarding/hostels">Open hostels</Link>
                      </Button>
                    }
                  />
                ) : filterNames.length > 0 || classValue.classId || search.trim() ? (
                  <NothingMatched
                    what="allocations"
                    filters={filterNames}
                    search={search}
                    onClear={clearFilters}
                  />
                ) : (
                  <NothingYet
                    title="Nobody is in a bed yet"
                    body="Pick a pupil from the waiting list and press the bed they are going into."
                  />
                )
              }
            />
          )}
        </div>
      </div>

      {pending.size > 0 ? (
        <PendingBar
          placements={pendingList}
          committing={commit.isPending}
          onReview={() => setReviewing(true)}
          onDiscard={() => setPending(new Map())}
        />
      ) : null}

      <ReviewDialog
        open={reviewing}
        placements={pendingList}
        committing={commit.isPending}
        error={commit.error}
        onClose={() => setReviewing(false)}
        onDrop={(bedId) =>
          setPending((current) => {
            const next = new Map(current);
            next.delete(bedId);
            return next;
          })
        }
        onCommit={() => commit.mutate(pendingList)}
      />

      <AllocateBedDialog
        open={allocating}
        hostels={hostels}
        defaultHostelId={hostelFilter || undefined}
        onClose={() => setAllocating(false)}
      />
      <AllocationDialog
        open={editing !== null}
        allocation={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/* ── the rail ────────────────────────────────────────────────────────── */

/**
 * The pupils with no bed, and the bed the rules would give each of them.
 *
 * Every row carries its proposal as a badge, so the answer to "where would
 * this one go" is already on screen before anybody presses anything — and a
 * pupil no bed in the school can take says so plainly rather than silently
 * offering nothing.
 */
function PlacerRail({
  waiting,
  loading,
  error,
  heldPupilId,
  proposalFor,
  pendingCount,
  onHold,
  onProposeForAll,
}: {
  waiting: WaitingPupil[];
  loading: boolean;
  error: unknown;
  heldPupilId: string | null;
  proposalFor: (pupil: WaitingPupil) => BoardBed | null;
  pendingCount: number;
  onHold: (pupil: WaitingPupil) => void;
  onProposeForAll: () => void;
}) {
  return (
    <aside
      aria-label="Waiting for a bed"
      className="rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
    >
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <h2 className="text-sm font-semibold text-[color:var(--text-strong)]">
          Waiting for a bed
        </h2>
        <span className="font-mono text-sm tabular-nums text-[color:var(--text-subtle)]">
          {loading ? "" : waiting.length}
        </span>
      </div>

      {error ? (
        <LoadError what="the waiting list" error={error} />
      ) : loading ? (
        <ListRowsSkeleton rows={5} label="Reading the waiting list" />
      ) : waiting.length === 0 ? (
        <NothingLeftToDo
          title="Everybody has a bed"
          body="Nobody on the roll is boarding without one."
        />
      ) : (
        <>
          <p className="pb-2 text-sm text-[color:var(--text-muted)]">
            {heldPupilId
              ? "Press the bed they are going into. Beds that cannot take them are dimmed and say why."
              : "Pick a pupil, then press a bed."}
          </p>
          <ul className="space-y-1">
            {waiting.map((pupil) => {
              const held = pupil.id === heldPupilId;
              const offered = proposalFor(pupil);
              return (
                <li key={pupil.id}>
                  <button
                    type="button"
                    aria-pressed={held}
                    onClick={() => onHold(pupil)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-[var(--radius-md)] border px-2 py-1.5 text-left transition-colors",
                      held
                        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]"
                        : "border-[color:var(--border-subtle)] hover:border-[color:var(--border-strong)]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--text-strong)]">
                        {pupilName(pupil)}
                      </span>
                      <span className="block truncate font-mono text-xs text-[color:var(--text-subtle)]">
                        {pupil.studentNo}
                        {pupil.className ? ` · ${pupil.className}` : ""}
                      </span>
                    </span>
                    {offered ? (
                      <Badge tone="neutral" title={bedAddress(offered)}>
                        {offered.code}
                      </Badge>
                    ) : (
                      <Badge tone="danger">None</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="pt-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={pendingCount > 0}
              title={
                pendingCount > 0
                  ? "There is already a proposal waiting to be committed."
                  : undefined
              }
              onClick={onProposeForAll}
            >
              Fill a bed for everybody
            </Button>
            <p className="pt-1.5 text-xs text-[color:var(--text-subtle)]">
              Proposes, never writes. You see every bed before anything is saved.
            </p>
          </div>
        </>
      )}
    </aside>
  );
}

/* ── the board, once somebody is in hand ─────────────────────────────── */

type RankedBed = { bed: BoardBed; refusal: string | null; score: number };

/**
 * Every bed in the school, measured against the pupil in hand.
 *
 * Eligible beds are lit and pressable and lead, best first. Refused beds stay
 * on screen, dimmed, carrying `bedRefusal`'s sentence as their label — a bed
 * that vanished would leave a warden hunting for a dormitory they can see from
 * where they are standing, and "out of service" is something they need to read
 * rather than something to hide.
 */
function BedPicker({
  pupil,
  rows,
  placing,
  onPlace,
  onPutDown,
}: {
  pupil: WaitingPupil;
  rows: RankedBed[];
  placing: boolean;
  onPlace: (bed: BoardBed) => void;
  onPutDown: () => void;
}) {
  const offered = rows.filter((row) => row.refusal === null);
  const refused = rows.filter((row) => row.refusal !== null);

  return (
    <section
      aria-label={`Beds for ${pupilName(pupil)}`}
      className="rounded-[var(--card-radius)] border border-[color:var(--brand)] bg-[color:var(--surface)] p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 className="text-sm font-semibold text-[color:var(--text-strong)]">
          {pupilName(pupil)} is picked up
        </h2>
        <Button variant="ghost" size="sm" onClick={onPutDown}>
          Put them down
        </Button>
      </div>

      {offered.length === 0 ? (
        <NothingLeftToDo
          title="No bed in the school can take them"
          body={
            refused[0]?.refusal
              ? `Every bed is refused — the first says: ${refused[0].refusal}.`
              : "There are no beds on the board yet."
          }
        />
      ) : (
        <>
          <p className="pb-2 text-sm text-[color:var(--text-muted)]">
            {offered.length} {offered.length === 1 ? "bed can" : "beds can"} take them, best
            first.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {offered.slice(0, 24).map((row) => (
              <li key={row.bed.id}>
                <button
                  type="button"
                  disabled={placing}
                  onClick={() => onPlace(row.bed)}
                  className="w-full rounded-[var(--radius-md)] border border-[color:var(--brand)] bg-[color:var(--brand-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--brand-100)] disabled:opacity-50"
                >
                  <span className="block truncate text-sm font-medium text-[color:var(--brand-strong)]">
                    {row.bed.hostelName}
                  </span>
                  <span className="block truncate font-mono text-xs text-[color:var(--text-muted)]">
                    room {row.bed.roomCode} · bed {row.bed.code}
                    {tierWord(row.bed) ? ` · ${tierWord(row.bed)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {refused.length > 0 ? (
        <details className="pt-3">
          <summary className="cursor-pointer text-sm text-[color:var(--text-muted)]">
            {refused.length} {refused.length === 1 ? "bed cannot" : "beds cannot"} take them
          </summary>
          <ul className="grid gap-1.5 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {refused.slice(0, 24).map((row) => (
              <li
                key={row.bed.id}
                title={row.refusal ?? undefined}
                className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-2.5 py-2 opacity-50"
              >
                <span className="block truncate text-sm text-[color:var(--text-body)]">
                  {row.bed.hostelName} · {row.bed.code}
                </span>
                <span className="block truncate text-xs text-[color:var(--text-subtle)]">
                  {row.refusal}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/* ── pending, and what happens to it ─────────────────────────────────── */

/**
 * A proposal, waiting. Deliberately loud and deliberately in the way: nothing
 * in it has been written, and a bar that could be mistaken for a saved state
 * would defeat the whole point of batching.
 */
function PendingBar({
  placements,
  committing,
  onReview,
  onDiscard,
}: {
  placements: Placement[];
  committing: boolean;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const names = placements.slice(0, 3).map((placement) => placement.pupil.firstName);
  const rest = placements.length - names.length;

  return (
    <div className="campus-fade-in sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-[var(--card-radius)] border border-[color:var(--brand)] bg-[color:var(--surface)] px-3 py-2.5 shadow-[var(--shadow-popover)]">
      <span className="min-w-0 flex-1 text-sm">
        <strong className="text-[color:var(--text-strong)]">
          {placements.length} waiting to be committed.
        </strong>{" "}
        <span className="text-[color:var(--text-muted)]">
          {names.join(", ")}
          {rest > 0 ? ` and ${rest} more` : ""} — nothing is written yet.
        </span>
      </span>
      <Button variant="ghost" size="sm" disabled={committing} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" size="sm" disabled={committing} onClick={onReview}>
        Review the {placements.length}
      </Button>
    </div>
  );
}

/** Every proposed bed, one per line, with the way to drop one before writing. */
function ReviewDialog({
  open,
  placements,
  committing,
  error,
  onClose,
  onDrop,
  onCommit,
}: {
  open: boolean;
  placements: Placement[];
  committing: boolean;
  error: unknown;
  onClose: () => void;
  onDrop: (bedId: string) => void;
  onCommit: () => void;
}) {
  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Before this is written"
      description="Every bed this fill would give out. Nothing has been saved."
      size="lg"
      errors={error ? [getApiErrorMessage(error)] : undefined}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={committing}>
            Not yet
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={committing}
            disabled={committing || placements.length === 0}
            onClick={onCommit}
          >
            {placements.length === 1
              ? "Commit the placement"
              : `Commit all ${placements.length}`}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-[color:var(--border-subtle)]">
        {placements.map((placement) => (
          <li
            key={placement.bed.id}
            className="flex flex-wrap items-center gap-3 py-2 first:pt-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[color:var(--text-strong)]">
                {pupilName(placement.pupil)}
              </span>
              <span className="block truncate font-mono text-xs text-[color:var(--text-subtle)]">
                {placement.pupil.studentNo}
                {placement.pupil.className ? ` · ${placement.pupil.className}` : ""}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-sm text-[color:var(--text-body)]">
              {bedAddress(placement.bed)}
              {tierWord(placement.bed) ? (
                <span className="text-[color:var(--text-subtle)]">
                  {" "}
                  · {tierWord(placement.bed)}
                </span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={committing}
              onClick={() => onDrop(placement.bed.id)}
            >
              Leave them out
            </Button>
          </li>
        ))}
      </ul>
    </RecordDialog>
  );
}
