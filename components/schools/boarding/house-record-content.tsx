"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  RecordNotFound,
  TableRowsSkeleton,
} from "@/components/records/states";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { ApiError } from "@/lib/api-client";

import {
  fetchHostelOccupancy,
  genderPolicyLabel,
} from "@/components/schools/boarding/boarding-data";
import {
  DormitoryPlan,
  DormitoryPlanLegend,
  DormitoryPlanSkeleton,
  isBedFree,
  isBedOutOfService,
  planSentence,
  planStats,
  roomsFromBeds,
  type OccupancyBed,
  type PlanBed,
  type PlanRoom,
} from "@/components/schools/boarding/dormitory-plan";

/**
 * One house: where there is space, who is in here, and who is in tonight.
 *
 * Three tabs because they are three populations of the same house, not three
 * subjects — the plan is the beds, Boarders is the people in them, Tonight is
 * the subset of those people who are actually in the building. §1 of the canvas
 * law: a tab picks which records exist on the screen, and every one of these is
 * still about this house.
 *
 * ## The plan is the default, and that is the argument
 *
 * A warden opening a house is usually holding a child who needs a bed. A list
 * of allocations answers "who is in the house" and never "where is there
 * space"; the plan answers both, because a free bed is drawn rather than left
 * as a hole in a list. The dormitory rail on the left is every room in the
 * house with its own free count — *All dormitories* draws them all at 18px,
 * one dormitory draws it full size. Same picture, two sizes, which is what
 * lets a house of four and a school of forty read the same way.
 */

type View = "plan" | "boarders" | "tonight";

/** What the rail and the plan headers both need to say about a room. */
function roomStats(room: PlanRoom) {
  return planStats(room.beds);
}

