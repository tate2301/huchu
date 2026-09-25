"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ManagementShell } from "@/components/settings/management-shell";
import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordActions } from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { PeriodFormDialog, type PeriodFormValues } from "@/components/schools/academics/period-form-dialog";
import { RoomFormDialog, type RoomFormValues } from "@/components/schools/academics/room-form-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsPeriods,
  fetchSchoolsRooms,
  fetchSchoolsTerms,
  setSchoolsPeriodActive,
  type SchoolsPeriodRecord,
  type SchoolsRoomRecord,
} from "@/lib/schools/admin-v2";
import { formatMinute, parseMinute } from "@/lib/schools/timetable-format";
import { Archive, Clock, ListBullets, Plus, RotateCcw, SlidersHorizontal } from "@/lib/icons";

import {
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  RecordEmpty,
} from "../classes/record-fields";

/**
 * The school day, as `SchoolDay.dc.html` draws it: the periods down the left,
 * the period open on the right, and the rooms a lesson can run in under it.
 *
 * What changed is the shape, not the wiring. The three queries, the four
 * mutations, their URLs, bodies and invalidations are the ones this screen has
 * always sent — `["schools","periods"]`, `["schools","rooms"]`,
 * `["schools","terms"]`, and a timetable invalidation on every write, because a
 * period or a room moving is a timetable moving.
 *
 * Two boards' worth of notes about what this does NOT draw:
 *
 *   - the board's fifth field is **Days**, and a `SchoolPeriod` has no days: it
 *     has a term, fixed at creation because which term a period belongs to
 *     decides which timetable it appears in. So the field reads Term and shows
 *     the stored one without a control on it — rule 9, hide what cannot be done.
 *   - the board's fifth field is **Days** — see the note beside the Term row.
 *
 * The board's header verb is **Archive**, and `SchoolPeriod.isActive` now
 * carries the state behind it. Retiring a period releases its minutes, so the
 * verb reads Archive on a live period and Restore on a retired one, and a
 * restore can come back 409 when something else took the slot while it was
 * away — which is why it writes through the same error line as every other
 * edit on this record. Rule 9: a persona without `schools.academics:archive`
 * (the HOD grant is exactly view/create/edit) gets no button, not a dead one.
 */

const PERIODS_KEY = ["schools", "periods"] as const;
const ROOMS_KEY = ["schools", "rooms"] as const;
const TERMS_KEY = ["schools", "terms"] as const;

/** The whole body the period endpoints have always been sent. */
type PeriodBody = {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  sequence: number;
  isTeaching: boolean;
};

function bodyOf(period: SchoolsPeriodRecord, overrides: Partial<PeriodBody>): PeriodBody {
  return {
    code: period.code,
    name: period.name,
    startMinute: period.startMinute,
    endMinute: period.endMinute,
    sequence: period.sequence,
    isTeaching: period.isTeaching,
    ...overrides,
  };
}

