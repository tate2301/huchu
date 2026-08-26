"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import { fetchJson } from "@/lib/api-client";

import {
  fetchHostelOccupancy,
  fetchHostelRooms,
  fetchHostels,
  genderPolicyLabel,
  type BoardingHostel,
  type HostelRoom,
} from "./boarding-data";
import { HostelDialog } from "./boarding-dialogs";
import { BedBoardContent } from "./bed-board-content";
import { HostelRoomsPanel } from "./hostel-rooms-panel";

/**
 * A boarding house, and everything it is made of.
 *
 * The house is the unit a warden thinks in — "is there space in Chishawasha" is
 * a question about one building, not about the school — so the house is chosen
 * once at the top and the whole screen is about it. That is why the app bar
 * carries the house's own name rather than the word "Hostels": the rail one
 * column to the left already says which section this is, and the caption under
 * the title is the only place left that could say which house.
 *
 * Three cards, in the canvas's order:
 *
 *  - **Rooms** — `13 rooms · 100 beds`, then R10, R11, R12, R13, R14 each with
 *    its floor and how many are in it, and the verbs that add, close and delete
 *    one.
 *  - **Properties** — Name, Code, Takes, Intended capacity, In use. Editable,
 *    because a house that can be created and never corrected is a house
 *    somebody has to have fixed by hand.
 *  - **The bed board that already exists** — this is the canvas's own note about
 *    `bed-board-content.tsx — built, and rendered by no route`. It was written,
 *    reviewed and then reachable only from the hostel record's Beds tab, which
 *    is a page you get to by knowing it is there. It is a tab of this screen
 *    now, so the house and its beds are one destination.
 *
 * Beds free is counted from the beds that exist, not from the capacity somebody
 * typed. `capacity` is an intention; a warden with a new boarder standing in
 * front of them needs the number of actual empty beds, and so does the
 * allocation rule that will refuse them. A house whose boarders outnumber its
 * beds says so — `4 boarders have no bed`, with their names — because an
 * allocation to a house with no bed behind it is invisible on any other screen.
 */
