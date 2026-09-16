"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { RecordNameCell } from "@/components/schools/common/identity-cell";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";

import {
  fetchHostelOccupancy,
  fetchHostels,
  genderPolicyLabel,
  type BoardingHostel,
  type HostelOccupancy,
} from "@/components/schools/boarding/boarding-data";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";
import {
  planStats,
  roomsFromBeds,
  type OccupancyBed,
} from "@/components/schools/boarding/dormitory-plan";

/**
 * The houses.
 *
 * **You go to a house first.** A boarding school is not one estate with beds in
 * it — it is four or five houses, each with a warden who runs it, its own roll
 * and its own problems. Nobody does boarding work "across the school"; they do
 * it in Nyanga, then in Inyanga. So this is the landing page, and the plan, the
 * boarders and tonight are all reached through one house.
 *
 * **A house is a row.** Occupancy, free, out tonight — the three numbers a
 * warden is holding when they pick one, and the middle one is the reason they
 * opened the screen. Free is counted from beds that exist and work, never from
 * the `capacity` somebody typed: capacity is an intention, and an intention
 * cannot take a boarder tonight. Out of service is subtracted rather than
 * quietly counted as free, because a broken bed that merely looks empty is the
 * one a child gets assigned to.
 *
 * One table, no card, no band of totals — §1, §2 and §5 of the canvas law. The
 * row count on the filter row is the only number above the table, and it is not
 * state: it is the answer to whatever the filters just asked.
 */

type HouseRow = {
  hostel: BoardingHostel;
  /** Null while its beds are still being counted. */
  board: HostelOccupancy | null;
  beds: number;
  taken: number;
  free: number;
  outOfService: number;
  /** Beds that exist and work — the denominator "of" means. */
  usable: number;
  /** Boarders in this house with no bed at all. */
  unbedded: number;
};

/** The bar: taken, free, out of service, in the proportions they really are. */
function OccupancyBar({ row }: { row: HouseRow }) {
  const total = Math.max(1, row.beds);
  const width = (count: number) => `${((count / total) * 100).toFixed(1)}%`;
  return (
    <span
      className="flex h-2 min-w-[90px] gap-px overflow-hidden rounded-full bg-[color:var(--surface-sunken)]"
      title={`${row.taken} taken, ${row.free} free${
        row.outOfService ? `, ${row.outOfService} out of service` : ""
      }`}
    >
      <i className="block h-full bg-[color:var(--brand)]" style={{ width: width(row.taken) }} />
      <i
        className="block h-full bg-[color:var(--tone-success)]"
        style={{ width: width(row.free) }}
      />
      <i
        className="block h-full bg-[color:var(--border-strong)]"
        style={{ width: width(row.outOfService) }}
      />
    </span>
  );
}