export default function SchoolsPeriodsMasterDataPage() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const canEdit = access.can("schools.academics", "edit");
  const canArchive = access.can("schools.academics", "archive");

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [periodDialogOpen, setPeriodDialogOpen] = React.useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<SchoolsRoomRecord | null>(null);

  const periodsQuery = useQuery({
    queryKey: PERIODS_KEY,
    queryFn: () => fetchSchoolsPeriods({ page: 1, limit: 200 }),
  });
  const roomsQuery = useQuery({
    queryKey: ROOMS_KEY,
    queryFn: () => fetchSchoolsRooms({ page: 1, limit: 200 }),
  });
  const termsQuery = useQuery({
    queryKey: TERMS_KEY,
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });

  const periods = React.useMemo(() => periodsQuery.data?.data ?? [], [periodsQuery.data]);
  const rooms = React.useMemo(() => roomsQuery.data?.data ?? [], [roomsQuery.data]);
  const terms = React.useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const ordered = [...periods].sort((a, b) => a.sequence - b.sequence);
    if (!needle) return ordered;
    return ordered.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle),
    );
  }, [periods, search]);

  const wide = useWideViewport();
  React.useEffect(() => {
    if (!wide) return;
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId, wide]);

  const selected = React.useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const invalidatePeriods = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PERIODS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
  }, [queryClient]);

  const invalidateRooms = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
  }, [queryClient]);

  const createPeriod = useMutation({
    mutationFn: (values: PeriodFormValues) => {
      const startMinute = parseMinute(values.startsAt);
      const endMinute = parseMinute(values.endsAt);
      if (startMinute == null || endMinute == null) {
        throw new Error("Both times have to read as a time of day, like 07:30.");
      }
      return fetchJson("/api/v2/schools/periods", {
        method: "POST",
        // The term is fixed at creation: which term a period belongs to decides
        // which timetable it appears in, and moving it afterwards would move
        // every lesson placed in it.
        body: JSON.stringify({
          code: values.code.trim(),
          name: values.name.trim(),
          startMinute,
          endMinute,
          sequence: Number(values.sequence || 0),
          isTeaching: values.isTeaching,
          termId: values.termId || null,
        }),
      });
    },
    onSuccess: () => {
      setPeriodDialogOpen(false);
      invalidatePeriods();
    },
  });

  const patchPeriod = useMutation({
    mutationFn: (input: { id: string; body: PeriodBody }) =>
      fetchJson(`/api/v2/schools/periods/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.body),
      }),
    onSuccess: invalidatePeriods,
  });

  /**
   * Retirement, as its own write rather than a field on the Details grid.
   *
   * It sends `{ isActive }` alone — not `bodyOf(...)` — because the route
   * treats an `isActive` flip as a separate verb behind a separate permission,
   * and sending the record's other five fields alongside it would ask for an
   * edit the caller may not be making.
   */
  const setPeriodActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setSchoolsPeriodActive(input.id, input.isActive),
    onSuccess: invalidatePeriods,
  });

  const deletePeriod = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/periods/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedId(null);
      invalidatePeriods();
    },
  });

  const saveRoom = useMutation({
    mutationFn: (values: RoomFormValues) => {
      const body = JSON.stringify({
        code: values.code.trim(),
        name: values.name.trim(),
        capacity: values.capacity ? Number(values.capacity) : null,
        kind: values.kind.trim() || null,
        ...(editingRoom ? { isActive: values.isActive } : {}),
      });
      return editingRoom
        ? fetchJson(`/api/v2/schools/rooms/${editingRoom.id}`, { method: "PATCH", body })
        : fetchJson("/api/v2/schools/rooms", { method: "POST", body });
    },
    onSuccess: () => {
      setRoomDialogOpen(false);
      setEditingRoom(null);
      invalidateRooms();
    },
  });

  const deleteRoom = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/rooms/${id}`, { method: "DELETE" }),
    onSuccess: invalidateRooms,
  });

  const commit = React.useCallback(
    (period: SchoolsPeriodRecord, overrides: Partial<PeriodBody>) => {
      patchPeriod.mutate({ id: period.id, body: bodyOf(period, overrides) });
    },
    [patchPeriod],
  );

  const state: ListColumnState = periodsQuery.isLoading
    ? "loading"
    : periodsQuery.isError
      ? "failed"
      : periods.length === 0
        ? "empty"
        : rows.length === 0
          ? "no-matches"
          : "ready";

  const nextSequence =
    periods.length === 0 ? 1 : Math.max(...periods.map((row) => row.sequence)) + 1;

  const writeError =
    patchPeriod.error ??
    setPeriodActive.error ??
    deletePeriod.error ??
    deleteRoom.error ??
    saveRoom.error ??
    null;

  return (
    <ManagementShell railCounts={{ "schools-school-day": periods.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="The school day"
            noun="period"
            count={periodsQuery.isLoading ? undefined : periods.length}
            state={state}
            search={{ value: search, onChange: setSearch, placeholder: "Search periods" }}
            onNew={canEdit ? () => setPeriodDialogOpen(true) : undefined}
            onRetry={() => void periodsQuery.refetch()}
            emptyLabel="No periods"
            emptyIcon={Clock}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                // The board's left column is where the period sits in the day.
                // A break has no number in it, and says so with a dash rather
                // than borrowing the one above it.
                code={row.isTeaching ? String(row.sequence) : "—"}
                name={row.name}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
                // A retired period still lists — it is how you find one to
                // restore — and reads muted rather than carrying a chip, the
                // same way an archived department does. The mute is the ink,
                // not opacity, so the name stays over 4.5:1.
                className={row.isActive ? undefined : "[&_*]:text-[#5E6573]"}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <RecordHeader
              title={selected.name}
              icon={Clock}
              onRename={canEdit ? (next) => commit(selected, { name: next }) : undefined}
              renameLabel="Rename the period"
              /* Rule 5: `context="header"` draws nothing for a live period, so
                 this is safe to pass unconditionally. */
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Retired
                </StatusBadge>
              }
              action={
                canArchive ? (
                  <HeaderAction
                    icon={selected.isActive ? Archive : RotateCcw}
                    disabled={setPeriodActive.isPending}
                    onClick={async () => {
                      const confirmed = await dsConfirm({
                        title: selected.isActive
                          ? `Archive ${selected.name}?`
                          : `Restore ${selected.name}?`,
                        description: selected.isActive
                          ? "The day stops offering this slot and releases its minutes. Lessons already in it stay where they are."
                          : "The period takes its minutes back. It is refused if another period now covers them.",
                        confirmLabel: selected.isActive ? "Archive" : "Restore",
                        variant: selected.isActive ? "warning" : "default",
                      });
                      if (confirmed) {
                        setPeriodActive.mutate({
                          id: selected.id,
                          isActive: !selected.isActive,
                        });
                      }
                    }}
                  >
                    {selected.isActive ? "Archive" : "Restore"}
                  </HeaderAction>
                ) : undefined
              }
              overflow={
                canArchive ? (
                  <DropdownMenuItem
                    onSelect={async () => {
                      const confirmed = await dsConfirm({
                        title: `Delete ${selected.name}?`,
                        description:
                          "The day loses this slot everywhere the timetable is drawn. It is refused while any lesson is scheduled inside it.",
                        confirmLabel: "Delete the period",
                        variant: "danger",
                      });
                      if (confirmed) deletePeriod.mutate(selected.id);
                    }}
                  >
                    Delete period
                  </DropdownMenuItem>
                ) : undefined
              }
            />

            {writeError ? <WriteError error={writeError} /> : null}

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>

            <DetailGrid>
              <DetailField label="Name">
                {(id) => (
                  <InlineText
                    id={id}
                    value={selected.name}
                    disabled={!canEdit}
                    onCommit={(next) => {
                      if (!next.trim()) return;
                      commit(selected, { name: next.trim() });
                    }}
                  />
                )}
              </DetailField>

              <DetailField label="Starts">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    value={formatMinute(selected.startMinute)}
                    disabled={!canEdit}
                    onCommit={(next) => {
                      const minute = parseMinute(next);
                      if (minute == null) return;
                      commit(selected, { startMinute: minute });
                    }}
                  />
                )}
              </DetailField>

              <DetailField label="Ends">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    value={formatMinute(selected.endMinute)}
                    disabled={!canEdit}
                    onCommit={(next) => {
                      const minute = parseMinute(next);
                      if (minute == null) return;
                      commit(selected, { endMinute: minute });
                    }}
                  />
                )}
              </DetailField>

              <DetailField label="Kind">
                {(id) => (
                  <Select
                    value={selected.isTeaching ? "teaching" : "break"}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      commit(selected, { isTeaching: value === "teaching" })
                    }
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teaching">Teaching</SelectItem>
                      <SelectItem value="break">Break</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </DetailField>

              {/*
                The board's fifth field is Days. A `SchoolPeriod` carries no
                days — it carries a term, and the term is what decides which
                timetable the period appears in. So the fifth line is the term,
                and it is a fact rather than a control: moving a period between
                terms would move every lesson already placed in it, which this
                screen does not offer and the endpoint is not sent.
              */}
              <DetailFact label="Term">
                {selected.term?.name ?? "Every term"}
              </DetailFact>

              {/*
                Off the board, and kept: the code is what the timetable and the
                imports key a period by, and where a period sits in the day is
                the figure the list draws down its left edge. Neither is
                reachable anywhere else on this surface.
              */}
              <DetailField label="Code">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    value={selected.code}
                    disabled={!canEdit}
                    onCommit={(next) => {
                      if (!next.trim()) return;
                      commit(selected, { code: next.trim() });
                    }}
                  />
                )}
              </DetailField>

              <DetailField label="Position">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    inputMode="numeric"
                    value={String(selected.sequence)}
                    disabled={!canEdit}
                    onCommit={(next) => {
                      const sequence = Number(next);
                      if (!Number.isFinite(sequence)) return;
                      commit(selected, { sequence });
                    }}
                  />
                )}
              </DetailField>
            </DetailGrid>

            <SectionHeading
              icon={ListBullets}
              count={rooms.length}
              action={
                canEdit ? (
                  <SectionAction
                    icon={Plus}
                    onClick={() => {
                      setEditingRoom(null);
                      setRoomDialogOpen(true);
                    }}
                  >
                    Add a room
                  </SectionAction>
                ) : undefined
              }
            >
              Rooms
            </SectionHeading>

            {rooms.length === 0 ? (
              <RecordEmpty>No rooms</RecordEmpty>
            ) : (
              <RoomList
                rooms={rooms}
                onEdit={(room) => {
                  setEditingRoom(room);
                  setRoomDialogOpen(true);
                }}
                onDelete={(room) => deleteRoom.mutate(room.id)}
                deleting={deleteRoom.isPending}
              />
            )}

            {/*
              Rule: every record ends with its trail. `PlatformAuditEvent` has
              no route for a period — the only record-audit endpoint in the repo
              is `/api/users/[id]/audit` — so this draws the empty state rather
              than inventing rows, and makes no "chain verified" claim, which
              only a server walking `prevEventHash` could support.
            */}
            <ActivityTrail events={[]} />
          </>
        ) : (
          <RecordEmpty>
            {periodsQuery.isLoading
              ? "Loading the school day"
              : periods.length === 0
                ? "No period is set up yet"
                : "Pick a period"}
          </RecordEmpty>
        )}
      </RegisterLayout>

      <PeriodFormDialog
        open={periodDialogOpen}
        onOpenChange={(open) => {
          setPeriodDialogOpen(open);
          if (!open) createPeriod.reset();
        }}
        terms={terms}
        nextSequence={nextSequence}
        isSubmitting={createPeriod.isPending}
        error={createPeriod.error ? getApiErrorMessage(createPeriod.error) : null}
        onSubmit={(values) => createPeriod.mutate(values)}
      />

      <RoomFormDialog
        open={roomDialogOpen}
        onOpenChange={(open) => {
          setRoomDialogOpen(open);
          if (!open) {
            setEditingRoom(null);
            saveRoom.reset();
          }
        }}
        initial={
          editingRoom
            ? {
                code: editingRoom.code,
                name: editingRoom.name,
                capacity: editingRoom.capacity == null ? "" : String(editingRoom.capacity),
                kind: editingRoom.kind ?? "",
                isActive: editingRoom.isActive,
              }
            : undefined
        }
        isSubmitting={saveRoom.isPending}
        error={saveRoom.error ? getApiErrorMessage(saveRoom.error) : null}
        onSubmit={(values) => saveRoom.mutate(values)}
      />
    </ManagementShell>
  );
}