export function BoardingHostelsContent({
  /** From `?hostel=`, so a link from an allocation lands on the right house. */
  initialHostelId,
}: {
  initialHostelId?: string;
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState(initialHostelId ?? "");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"rooms" | "beds">("rooms");
  const [editing, setEditing] = useState<BoardingHostel | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const hostelsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels"],
    queryFn: fetchHostels,
  });

  const hostels = useMemo(() => hostelsQuery.data ?? [], [hostelsQuery.data]);

  // The first open house is the default rather than an empty screen asking a
  // warden to choose before it will show them anything.
  const hostelId = chosen || hostels.find((hostel) => hostel.isActive)?.id || hostels[0]?.id || "";
  const hostel = hostels.find((row) => row.id === hostelId) ?? null;

  const roomsQuery = useQuery({
    queryKey: ["schools", "boarding", "rooms", hostelId],
    queryFn: () => fetchHostelRooms(hostelId),
    enabled: Boolean(hostelId),
  });

  const occupancyQuery = useQuery({
    queryKey: ["schools", "boarding", "board", hostelId],
    queryFn: () => fetchHostelOccupancy(hostelId),
    enabled: Boolean(hostelId),
  });

  const hostelAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/hostels/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: (_result, input) => {
      if (input.remove && input.id === hostelId) setChosen("");
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
    },
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const occupancy = occupancyQuery.data ?? null;

  const visibleRooms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rooms;
    return rooms.filter((room) =>
      `${room.code} ${room.floor ?? ""}`.toLowerCase().includes(needle),
    );
  }, [rooms, search]);

  const beds = occupancy?.beds ?? [];
  const boarders = beds.filter((bed) => bed.student).length;
  const bedsFree = Math.max(0, beds.length - boarders);
  const unbedded = occupancy?.unbedded ?? [];

  const hostelVerbs: RecordVerb[] = hostel
    ? [
        { label: "Edit", action: "edit", onSelect: () => setEditing(hostel) },
        {
          label: hostel.isActive ? "Close" : "Reopen",
          action: "edit",
          tone: hostel.isActive ? "warning" : "default",
          loading: pendingId === hostel.id,
          ...(hostel.isActive
            ? {
                confirm: {
                  title: `Close ${hostel.name}`,
                  description:
                    "The house stops being offered when a bed is allocated. Everyone already in it stays where they are.",
                  confirmLabel: "Close it",
                },
              }
            : {}),
          onSelect: () => {
            setPendingId(hostel.id);
            hostelAction.mutate({ id: hostel.id, body: { isActive: !hostel.isActive } });
          },
        },
        {
          label: "Delete",
          action: "archive",
          tone: "danger",
          loading: pendingId === hostel.id,
          unavailable:
            hostel._count.allocations > 0
              ? "Children have boarded here. Close it instead."
              : undefined,
          confirm: {
            title: `Delete ${hostel.name}`,
            description:
              "The house, its rooms and its beds go for good. Only a house nobody has ever boarded in can be deleted.",
            confirmLabel: "Delete it",
          },
          onSelect: () => {
            setPendingId(hostel.id);
            hostelAction.mutate({ id: hostel.id, remove: true });
          },
        },
      ]
    : [];

  return (
    <>
      <PageChrome title={hostel?.name ?? "Hostels"}>
        <CreateButton
          resource="schools.boarding"
          label="Add a hostel"
          onSelect={() => setAdding(true)}
        />
      </PageChrome>

      <PageBand
        chips={[
          { label: "Hostels", value: hostels.length },
          { label: "Boarders", value: boarders, tone: "brand" },
          { label: "Beds free", value: bedsFree, tone: bedsFree > 0 ? "success" : "warn" },
          {
            label: "No bed",
            value: unbedded.length,
            tone: unbedded.length > 0 ? "danger" : "neutral",
          },
        ]}
      />

      {hostelsQuery.error ? (
        <LoadError
          what="the boarding houses"
          error={hostelsQuery.error}
          onRetry={() => void hostelsQuery.refetch()}
        />
      ) : null}
      {occupancyQuery.error ? (
        <LoadError
          what="the bed board"
          error={occupancyQuery.error}
          onRetry={() => void occupancyQuery.refetch()}
        />
      ) : null}
      {hostelAction.error ? <SaveError what="That hostel" error={hostelAction.error} /> : null}

      {hostelsQuery.isLoading ? (
        <StatsSkeleton count={3} />
      ) : hostels.length === 0 ? (
        <NothingYet
          title="No boarding houses yet"
          body="A hostel holds the rooms, the rooms hold the beds, and the beds are what a child is allocated to."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Boarders" value={boarders} />
            <StatCard
              label="Beds free"
              value={bedsFree}
              tone={bedsFree > 0 ? "success" : "warn"}
            />
            <StatCard label="Rooms" value={rooms.length} />
          </div>

          {unbedded.length > 0 ? (
            <Alert
              tone="warn"
              title={`${unbedded.length} boarder${unbedded.length === 1 ? " has" : "s have"} no bed`}
            >
              {unbedded.map((row) => `${row.lastName}, ${row.firstName}`).join(" · ")} —
              allocated to the house but not to a bed.
            </Alert>
          ) : null}

          <TableControls
            tabs={
              <div className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-1">
                {(
                  [
                    { id: "rooms" as const, label: "Rooms", count: rooms.length },
                    { id: "beds" as const, label: "Beds", count: beds.length },
                  ]
                ).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setView(entry.id)}
                    className={
                      entry.id === view
                        ? "rounded-[var(--radius-sm)] bg-[color:var(--surface)] px-3 py-1 text-sm font-semibold shadow-[var(--shadow-xs)]"
                        : "rounded-[var(--radius-sm)] px-3 py-1 text-sm text-muted-foreground"
                    }
                  >
                    {entry.label} {entry.count}
                  </button>
                ))}
              </div>
            }
            search={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search rooms"
              />
            }
            filters={
              <FilterSelect
                label="Hostel"
                allLabel={hostel?.name ?? "Choose a house"}
                value={chosen}
                options={hostels.map((row) => ({
                  value: row.id,
                  label: row.isActive ? row.name : `${row.name} · closed`,
                }))}
                onChange={setChosen}
              />
            }
            actions={<RecordActions resource="schools.boarding" verbs={hostelVerbs} />}
          />

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <Card
                flush
                title="Rooms"
                subtitle={`${rooms.length} room${rooms.length === 1 ? "" : "s"} · ${beds.length} bed${beds.length === 1 ? "" : "s"}`}
                className={view === "rooms" ? undefined : "hidden"}
              >
                {roomsQuery.isLoading ? (
                  <TableRowsSkeleton
                    rows={5}
                    columns={[{ twoLine: true }, { width: 90 }, { width: 200 }]}
                  />
                ) : (
                  <div className="px-3 py-3">
                    <RoomSummary rooms={visibleRooms} />
                    <HostelRoomsPanel hostelId={hostelId} />
                  </div>
                )}
              </Card>

              <Card
                flush
                title="The bed board"
                subtitle="every bed, free ones included"
                className={view === "beds" ? undefined : "hidden"}
              >
                <div className="px-3 py-3">
                  <BedBoardContent hostelId={hostelId} />
                </div>
              </Card>
            </div>

            <Card title="Properties">
              <dl className="space-y-2 text-[length:var(--type-body-sm)]">
                <Property label="Name" value={hostel?.name ?? "—"} />
                <Property label="Code" value={hostel?.code ?? "—"} mono />
                <Property
                  label="Takes"
                  value={hostel ? genderPolicyLabel(hostel.genderPolicy) : "—"}
                />
                <Property
                  label="Intended capacity"
                  value={hostel?.capacity != null ? String(hostel.capacity) : "—"}
                  mono
                />
                <Property
                  label="In use"
                  value={
                    <Badge tone={hostel?.isActive ? "success" : "neutral"}>
                      {hostel?.isActive ? "In use" : "Closed"}
                    </Badge>
                  }
                />
              </dl>
              <p className="mt-3 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                Intended capacity is what the house is meant to hold. The beds are what it
                actually holds, and that is what a boarder is allocated against.
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!hostel}
                  onClick={() => hostel && setEditing(hostel)}
                >
                  Correct these
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      <HostelDialog
        open={adding || editing !== null}
        hostel={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}

/**
 * The rooms at a glance — `R10 · Floor 1 · 8 beds · 8 in`, `R14 · Floor 2 ·
 * 8 beds · Empty`.
 *
 * A warden looking for space reads the occupancy, not the room list, so how
 * many are in comes last and an empty room says "Empty" rather than "0 in":
 * zero is a number you have to convert, and empty is the answer.
 */
function RoomSummary({ rooms }: { rooms: HostelRoom[] }) {
  if (rooms.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-2">
      {rooms.map((room) => (
        <li
          key={room.id}
          className="flex items-baseline gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1.5"
        >
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold">
            {room.code}
          </span>
          <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            {room.floor ? `Floor ${room.floor} · ` : ""}
            {room.beds.length} bed{room.beds.length === 1 ? "" : "s"}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums">
            {room._count.allocations > 0 ? `${room._count.allocations} in` : "Empty"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Property({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[color:var(--text-muted)]">{label}</dt>
      <dd
        className={
          mono
            ? "font-[family-name:var(--font-mono)] font-medium tabular-nums text-[color:var(--text-strong)]"
            : "font-medium text-[color:var(--text-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
