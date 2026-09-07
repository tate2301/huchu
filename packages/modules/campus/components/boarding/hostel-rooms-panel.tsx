"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { useOpenTransition } from "../common/use-open-transition";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "../common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

import { fetchHostelRooms, type HostelRoom } from "./boarding-data";

/**
 * The rooms and beds a house is made of.
 *
 * The hostel record page could list rooms and never add one, and the bed board
 * is built from beds — so a warden who put up a partition wall had to have the
 * whole house recreated by somebody with database access. Beds are created with
 * their room and added to it afterwards, because a bunk goes in mid-term more
 * often than a room does.
 *
 * Nothing here deletes something a child has slept in. A room or a bed with
 * allocations behind it is taken out of use, which keeps the history that
 * answers "where was she in Term 1".
 */

type RoomDraft = {
  code: string;
  floor: string;
  capacity: string;
  bedCodes: string;
  isActive: string;
};

const EMPTY_ROOM: RoomDraft = {
  code: "",
  floor: "",
  capacity: "",
  bedCodes: "",
  isActive: "true",
};

/** "B1, B2, B3" or "B1 B2 B3" — a warden types whichever comes first. */
function splitCodes(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter(Boolean);
}

export function HostelRoomsPanel({ hostelId }: { hostelId: string }) {
  const queryClient = useQueryClient();
  const [floorFilter, setFloorFilter] = useState("");
  const [useFilter, setUseFilter] = useState("");
  const [editingRoom, setEditingRoom] = useState<HostelRoom | null>(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingBedsTo, setAddingBedsTo] = useState<HostelRoom | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const roomsQuery = useQuery({
    queryKey: ["schools", "boarding", "rooms", hostelId],
    queryFn: () => fetchHostelRooms(hostelId),
  });

  const rooms = roomsQuery.data ?? [];
  const floors = [
    ...new Set(rooms.map((room) => room.floor).filter((floor): floor is string => Boolean(floor))),
  ];

  const visible = rooms.filter((room) => {
    if (floorFilter && room.floor !== floorFilter) return false;
    if (useFilter === "open" && !room.isActive) return false;
    if (useFilter === "closed" && room.isActive) return false;
    return true;
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
    void queryClient.invalidateQueries({ queryKey: ["records"] });
  };

  const roomAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/hostels/${hostelId}/rooms/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const bedAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/hostels/${hostelId}/beds/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar>
          <FilterSelect
            label="Floor"
            allLabel="Every floor"
            value={floorFilter}
            options={floors.map((floor) => ({ value: floor, label: `Floor ${floor}` }))}
            onChange={setFloorFilter}
          />
          <FilterSelect
            label="In use"
            allLabel="Every room"
            value={useFilter}
            options={[
              { value: "open", label: "Open rooms" },
              { value: "closed", label: "Closed rooms" },
            ]}
            onChange={setUseFilter}
          />
        </FilterBar>
        <CreateButton
          resource="schools.boarding"
          label="Add a room"
          onSelect={() => setAddingRoom(true)}
        />
      </div>

      {roomsQuery.error ? (
        <LoadError
          what="this hostel's rooms"
          error={roomsQuery.error}
          onRetry={() => void roomsQuery.refetch()}
        />
      ) : null}
      {roomAction.error ? <SaveError what="That room" error={roomAction.error} /> : null}
      {bedAction.error ? <SaveError what="That bed" error={bedAction.error} /> : null}

      {roomsQuery.isLoading ? (
        <TableRowsSkeleton columns={[{ twoLine: true }, { width: 90 }, { width: 200 }]} rows={5} />
      ) : visible.length === 0 ? (
        rooms.length === 0 ? (
          <NothingYet
            title="No rooms have been set up in this hostel"
            body="A room holds the beds, and a bed is what a child is allocated to. Add the first one and the bed board fills itself."
          />
        ) : (
          <NothingMatched
            what="rooms"
            filters={[floorFilter ? `Floor ${floorFilter}` : "", useFilter === "open" ? "Open rooms" : useFilter === "closed" ? "Closed rooms" : ""].filter(Boolean)}
            onClear={() => {
              setFloorFilter("");
              setUseFilter("");
            }}
          />
        )
      ) : (
        // Plain markup rather than `MobileList`: its subtitle slot is a `<p>`,
        // and `RecordActions` is a `<div>` — a row of verbs inside a paragraph
        // is markup no browser is obliged to keep in one piece.
        <ul className="space-y-3">
          {visible.map((room) => (
            <li
              key={room.id}
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                <span className="font-medium text-[color:var(--text-strong)]">
                  {room.code}
                </span>
                <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                  {room.floor ? `Floor ${room.floor} · ` : ""}
                  {room.beds.length} bed{room.beds.length === 1 ? "" : "s"} ·{" "}
                  {room._count.allocations > 0 ? `${room._count.allocations} in` : "Empty"}
                </span>
                {room.isActive ? null : <Badge tone="neutral">Closed</Badge>}
                <span className="ml-auto">
                  <RecordActions resource="schools.boarding" verbs={roomVerbs(room)} />
                </span>
              </div>

              {room.beds.length === 0 ? (
                <p className="px-3 py-3 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                  A room with no beds is a room nobody can be allocated to.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)]">
                  {room.beds.map((bed) => (
                    <li
                      key={bed.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)]">
                        Bed {bed.code}
                      </span>
                      <Badge
                        tone={
                          bed.status === "OCCUPIED"
                            ? "brand"
                            : bed.isActive
                              ? "success"
                              : "neutral"
                        }
                      >
                        {bed.status === "OCCUPIED"
                          ? "Taken"
                          : bed.isActive
                            ? "Free"
                            : "Out of use"}
                      </Badge>
                      <span className="ml-auto">
                        <RecordActions
                          resource="schools.boarding"
                          verbs={[
                            {
                              label: bed.isActive ? "Take out of use" : "Put back in use",
                              action: "edit",
                              tone: bed.isActive ? "warning" : "default",
                              loading: pendingId === bed.id,
                              onSelect: () => {
                                setPendingId(bed.id);
                                bedAction.mutate({
                                  id: bed.id,
                                  body: {
                                    isActive: !bed.isActive,
                                    status: bed.isActive ? "OUT_OF_SERVICE" : "AVAILABLE",
                                  },
                                });
                              },
                            },
                            {
                              label: "Delete",
                              action: "archive",
                              tone: "danger",
                              loading: pendingId === bed.id,
                              confirm: {
                                title: `Delete bed ${bed.code}`,
                                description:
                                  "The bed goes off the board for good. Only a bed nobody has ever been allocated to can be deleted.",
                                confirmLabel: "Delete it",
                              },
                              onSelect: () => {
                                setPendingId(bed.id);
                                bedAction.mutate({ id: bed.id, remove: true });
                              },
                            },
                          ]}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <RoomDialog
        open={addingRoom || editingRoom !== null}
        hostelId={hostelId}
        room={editingRoom}
        onClose={() => {
          setAddingRoom(false);
          setEditingRoom(null);
        }}
      />
      <AddBedsDialog
        open={addingBedsTo !== null}
        hostelId={hostelId}
        room={addingBedsTo}
        onClose={() => setAddingBedsTo(null)}
      />
    </div>
  );

  function roomVerbs(room: HostelRoom): RecordVerb[] {
    return [
      { label: "Edit", action: "edit", onSelect: () => setEditingRoom(room) },
      { label: "Add beds", action: "create", onSelect: () => setAddingBedsTo(room) },
      {
        label: room.isActive ? "Close" : "Reopen",
        action: "edit",
        tone: room.isActive ? "warning" : "default",
        loading: pendingId === room.id,
        onSelect: () => {
          setPendingId(room.id);
          roomAction.mutate({ id: room.id, body: { isActive: !room.isActive } });
        },
      },
      {
        label: "Delete",
        action: "archive",
        tone: "danger",
        loading: pendingId === room.id,
        unavailable:
          room._count.allocations > 0
            ? "Children have slept in this room. Close it instead."
            : undefined,
        confirm: {
          title: `Delete room ${room.code}`,
          description:
            "The room and its beds go for good. Only a room nobody has ever been allocated to can be deleted.",
          confirmLabel: "Delete it",
        },
        onSelect: () => {
          setPendingId(room.id);
          roomAction.mutate({ id: room.id, remove: true });
        },
      },
    ];
  }
}

function RoomDialog({
  open,
  hostelId,
  room,
  onClose,
}: {
  open: boolean;
  hostelId: string;
  room: HostelRoom | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RoomDraft>(EMPTY_ROOM);
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setDraft(
      room
        ? {
            code: room.code,
            floor: room.floor ?? "",
            capacity: room.capacity != null ? String(room.capacity) : "",
            bedCodes: "",
            isActive: String(room.isActive),
          }
        : EMPTY_ROOM,
    );
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: draft.code.trim(),
        floor: draft.floor.trim() || null,
        capacity: draft.capacity.trim() ? Number(draft.capacity.trim()) : null,
        isActive: draft.isActive === "true",
      };
      return room
        ? fetchJson(`/api/v2/schools/boarding/hostels/${hostelId}/rooms/${room.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson(`/api/v2/schools/boarding/hostels/${hostelId}/rooms`, {
            method: "POST",
            body: JSON.stringify({ ...body, bedCodes: splitCodes(draft.bedCodes) }),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={room ? `Room ${room.code}` : "Add a room"}
      description="Where it is in the house, and the beds in it."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {room ? "Save the room" : "Add the room"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="room-code">Room</Label>
          <Input
            id="room-code"
            required
            value={draft.code}
            placeholder="R12"
            onChange={(event) =>
              setDraft((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-floor">Floor</Label>
          <Input
            id="room-floor"
            value={draft.floor}
            placeholder="1"
            onChange={(event) =>
              setDraft((current) => ({ ...current, floor: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-capacity">Intended capacity</Label>
          <Input
            id="room-capacity"
            type="number"
            min={0}
            value={draft.capacity}
            onChange={(event) =>
              setDraft((current) => ({ ...current, capacity: event.target.value }))
            }
          />
        </div>
        <FilterSelect
          label="In use"
          allLabel="In use"
          className="space-y-2"
          value={draft.isActive === "true" ? "" : "false"}
          options={[{ value: "false", label: "Closed" }]}
          onChange={(value) =>
            setDraft((current) => ({ ...current, isActive: value ? "false" : "true" }))
          }
        />
        {room ? null : (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="room-beds">Beds</Label>
            <Input
              id="room-beds"
              value={draft.bedCodes}
              placeholder="B1, B2, B3, B4"
              onChange={(event) =>
                setDraft((current) => ({ ...current, bedCodes: event.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              One code per bed, separated by commas. Beds can be added later too.
            </p>
          </div>
        )}
      </div>
    </RecordDialog>
  );
}

function AddBedsDialog({
  open,
  hostelId,
  room,
  onClose,
}: {
  open: boolean;
  hostelId: string;
  room: HostelRoom | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setCodes("");
    setError(null);
  });

  const save = useMutation({
    mutationFn: () => {
      if (!room) throw new Error("No room chosen");
      return fetchJson(`/api/v2/schools/boarding/hostels/${hostelId}/beds`, {
        method: "POST",
        body: JSON.stringify({ roomId: room.id, codes: splitCodes(codes) }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={room ? `Add beds to room ${room.code}` : "Add beds"}
      description="One code per bed. A bunk is two."
      size="sm"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && splitCodes(codes).length > 0) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={splitCodes(codes).length === 0}
          >
            Add the beds
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="bed-codes">Beds</Label>
        <Input
          id="bed-codes"
          value={codes}
          placeholder="B5, B6"
          onChange={(event) => setCodes(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {splitCodes(codes).length} bed{splitCodes(codes).length === 1 ? "" : "s"} will be
          added.
        </p>
      </div>
    </RecordDialog>
  );
}