/* ------------------------------------------------------------------ *
 * Local pieces
 *
 * The label-left Details grid, the 13px control class and the commit-on-blur
 * field are shared with the two registers beside this one and live in
 * `../classes/record-fields`. What is left here is what only this screen has.
 * ------------------------------------------------------------------ */

/**
 * A stored fact with no control on it — the Term line.
 *
 * Its own row rather than a `DetailField`, because `DetailField` draws a real
 * `<label for=…>` and there is nothing here for it to point at. A label
 * addressing a control that does not exist is read out as a field somebody can
 * fill, which this is not. The two columns are the grid's own — `400 12/1.45`
 * muted against `400 13/1.5` body — so the line sits in the ladder with the
 * four above it.
 */
function DetailFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span
        style={{
          alignSelf: "center",
          font: "400 12px/1.45 var(--font-sans)",
          color: "#5E6573",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "block",
          font: "400 13px/1.5 var(--font-sans)",
          color: "#262A33",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </>
  );
}

/**
 * The rooms under a period.
 *
 * `RecordList` draws exactly this line — 44px mono code, name, right-aligned
 * mono figure — but its rows carry no verbs, and a room still has to be
 * editable and deletable from somewhere. So the row keeps the board's geometry
 * and ends with the module's own gated menu, which is where Edit and Delete
 * have always lived and which is what keeps `schools.academics` deciding who
 * sees them.
 */