export function HouseRecordContent({ houseId }: { houseId: string }) {
  const [view, setView] = useState<View>("plan");
  const [dormId, setDormId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tonightFilter, setTonightFilter] = useState("");

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "board", houseId],
    queryFn: () => fetchHostelOccupancy(houseId),
  });

  const board = boardQuery.data ?? null;
  const house = board?.hostel ?? null;

  const rooms = useMemo<PlanRoom[]>(
    () => roomsFromBeds((board?.beds ?? []) as OccupancyBed[]),
    [board],
  );

  const allBeds = useMemo(() => rooms.flatMap((room) => room.beds), [rooms]);
  const houseStats = planStats(allBeds);

  /** Everybody with a bed in this house, with the bed they are in. */
  const boarders = useMemo(() => {
    const rows: { bed: PlanBed; room: PlanRoom }[] = [];
    for (const room of rooms) {
      for (const bed of room.beds) {
        if (bed.occupant) rows.push({ bed, room });
      }
    }
    return rows.sort((a, b) =>
      (a.bed.occupant?.name ?? "").localeCompare(b.bed.occupant?.name ?? ""),
    );
  }, [rooms]);

  const shownBoarders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return boarders;
    return boarders.filter((row) =>
      `${row.bed.occupant?.name ?? ""} ${row.bed.occupant?.reference ?? ""} ${row.bed.code}`
        .toLowerCase()
        .includes(needle),
    );
  }, [boarders, search]);

  /**
   * Who is in the building tonight.
   *
   * Everybody with a bed here, less those the school already knows are away.
   * The away flags come off the bed's occupant, which is where the gate book
   * and the sick bay write them — a boarder in the sick bay **keeps their own
   * bed**, so they are still a row here and still hold a bed on the plan.
   */
  const tonight = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return boarders.filter((row) => {
      const occupant = row.bed.occupant;
      if (!occupant) return false;
      if (tonightFilter === "in" && (occupant.signedOut || occupant.sickBay)) return false;
      if (tonightFilter === "out" && !occupant.signedOut) return false;
      if (tonightFilter === "sick" && !occupant.sickBay) return false;
      if (!needle) return true;
      return `${occupant.name} ${occupant.reference ?? ""}`.toLowerCase().includes(needle);
    });
  }, [boarders, tonightFilter, search]);

  const inTonight = boarders.filter(
    (row) => !row.bed.occupant?.signedOut && !row.bed.occupant?.sickBay,
  ).length;

  const chosenRoom = dormId ? (rooms.find((room) => room.id === dormId) ?? null) : null;

  const boarderColumns = useMemo<ColumnDef<{ bed: PlanBed; room: PlanRoom }>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => {
          const occupant = row.original.bed.occupant;
          if (!occupant) return null;
          const [firstName, ...rest] = occupant.name.split(" ");
          return (
            <PersonCell
              kind="student"
              href={`/schools/students/${occupant.id}`}
              firstName={firstName}
              lastName={rest.join(" ")}
              reference={occupant.reference}
            />
          );
        },
      },
      {
        id: "dormitory",
        header: "Dormitory",
        cell: ({ row }) => <span className="text-sm">{row.original.room.name}</span>,
      },
      {
        id: "bed",
        header: "Bed",
        cell: ({ row }) => (
          <NumericCell align="left">{row.original.bed.code}</NumericCell>
        ),
      },
      {
        id: "place",
        // Where in the room, not just which room. Bay 3 upper is a place a
        // warden can walk to; "bed 03U" is a code they have to decode.
        header: "Where",
        cell: ({ row }) => {
          const bed = row.original.bed;
          if (bed.bay === null) {
            return <span className="text-sm text-[color:var(--text-subtle)]">Not on the plan</span>;
          }
          return (
            <span className="text-sm">
              Bay {String(bed.bay).padStart(2, "0")}
              {bed.tier ? (bed.tier === "U" ? " · upper" : " · lower") : ""}
            </span>
          );
        },
      },
      {
        id: "tonight",
        header: "Tonight",
        cell: ({ row }) => {
          const occupant = row.original.bed.occupant;
          if (occupant?.signedOut) return <Badge tone="warn">Signed out</Badge>;
          if (occupant?.sickBay) return <Badge tone="danger">Sick bay</Badge>;
          return <Badge tone="success">In</Badge>;
        },
      },
    ],
    [],
  );

  if (boardQuery.error) {
    const missing = boardQuery.error instanceof ApiError && boardQuery.error.status === 404;
    return (
      <>
        <PageChrome title="House" backHref="/schools/boarding/houses" backLabel="Houses" />
        {missing ? (
          <RecordNotFound
            what="That house"
            backHref="/schools/boarding/houses"
            backLabel="Back to the houses"
          />
        ) : (
          <LoadError
            what="this house"
            error={boardQuery.error}
            onRetry={() => void boardQuery.refetch()}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageChrome
        title={house?.name ?? "House"}
        backHref="/schools/boarding/houses"
        backLabel="Houses"
      >
        <Button asChild variant="secondary">
          <Link href={`/schools/boarding/allocations?hostel=${houseId}`}>Allocate a bed</Link>
        </Button>
      </PageChrome>

      <TableControls
        tabs={
          <PopulationTabs<View>
            value={view}
            onChange={(next) => {
              setView(next);
              setSearch("");
            }}
            tabs={[
              {
                id: "plan",
                label: "Plan",
                count: boardQuery.isPending ? undefined : rooms.length,
              },
              {
                id: "boarders",
                label: "Boarders",
                count: boardQuery.isPending ? undefined : boarders.length,
              },
              {
                id: "tonight",
                label: "Tonight",
                count: boardQuery.isPending ? undefined : inTonight,
              },
            ]}
          />
        }
        search={
          view === "plan" ? undefined : (
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search name or admission number"
            />
          )
        }
        filters={
          view === "plan" ? (
            <FilterSelect
              label="Dormitory"
              allLabel="All dormitories"
              value={dormId ?? ""}
              options={rooms.map((room) => ({ value: room.id, label: room.name }))}
              onChange={(next) => setDormId(next || null)}
            />
          ) : view === "tonight" ? (
            <FilterSelect
              label="Where they are"
              allLabel="Everybody"
              value={tonightFilter}
              options={[
                { value: "in", label: "In the building" },
                { value: "out", label: "Signed out" },
                { value: "sick", label: "Sick bay" },
              ]}
              onChange={setTonightFilter}
            />
          ) : undefined
        }
        count={
          boardQuery.isPending
            ? null
            : view === "plan"
              ? // The count on the plan is beds, because the plan is beds. It
                // says what the house has and what is free tonight — out of
                // service is subtracted, never counted as space.
                planSentence(houseStats)
              : view === "boarders"
                ? `${shownBoarders.length} of ${boarders.length}`
                : `${tonight.length} of ${boarders.length}`
        }
      />

      {view === "plan" ? (
        boardQuery.isPending ? (
          <div className="flex flex-col gap-3">
            <DormitoryPlanSkeleton size="mini" />
            <DormitoryPlanSkeleton size="mini" />
          </div>
        ) : rooms.length === 0 ? (
          <NothingYet
            title="This house has no dormitories yet"
            body="A dormitory and its beds are what the plan is drawn from. Add one and the room appears here as its two wall runs."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/boarding/hostels">Add a dormitory</Link>
              </Button>
            }
          />
        ) : chosenRoom ? (
          // One dormitory, full size: initials, bay numbers and tier letters.
          <div className="flex flex-col gap-3">
            <PlanHeading room={chosenRoom} />
            <DormitoryPlan room={chosenRoom} size="full" />
            <DormitoryPlanLegend size="full" />
          </div>
        ) : (
          // All of them, the same drawing at 18px with the text removed. Not a
          // summary of the plan — every bed is still a bed, in its real place,
          // so you can see which end of which room is empty.
          <div className="flex flex-col gap-4">
            {rooms.map((room) => (
              <div key={room.id} className="flex flex-col gap-1.5">
                <PlanHeading room={room} compact />
                <DormitoryPlan room={room} size="mini" onOpen={() => setDormId(room.id)} />
              </div>
            ))}
            <DormitoryPlanLegend size="mini" />
          </div>
        )
      ) : null}

      {view === "boarders" || view === "tonight" ? (
        boardQuery.isPending ? (
          <TableRowsSkeleton
            label={view === "tonight" ? "Loading tonight's roll" : "Loading the boarders"}
            headers={["Pupil", "Dormitory", "Bed", "Where", "Tonight"]}
            columns={[
              { avatar: true, twoLine: true },
              { width: 150 },
              { width: 90 },
              { width: 150 },
              { width: 110, badge: true },
            ]}
          />
        ) : (
          // One table, not two. Boarders and Tonight are two populations of the
          // same house in the same shape — a second `DataTable` behind a tab
          // would be a second copy of one thing, and the tab is exactly the
          // control that says which population is on screen.
          <DataTable
            data={view === "tonight" ? tonight : shownBoarders}
            columns={boarderColumns}
            pagination={{ enabled: true }}
            emptyState={
              boarders.length === 0 ? (
                <NothingYet
                  title={
                    view === "tonight"
                      ? "Nobody sleeps in this house yet"
                      : "Nobody is in a bed in this house"
                  }
                  body={
                    view === "tonight"
                      ? "Tonight's roll is the boarders who have a bed here, less anybody the gate book or the sick bay says is away."
                      : "Give a pupil one of the free beds on the plan and they appear here."
                  }
                />
              ) : (
                <NothingMatched
                  what="boarders"
                  filters={
                    view === "tonight" && tonightFilter
                      ? [
                          tonightFilter === "in"
                            ? "In the building"
                            : tonightFilter === "out"
                              ? "Signed out"
                              : "Sick bay",
                        ]
                      : []
                  }
                  search={search}
                  onClear={() => {
                    setTonightFilter("");
                    setSearch("");
                  }}
                />
              )
            }
          />
        )
      ) : null}

      {house && !boardQuery.isPending ? (
        <p className="text-xs text-[color:var(--text-muted)]">
          {house.code} · {genderPolicyLabel(house.genderPolicy)} ·{" "}
          {rooms.length === 1 ? "1 dormitory" : `${rooms.length} dormitories`}
          {board && board.unbedded.length > 0
            ? ` · ${board.unbedded.length} ${
                board.unbedded.length === 1 ? "boarder has" : "boarders have"
              } no bed`
            : ""}
        </p>
      ) : null}
    </>
  );
}

/** A dormitory's line: what it is, how full, and what is wrong with it. */
function PlanHeading({ room, compact }: { room: PlanRoom; compact?: boolean }) {
  const stats = roomStats(room);
  const free = room.beds.filter((bed) => isBedFree(bed)).length;
  const out = room.beds.filter((bed) => isBedOutOfService(bed)).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          compact
            ? "text-[13px] font-semibold text-[color:var(--text-strong)]"
            : "text-base font-semibold text-[color:var(--text-strong)]"
        }
      >
        {room.name}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-[color:var(--text-muted)]">
        {stats.taken}/{stats.usable}
      </span>
      {free > 0 ? (
        <Badge tone="success">{free} free</Badge>
      ) : (
        <Badge tone="neutral">Full</Badge>
      )}
      {out > 0 ? <Badge tone="warn">{out} out of service</Badge> : null}
      {room.isPrefectDorm ? <Badge tone="info">Prefects</Badge> : null}
      {room.floor ? (
        <span className="text-xs text-[color:var(--text-subtle)]">{room.floor}</span>
      ) : null}
    </div>
  );
}
