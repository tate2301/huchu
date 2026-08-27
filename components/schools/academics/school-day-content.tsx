"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListEmpty } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsPeriods,
  fetchSchoolsRooms,
  fetchSchoolsTerms,
  type SchoolsPeriodRecord,
  type SchoolsRoomRecord,
} from "@/lib/schools/admin-v2";
import { formatMinute, parseMinute } from "@/lib/schools/timetable-format";
import { PeriodFormDialog, type PeriodFormValues } from "./period-form-dialog";
import { RoomFormDialog, type RoomFormValues } from "./room-form-dialog";

/**
 * The school day — the periods it is divided into, and the rooms lessons run in.
 *
 * Both endpoints existed and neither had a screen. The timetable told people to
 * "set the school day up under Academics", which was a page that did not exist,
 * so the only way to get a period into the system was a REST client. This is
 * that page.
 *
 * Periods and rooms sit together because they are the two axes of the same
 * grid: a timetable slot is a period, a room and a class, and a school setting
 * one up needs both before it can lay out a single lesson.
 */

type SchoolDayView = "periods" | "rooms";

export function SchoolDayContent() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<SchoolDayView>("periods");
  const [termFilter, setTermFilter] = useState("");
  const [teachingFilter, setTeachingFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState("");

  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchoolsPeriodRecord | null>(null);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<SchoolsRoomRecord | null>(null);

  const periodsQuery = useQuery({
    queryKey: ["schools", "periods"],
    queryFn: () => fetchSchoolsPeriods({ page: 1, limit: 200 }),
  });
  const roomsQuery = useQuery({
    queryKey: ["schools", "rooms"],
    queryFn: () => fetchSchoolsRooms({ page: 1, limit: 200 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });

  const periods = useMemo(() => periodsQuery.data?.data ?? [], [periodsQuery.data]);
  const rooms = useMemo(() => roomsQuery.data?.data ?? [], [roomsQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);

  const roomKinds = useMemo(() => {
    const seen = new Set<string>();
    for (const room of rooms) if (room.kind) seen.add(room.kind);
    return [...seen].sort().map((kind) => ({ value: kind, label: kind }));
  }, [rooms]);

  const visiblePeriods = useMemo(
    () =>
      periods.filter((row) => {
        if (termFilter === "__every__" && row.termId != null) return false;
        if (termFilter && termFilter !== "__every__" && row.termId !== termFilter) {
          return false;
        }
        if (teachingFilter === "teaching" && !row.isTeaching) return false;
        if (teachingFilter === "break" && row.isTeaching) return false;
        return true;
      }),
    [periods, termFilter, teachingFilter],
  );

  const visibleRooms = useMemo(
    () =>
      rooms.filter((row) => {
        if (kindFilter && row.kind !== kindFilter) return false;
        if (roomStatusFilter === "active" && !row.isActive) return false;
        if (roomStatusFilter === "retired" && row.isActive) return false;
        return true;
      }),
    [rooms, kindFilter, roomStatusFilter],
  );

  function invalidatePeriods() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "periods"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
  }
  function invalidateRooms() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "rooms"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
  }

  const savePeriod = useMutation({
    mutationFn: (values: PeriodFormValues) => {
      const startMinute = parseMinute(values.startsAt);
      const endMinute = parseMinute(values.endsAt);
      if (startMinute == null || endMinute == null) {
        throw new Error("Both times have to read as a time of day, like 07:30.");
      }
      const common = {
        code: values.code.trim(),
        name: values.name.trim(),
        startMinute,
        endMinute,
        sequence: Number(values.sequence || 0),
        isTeaching: values.isTeaching,
      };
      return editingPeriod
        ? fetchJson(`/api/v2/schools/periods/${editingPeriod.id}`, {
            method: "PATCH",
            body: JSON.stringify(common),
          })
        : fetchJson("/api/v2/schools/periods", {
            method: "POST",
            // The term is fixed at creation: which term a period belongs to
            // decides which timetable it appears in, and moving it afterwards
            // would move every lesson placed in it.
            body: JSON.stringify({ ...common, termId: values.termId || null }),
          });
    },
    onSuccess: () => {
      setPeriodDialogOpen(false);
      setEditingPeriod(null);
      invalidatePeriods();
    },
  });

  const deletePeriod = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/periods/${id}`, { method: "DELETE" }),
    onSuccess: invalidatePeriods,
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

  const periodColumns = useMemo<ColumnDef<SchoolsPeriodRecord>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.code} - {row.original.name}
            </div>
            <div className="text-muted-foreground font-mono">
              {formatMinute(row.original.startMinute)} →{" "}
              {formatMinute(row.original.endMinute)}
            </div>
          </div>
        ),
      },
      {
        id: "sequence",
        header: "Position",
        cell: ({ row }) => <NumericCell>{row.original.sequence}</NumericCell>,
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term?.name ?? "Every term",
      },
      {
        id: "kind",
        header: "Kind",
        cell: ({ row }) => (
          <Badge tone={row.original.isTeaching ? "brand" : "neutral"}>
            {row.original.isTeaching ? "Lessons" : "Break"}
          </Badge>
        ),
      },
      {
        id: "slots",
        header: "Lessons",
        cell: ({ row }) => <NumericCell>{row.original._count?.slots ?? 0}</NumericCell>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingPeriod(row.original);
                  setPeriodDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deletePeriod.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The day loses this slot everywhere the timetable is drawn. It is refused while any lesson is scheduled inside it.",
                  confirmLabel: "Delete the period",
                },
                onSelect: () => deletePeriod.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [deletePeriod],
  );

  const roomColumns = useMemo<ColumnDef<SchoolsRoomRecord>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      { accessorKey: "name", header: "Name" },
      {
        id: "kind",
        header: "Kind",
        cell: ({ row }) => row.original.kind ?? "-",
      },
      {
        id: "capacity",
        header: "Seats",
        cell: ({ row }) => <NumericCell>{row.original.capacity ?? "-"}</NumericCell>,
      },
      {
        id: "slots",
        header: "Lessons",
        cell: ({ row }) => <NumericCell>{row.original._count?.slots ?? 0}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "In use" : "Out of use"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingRoom(row.original);
                  setRoomDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteRoom.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The room leaves every timetable picker. It is refused while any lesson is still scheduled in it — take it out of use instead.",
                  confirmLabel: "Delete the room",
                },
                onSelect: () => deleteRoom.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [deleteRoom],
  );

  const nextSequence =
    periods.length === 0 ? 1 : Math.max(...periods.map((row) => row.sequence)) + 1;
  const teachingMinutes = periods
    .filter((row) => row.isTeaching)
    .reduce((total, row) => total + (row.endMinute - row.startMinute), 0);

  // The filters in the user's own words, so "nothing matched" repeats what was
  // asked for rather than leaving somebody to work out which dropdown emptied
  // the table.
  const narrowedPeriods = [
    termFilter === "__every__"
      ? "Runs all year"
      : terms.find((term) => term.id === termFilter)?.name,
    teachingFilter === "teaching"
      ? "Lessons"
      : teachingFilter === "break"
        ? "Break"
        : "",
  ].filter((value): value is string => Boolean(value));

  const narrowedRooms = [
    kindFilter,
    roomStatusFilter === "active"
      ? "In use"
      : roomStatusFilter === "retired"
        ? "Out of use"
        : "",
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          { label: "Periods", value: periods.length },
          {
            label: "Teaching time a day",
            value: `${Math.floor(teachingMinutes / 60)}h ${teachingMinutes % 60}m`,
            tone: "brand",
          },
          {
            label: "Rooms in use",
            value: rooms.filter((row) => row.isActive).length,
          },
        ]}
      />

      {periodsQuery.error || roomsQuery.error ? (
        <LoadError
          what="the school day"
          error={periodsQuery.error || roomsQuery.error}
          onRetry={() => {
            void periodsQuery.refetch();
            void roomsQuery.refetch();
          }}
        />
      ) : null}

      {/*
        Named per verb: a period refused because a lesson still sits in it is
        a different thing to fix from a room that would not go out of use, and
        one shared banner made them read as the same failure.
      */}
      {deletePeriod.error ? (
        <SaveError what="The period" error={deletePeriod.error} />
      ) : null}
      {deleteRoom.error ? <SaveError what="The room" error={deleteRoom.error} /> : null}

      <VerticalDataViews
        items={[
          { id: "periods", label: "Periods", count: periods.length },
          { id: "rooms", label: "Rooms", count: rooms.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as SchoolDayView)}
        railLabel="School day views"
      >
        <div className={activeView === "periods" ? "space-y-3" : "hidden"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterBar>
              <FilterSelect
                label="Term"
                allLabel="Every term"
                value={termFilter}
                options={[
                  { value: "__every__", label: "Runs all year" },
                  ...terms.map((term) => ({
                    value: term.id,
                    label: `${term.name} · ${term.academicYear.name}`,
                  })),
                ]}
                onChange={setTermFilter}
              />
              <FilterSelect
                label="Kind"
                allLabel="Lessons and breaks"
                value={teachingFilter}
                options={[
                  { value: "teaching", label: "Lessons" },
                  { value: "break", label: "Break" },
                ]}
                onChange={setTeachingFilter}
              />
            </FilterBar>
            <CreateButton
              resource="schools.academics"
              label="New period"
              onSelect={() => {
                setEditingPeriod(null);
                setPeriodDialogOpen(true);
              }}
            />
          </div>

          {periodsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Period", "Position", "Term", "Kind", "Lessons"]}
              columns={[
                { twoLine: true },
                { width: 90, align: "right" },
                { width: 160 },
                { width: 100, badge: true },
                { width: 90, align: "right" },
              ]}
              rows={7}
            />
          ) : periods.length === 0 ? (
            <NothingYet
              title="The school day has not been set up"
              body="A timetable is laid out on periods. Add the first one — assembly, then Period 1 — and the timetable grid appears."
            />
          ) : visiblePeriods.length === 0 ? (
            <NothingMatched
              what="periods"
              filters={narrowedPeriods}
              onClear={() => {
                setTermFilter("");
                setTeachingFilter("");
              }}
            />
          ) : (
            <DataTable
              data={visiblePeriods}
              columns={periodColumns}
              searchPlaceholder="Search periods"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No periods matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={`${row.code} - ${row.name}`}
                        subtitle={[
                          `${formatMinute(row.startMinute)} → ${formatMinute(row.endMinute)}`,
                          row.isTeaching ? "Lessons" : "Break",
                          row.term?.name ?? "Every term",
                        ].join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="periods" />}
            />
          )}
        </div>

        <div className={activeView === "rooms" ? "space-y-3" : "hidden"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterBar>
              <FilterSelect
                label="Kind"
                allLabel="Every kind"
                value={kindFilter}
                options={roomKinds}
                onChange={setKindFilter}
              />
              <FilterSelect
                label="Status"
                allLabel="In use or not"
                value={roomStatusFilter}
                options={[
                  { value: "active", label: "In use" },
                  { value: "retired", label: "Out of use" },
                ]}
                onChange={setRoomStatusFilter}
              />
            </FilterBar>
            <CreateButton
              resource="schools.academics"
              label="New room"
              onSelect={() => {
                setEditingRoom(null);
                setRoomDialogOpen(true);
              }}
            />
          </div>

          {roomsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Code", "Name", "Kind", "Seats", "Lessons", "Status"]}
              columns={[
                { width: 110 },
                {},
                { width: 120 },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 100, badge: true },
              ]}
              rows={7}
            />
          ) : rooms.length === 0 ? (
            <NothingYet
              title="No rooms yet"
              body="A room is where a lesson happens. Without them the timetable cannot tell you two classes have been put in the same place."
            />
          ) : visibleRooms.length === 0 ? (
            <NothingMatched
              what="rooms"
              filters={narrowedRooms}
              onClear={() => {
                setKindFilter("");
                setRoomStatusFilter("");
              }}
            />
          ) : (
            <DataTable
              data={visibleRooms}
              columns={roomColumns}
              searchPlaceholder="Search rooms"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No rooms matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={`${row.code} - ${row.name}`}
                        subtitle={[
                          row.kind,
                          row.capacity ? `${row.capacity} seats` : null,
                          row.isActive ? null : "Out of use",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="rooms" />}
            />
          )}
        </div>
      </VerticalDataViews>

      <PeriodFormDialog
        open={periodDialogOpen}
        onOpenChange={(open) => {
          setPeriodDialogOpen(open);
          if (!open) {
            setEditingPeriod(null);
            savePeriod.reset();
          }
        }}
        terms={terms}
        nextSequence={nextSequence}
        initial={
          editingPeriod
            ? {
                code: editingPeriod.code,
                name: editingPeriod.name,
                startsAt: formatMinute(editingPeriod.startMinute),
                endsAt: formatMinute(editingPeriod.endMinute),
                sequence: String(editingPeriod.sequence),
                isTeaching: editingPeriod.isTeaching,
                termId: editingPeriod.termId ?? "",
              }
            : undefined
        }
        isSubmitting={savePeriod.isPending}
        error={savePeriod.error ? getApiErrorMessage(savePeriod.error) : null}
        onSubmit={(values) => savePeriod.mutate(values)}
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
    </div>
  );
}