function RoomList({
  rooms,
  onEdit,
  onDelete,
  deleting,
}: {
  rooms: SchoolsRoomRecord[];
  onEdit: (room: SchoolsRoomRecord) => void;
  onDelete: (room: SchoolsRoomRecord) => void;
  deleting: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: 470,
          padding: "0 0 7px",
          borderBottom: "1px solid #E5E8EE",
        }}
      >
        <span
          style={{
            flexGrow: 1,
            minWidth: 0,
            font: "500 11px/1.5 var(--font-sans)",
            color: "#5E6573",
          }}
        >
          Room
        </span>
        <span
          style={{
            flexShrink: 0,
            minWidth: 48,
            textAlign: "right",
            font: "500 11px/1.5 var(--font-sans)",
            color: "#5E6573",
          }}
        >
          Seats
        </span>
        <span style={{ width: 28, flexShrink: 0 }} />
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", maxWidth: 470 }}>
        {rooms.map((room, index) => (
          <li
            key={room.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 38,
              borderBottom: index === rooms.length - 1 ? "none" : "1px solid #EEF0F4",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                font: "500 11px/1.5 var(--font-mono)",
                color: "#5E6573",
              }}
            >
              {room.code}
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                font: "400 13px/1.5 var(--font-sans)",
                color: "#262A33",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {room.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                minWidth: 48,
                textAlign: "right",
                font: "500 11px/1.5 var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "#5E6573",
              }}
            >
              {room.capacity ?? "—"}
            </span>
            <span style={{ width: 28, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <RecordActions
                layout="menu"
                label={`Row actions for ${room.name}`}
                resource="schools.academics"
                verbs={[
                  { label: "Edit", action: "edit", onSelect: () => onEdit(room) },
                  {
                    label: "Delete",
                    action: "archive",
                    tone: "danger",
                    loading: deleting,
                    confirm: {
                      title: `Delete ${room.name}?`,
                      description:
                        "The room leaves every timetable picker. It is refused while any lesson is still scheduled in it — take it out of use instead.",
                      confirmLabel: "Delete the room",
                    },
                    onSelect: () => onDelete(room),
                  },
                ]}
              />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A write that was refused, in the contract's danger ink. */
function WriteError({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 34,
        margin: "16px 0 0",
        padding: "0 12px",
        maxWidth: 470,
        borderRadius: 8,
        background: "var(--tone-danger-bg)",
        font: "500 12px/1.4 var(--font-sans)",
        color: "var(--tone-danger-strong)",
      }}
    >
      {getApiErrorMessage(error)}
    </p>
  );
}

/**
 * Below 900px the register stacks and only one column shows, so the record must
 * not open itself — the list is what somebody landed on.
 */
function useWideViewport() {
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return wide;
}