export function BoardingHousesContent() {
  const [policy, setPolicy] = useState("");
  const [space, setSpace] = useState("");
  const [search, setSearch] = useState("");

  const hostelsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels"],
    queryFn: fetchHostels,
  });

  const hostels = useMemo(() => hostelsQuery.data ?? [], [hostelsQuery.data]);

  // One occupancy read per house. The endpoint answers for a house because a
  // bed belongs to a room and a room belongs to a house; the landing page is
  // those answers laid end to end rather than a second endpoint returning the
  // same beds in a different shape.
  const boards = useQueries({
    queries: hostels.map((hostel) => ({
      queryKey: ["schools", "boarding", "board", hostel.id],
      queryFn: () => fetchHostelOccupancy(hostel.id),
    })),
  });

  const boardByHostel = new Map<string, HostelOccupancy>();
  for (const board of boards) {
    if (board.data) boardByHostel.set(board.data.hostel.id, board.data);
  }

  /*
   * Counted plainly rather than memoised, the way the bed board does it. The
   * occupancy answers are already cached by the query client, so this runs
   * over a few hundred beds on a render that was going to happen anyway — and
   * a memo keyed on an array `useQueries` rebuilds every render is a memo that
   * never hits.
   *
   * The counting itself goes through `roomsFromBeds` + `planStats`, which is
   * what the plan draws from. One definition of "free" for the landing page
   * and the drawing, so a house that says 6 free here cannot show 7 dashed
   * beds one click later.
   */
  const rows: HouseRow[] = hostels.map((hostel) => {
    const board = boardByHostel.get(hostel.id) ?? null;
    const beds = roomsFromBeds((board?.beds ?? []) as OccupancyBed[]).flatMap(
      (room) => room.beds,
    );
    const stats = planStats(beds);
    return {
      hostel,
      board,
      beds: stats.total,
      taken: stats.taken,
      free: stats.free,
      outOfService: stats.outOfService,
      usable: stats.usable,
      unbedded: board?.unbedded.length ?? 0,
    };
  });

  const needle = search.trim().toLowerCase();
  const shown = rows.filter((row) => {
    if (policy && row.hostel.genderPolicy !== policy) return false;
    if (space === "free" && row.free === 0) return false;
    if (space === "full" && row.free > 0) return false;
    if (!needle) return true;
    return `${row.hostel.name} ${row.hostel.code}`.toLowerCase().includes(needle);
  });

  const columns = useMemo<ColumnDef<HouseRow>[]>(
    () => [
      {
        id: "house",
        header: "House",
        cell: ({ row }) => (
          <RecordNameCell
            kind="hostel"
            href={`/schools/boarding/houses/${row.original.hostel.id}`}
            name={row.original.hostel.name}
            reference={row.original.hostel.code}
            context={row.original.hostel.isActive ? undefined : "Closed"}
          />
        ),
      },
      {
        id: "who",
        header: "Who sleeps here",
        cell: ({ row }) => (
          <span className="text-sm">{genderPolicyLabel(row.original.hostel.genderPolicy)}</span>
        ),
      },
      {
        id: "dormitories",
        header: "Dormitories",
        cell: ({ row }) => (
          <NumericCell align="left">{row.original.hostel._count.rooms}</NumericCell>
        ),
      },
      {
        id: "occupancy",
        header: "Occupancy",
        cell: ({ row }) => {
          const house = row.original;
          if (!house.board) {
            return <span className="text-sm text-[color:var(--text-subtle)]">Counting…</span>;
          }
          return (
            <div className="min-w-[140px]">
              <OccupancyBar row={house} />
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {house.taken} of {house.usable} taken
              </div>
            </div>
          );
        },
      },
      {
        id: "beds",
        header: "Beds",
        cell: ({ row }) => <NumericCell>{row.original.beds}</NumericCell>,
      },
      {
        id: "free",
        // The number the page exists for. Coloured, because a house with
        // nowhere to put anybody is a different fact from one with eleven
        // beds standing empty, and a warden reads down this column first.
        header: "Free",
        cell: ({ row }) => (
          <NumericCell
            className={
              row.original.free > 0
                ? "font-semibold text-[color:var(--tone-success)]"
                : "text-[color:var(--tone-danger)]"
            }
          >
            {row.original.board ? row.original.free : "—"}
          </NumericCell>
        ),
      },
      {
        id: "outOfService",
        header: "Out of service",
        cell: ({ row }) =>
          row.original.outOfService > 0 ? (
            <Badge tone="warn">{row.original.outOfService}</Badge>
          ) : (
            <NumericCell>—</NumericCell>
          ),
      },
      {
        id: "noBed",
        // A boarder allocated to the house with no bed chosen is a real state
        // and is invisible on every other screen. It belongs beside the free
        // count, because the two together are one decision.
        header: "No bed",
        cell: ({ row }) =>
          row.original.unbedded > 0 ? (
            <Badge tone="danger">{row.original.unbedded}</Badge>
          ) : (
            <NumericCell>—</NumericCell>
          ),
      },
      {
        id: "open",
        header: () => <span className="sr-only">Open the house</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/schools/boarding/houses/${row.original.hostel.id}`}>Open</Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const filterNames = [
    policy ? genderPolicyLabel(policy) : null,
    space === "free" ? "Has a free bed" : space === "full" ? "Full" : null,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setPolicy("");
    setSpace("");
    setSearch("");
  };

  const counting = boards.some((board) => board.isPending);
  const bedsAcrossSchool = rows.reduce((sum, row) => sum + row.beds, 0);

  return (
    <>
      <PageChrome title="Houses" />

      {hostelsQuery.error ? (
        <LoadError
          what="the houses"
          error={hostelsQuery.error}
          onRetry={() => void hostelsQuery.refetch()}
        />
      ) : null}

      <TableControls
        tabs={<BoardingViews hostels={hostels.length} beds={counting ? undefined : bedsAcrossSchool} />}
        search={
          <TableSearch value={search} onChange={setSearch} placeholder="Search house or code" />
        }
        filters={
          <>
            <FilterSelect
              label="Who sleeps here"
              allLabel="Any house"
              value={policy}
              options={[
                { value: "MALE", label: "Boys" },
                { value: "FEMALE", label: "Girls" },
                { value: "MIXED", label: "Mixed" },
              ]}
              onChange={setPolicy}
            />
            <FilterSelect
              label="Space"
              allLabel="Full or not"
              value={space}
              options={[
                { value: "free", label: "Has a free bed" },
                { value: "full", label: "Full" },
              ]}
              onChange={setSpace}
            />
          </>
        }
        filterCount={filterNames.length}
        count={hostelsQuery.isPending ? null : `${shown.length} of ${rows.length}`}
      />

      {hostelsQuery.isPending ? (
        <TableRowsSkeleton
          label="Loading the houses"
          headers={[
            "House",
            "Who sleeps here",
            "Dormitories",
            "Occupancy",
            "Beds",
            "Free",
            "Out of service",
            "No bed",
            "",
          ]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 110 },
            { width: 90, align: "right" },
            { width: 150 },
            { width: 70, align: "right" },
            { width: 70, align: "right" },
            { width: 110, badge: true },
            { width: 80, badge: true },
            { width: 70 },
          ]}
          rows={5}
        />
      ) : (
        <DataTable
          data={shown}
          columns={columns}
          emptyState={
            rows.length === 0 ? (
              <NothingYet
                title="There are no boarding houses yet"
                body="A house, its dormitories and its beds come first. Everything else in boarding — the plan, the roll, the gate book — is built from beds outward."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/schools/boarding/hostels">Add a house</Link>
                  </Button>
                }
              />
            ) : (
              <NothingMatched
                what="houses"
                filters={filterNames}
                search={search}
                onClear={clearFilters}
              />
            )
          }
        />
      )}
    </>
  );
}
