"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { PageBand } from "@/components/schools/common/page-band";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  ClassFilter,
  ALL_CLASSES,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import {
  TableControls,
  TableSearch,
} from "@/components/schools/common/table-controls";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";

type Stop = {
  id: string;
  name: string;
  sequence: number;
  pickupMinute: number | null;
  dropMinute: number | null;
};

type Route = {
  id: string;
  code: string;
  name: string;
  /** `Decimal` crosses JSON as a string. Never compare it, always `Number()` it. */
  termFee: number | string | null;
  capacity: number | null;
  vehicleReg: string | null;
  driverName: string | null;
  driverPhone: string | null;
  isActive: boolean;
  stops: Stop[];
  _count: { riders: number };
};

type Billing = {
  route: { id: string; code: string; name: string; termFee: number; capacity: number | null };
  riders: number;
  unbilled: number;
  due: number;
};

type RegisterRow = {
  riderId: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    currentClass: { id: string; name: string } | null;
  };
  stop: { id: string; name: string; sequence: number; pickupMinute: number | null } | null;
  boarding: { id: string; boarded: boolean } | null;
};

type Register = {
  route: { id: string; code: string; name: string; driverName: string | null };
  rows: RegisterRow[];
  summary: { expected: number; on: number; notOn: number; unmarked: number };
};

type View = "routes" | "register";

function clock(minute: number | null) {
  if (minute === null) return null;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "07:04" back into minutes past midnight, which is what the stop stores. */
function toMinute(value: string): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "24 Aug 2026" — how the canvas labels the day the register is for. */
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function readableDay(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date);
}

/**
 * How a route names itself, and it is three facts rather than two:
 * "R2 · Chishawasha · Mr Katsande".
 *
 * The driver belongs in the name because a bus without one named is a hole in
 * the arrangement somebody has to fill before term starts, and a blank there
 * reads as "not filled in yet" rather than "nobody assigned". So an unnamed
 * driver says so out loud — "R5 · Borrowdale · no driver named" — which is the
 * same rule the register uses for a rider with no stop.
 */
function routeLabel(route: { code: string; name: string; driverName: string | null }) {
  return `${route.code} · ${route.name} · ${route.driverName ?? "no driver named"}`;
}

/** "R2 · Chishawasha" — the route without its driver, for filters and captions. */
function routeShort(route: { code: string; name: string }) {
  return `${route.code} · ${route.name}`;
}

/**
 * The times under a stop: "Pick up 06:40 · drop 16:20".
 *
 * A stop with no pick-up time set is the gap that strands a child at a gate, so
 * it is spelled out rather than left blank — "No pick-up time set", in the warn
 * tone, next to the stops that do have one. A finished route reads down as
 * "1. Mission Gate", "2. Chishawasha Shops", "3. Dandaro Turn" with their
 * times, and then "4. St Ignatius" with the warning where a time is owed.
 */
function stopTimes(stop: Stop) {
  const pickup = clock(stop.pickupMinute);
  const drop = clock(stop.dropMinute);
  if (!pickup) return "No pick-up time set";
  return drop ? `Pick up ${pickup} · drop ${drop}` : `Pick up ${pickup}`;
}

/**
 * The second line of a rider's row: "CHS-1180 · Mission Gate 06:40 · Form 2A".
 *
 * Admission number, where the driver picks them up and at what time, and the
 * class to send word to. A rider with no stop set says "no stop set", which is
 * the driver's cue to ask rather than a blank they have to interpret —
 * "CHS-1233 · no stop set · Form 3A" sits in the list beside
 * "CHS-1240 · Dandaro Turn 07:04 · Form 3A" and is read as the exception it is.
 */
function riderLine(row: RegisterRow) {
  const parts = [row.student.studentNo];
  if (row.stop) {
    const at = clock(row.stop.pickupMinute);
    parts.push(at ? `${row.stop.name} ${at}` : row.stop.name);
  } else {
    parts.push("no stop set");
  }
  if (row.student.currentClass) parts.push(row.student.currentClass.name);
  return parts.join(" · ");
}

/**
 * The transport office, and the driver's register.
 *
 * Two views. "Routes" is the standing arrangement — where the bus stops, who
 * rides it and what that is worth in fees. "This morning" is the register:
 * every rider in stop order, marked or not, because a driver works down the
 * route and not down an alphabet, and a child who has not got on is a row
 * rather than an absence.
 *
 * They are two views of one page rather than two pages because they are the
 * same six buses read two ways, and the segmented strip sits in the control row
 * with the filters that narrow whichever one is showing — never in the band
 * above, which belongs to the numbers.
 *
 * The billing figure is *reported*, not posted. Turning it into invoice lines
 * belongs with the fee run, and a transport module that silently created
 * charges is one nobody can reconcile.
 *
 * Routes, stops and riders each carry their own verbs, gated on the same grant
 * as the endpoints behind them — `schools.students`, because knowing which bus
 * a child is on is knowing where the child is.
 */
export function TransportContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("routes");
  const [routeFilter, setRouteFilter] = useState("");
  const [stopFilter, setStopFilter] = useState("");
  const [classes, setClasses] = useState<ClassFilterValue>(ALL_CLASSES);
  const [runningFilter, setRunningFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onDate, setOnDate] = useState(today);
  const [direction, setDirection] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [addingRoute, setAddingRoute] = useState(false);
  const [stopContext, setStopContext] = useState<{ route: Route; stop: Stop | null } | null>(
    null,
  );
  const [addingRider, setAddingRider] = useState(false);
  const [movingRider, setMovingRider] = useState<RegisterRow | null>(null);

  const routesQuery = useQuery({
    queryKey: ["schools", "transport", "routes"],
    queryFn: () =>
      fetchJson<{ routes: Route[]; billing: Billing[] }>("/api/v2/schools/transport"),
  });

  const allRoutes = useMemo(() => routesQuery.data?.routes ?? [], [routesQuery.data]);
  const billing = useMemo(() => routesQuery.data?.billing ?? [], [routesQuery.data]);

  const routes = useMemo(
    () =>
      allRoutes.filter((route) => {
        if (routeFilter && route.id !== routeFilter) return false;
        if (runningFilter === "running" && !route.isActive) return false;
        if (runningFilter === "stopped" && route.isActive) return false;
        const term = search.trim().toLowerCase();
        if (term && !routeLabel(route).toLowerCase().includes(term)) return false;
        return true;
      }),
    [allRoutes, routeFilter, runningFilter, search],
  );

  const activeRoute = routeFilter || allRoutes[0]?.id || "";
  const activeRouteRecord = allRoutes.find((route) => route.id === activeRoute) ?? null;

  const registerQuery = useQuery({
    queryKey: ["schools", "transport", "register", activeRoute, onDate, direction],
    queryFn: () =>
      fetchJson<{ register: Register }>(
        `/api/v2/schools/transport?routeId=${activeRoute}&onDate=${onDate}&direction=${direction}`,
      ),
    enabled: view === "register" && Boolean(activeRoute),
  });

  const register = registerQuery.data?.register ?? null;
  const allRows = useMemo(() => register?.rows ?? [], [register]);

  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        if (stopFilter === "__none__" && row.stop) return false;
        if (stopFilter && stopFilter !== "__none__" && row.stop?.id !== stopFilter) {
          return false;
        }
        if (classes.classId && row.student.currentClass?.id !== classes.classId) {
          return false;
        }
        const term = search.trim().toLowerCase();
        if (
          term &&
          !`${row.student.lastName}, ${row.student.firstName} ${row.student.studentNo}`
            .toLowerCase()
            .includes(term)
        ) {
          return false;
        }
        return true;
      }),
    [allRows, stopFilter, classes.classId, search],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "transport"] });
  };

  const markMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/transport", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          onDate,
          direction,
          entries: rows.map((row) => ({
            riderId: row.riderId,
            boarded: marks[row.riderId] ?? row.boarding?.boarded ?? true,
          })),
        }),
      }),
    onSuccess: () => {
      // Name the day back. A register is saved against a date somebody chose in
      // a filter, and "Register saved" alone has bitten people who were still
      // looking at yesterday.
      setNote(`Register saved for ${readableDay(onDate)}`);
      setMarks({});
      invalidate();
    },
  });

  const routeAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/transport/routes/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const stopAction = useMutation({
    mutationFn: (input: { id: string; remove?: boolean; body?: Record<string, unknown> }) =>
      fetchJson(`/api/v2/schools/transport/stops/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const riderAction = useMutation({
    mutationFn: (input: { id: string; stopId?: string | null; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/transport/riders/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify({ stopId: input.stopId ?? null }) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const totalDue = billing.reduce((sum, row) => sum + row.due, 0);
  const totalRiders = billing.reduce((sum, row) => sum + row.riders, 0);
  const failure =
    routeAction.error ?? stopAction.error ?? riderAction.error ?? markMutation.error;
  const anyRouteFilter = Boolean(routeFilter || runningFilter || search.trim());
  const anyRiderFilter = Boolean(stopFilter || classes.classId || search.trim());

  /**
   * The strip that switches the two views, and the counts the canvas puts on
   * it. It lives in the control row rather than the band, because it changes
   * what the rows below say and nothing above them.
   */
  const views = (
    <SegmentedControl<View>
      value={view}
      onValueChange={(next) => {
        setView(next);
        setSearch("");
      }}
      ariaLabel="Transport views"
      options={[
        { value: "routes", label: "Routes", count: allRoutes.length },
        { value: "register", label: "This morning" },
      ]}
      className="shrink-0 self-end"
    />
  );

  return (
    <div className="space-y-4">
      <PageChrome title="Transport">
        {view === "routes" ? (
          <CreateButton
            resource="schools.students"
            action="edit"
            label="Add a route"
            onSelect={() => setAddingRoute(true)}
          />
        ) : (
          // The register's one verb. It is the primary action while the
          // register is showing because everything else on the screen is a
          // mark that means nothing until it is written down.
          <Button
            variant="primary"
            disabled={rows.length === 0 || markMutation.isPending}
            loading={markMutation.isPending}
            onClick={() => markMutation.mutate()}
          >
            Save the register
          </Button>
        )}
      </PageChrome>

      {view === "routes" ? (
        <PageBand
          chips={[
            { label: "Routes", value: allRoutes.length },
            { label: "Riding", value: totalRiders, tone: "brand" },
            {
              label: "Still to bill",
              value: formatSchoolMoney(totalDue),
              tone: totalDue > 0 ? "warn" : "success",
            },
          ]}
        />
      ) : (
        <PageBand
          chips={[
            {
              label: "On",
              value: register ? register.summary.on : "—",
              tone: "success",
            },
            {
              label: "Not on",
              value: register ? register.summary.notOn : "—",
              tone: register && register.summary.notOn > 0 ? "danger" : "neutral",
            },
            {
              label: "Unmarked",
              value: register ? register.summary.unmarked : "—",
              tone: register && register.summary.unmarked > 0 ? "warn" : "neutral",
            },
          ]}
        />
      )}

      {routesQuery.error ? (
        <LoadError
          what="transport"
          error={routesQuery.error}
          onRetry={() => void routesQuery.refetch()}
        />
      ) : null}
      {registerQuery.error ? (
        <LoadError
          what="the register"
          error={registerQuery.error}
          onRetry={() => void registerQuery.refetch()}
        />
      ) : null}
      {failure ? <SaveError what="That change" error={failure} /> : null}
      {note ? (
        <Alert tone="success" title="Done" onDismiss={() => setNote(null)}>
          {note}
        </Alert>
      ) : null}

      {view === "routes" ? (
        <>
          <TableControls
            tabs={views}
            search={
              <TableSearch
                label="Find a route"
                placeholder="Route, destination or driver"
                value={search}
                onChange={setSearch}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Route"
                  allLabel="Every route"
                  value={routeFilter}
                  options={allRoutes.map((route) => ({
                    value: route.id,
                    label: routeShort(route),
                  }))}
                  onChange={setRouteFilter}
                />
                <FilterSelect
                  label="Running"
                  allLabel="Every route"
                  value={runningFilter}
                  options={[
                    { value: "running", label: "Running" },
                    { value: "stopped", label: "Not running" },
                  ]}
                  onChange={setRunningFilter}
                />
              </>
            }
          />

          <p className="text-sm text-muted-foreground">
            {allRoutes.length} route{allRoutes.length === 1 ? "" : "s"} · {totalRiders}{" "}
            riders · {formatSchoolMoney(totalDue)} still to bill this term
          </p>

          {routesQuery.isLoading ? (
            <TableRowsSkeleton columns={[{ twoLine: true }, { width: 140 }, { width: 200 }]} />
          ) : routes.length === 0 ? (
            allRoutes.length === 0 ? (
              <NothingYet
                title="No routes yet"
                body="A route is a bus, a driver and a line of stops. Add one and the register writes itself every morning."
                action={
                  <CreateButton
                    resource="schools.students"
                    action="edit"
                    label="Add a route"
                    onSelect={() => setAddingRoute(true)}
                  />
                }
              />
            ) : (
              <NothingMatched
                what="routes"
                filters={[
                  allRoutes.find((route) => route.id === routeFilter)?.name ?? "",
                  runningFilter === "running"
                    ? "Running"
                    : runningFilter === "stopped"
                      ? "Not running"
                      : "",
                  search.trim(),
                ].filter(Boolean)}
                onClear={
                  anyRouteFilter
                    ? () => {
                        setRouteFilter("");
                        setRunningFilter("");
                        setSearch("");
                      }
                    : undefined
                }
              />
            )
          ) : (
            <ul className="space-y-3">
              {routes.map((route) => {
                const money = billing.find((row) => row.route.id === route.id);
                const riding = money?.riders ?? 0;
                const routeVerbs: RecordVerb[] = [
                  {
                    label: "Edit",
                    action: "edit",
                    onSelect: () => setEditingRoute(route),
                  },
                  {
                    label: "Add a stop",
                    action: "edit",
                    onSelect: () => setStopContext({ route, stop: null }),
                  },
                  {
                    label: route.isActive ? "Stop it running" : "Start it running",
                    action: "edit",
                    tone: route.isActive ? "warning" : "default",
                    loading: pendingId === route.id,
                    onSelect: () => {
                      setPendingId(route.id);
                      routeAction.mutate({
                        id: route.id,
                        body: { isActive: !route.isActive },
                      });
                    },
                  },
                  {
                    label: "Delete",
                    action: "archive",
                    tone: "danger",
                    loading: pendingId === route.id,
                    unavailable:
                      route._count.riders > 0
                        ? "Children have ridden this route. Stop it running instead."
                        : undefined,
                    confirm: {
                      title: `Delete ${routeShort(route)}`,
                      description:
                        "The route and its stops go for good. Only a route nobody has ever ridden can be deleted.",
                      confirmLabel: "Delete it",
                    },
                    onSelect: () => {
                      setPendingId(route.id);
                      routeAction.mutate({ id: route.id, remove: true });
                    },
                  },
                ];

                return (
                  <li
                    key={route.id}
                    className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                      <h2 className="m-0 font-medium text-[color:var(--text-strong)]">
                        {routeLabel(route)}
                      </h2>
                      <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                        {/* An empty bus says so. Left to interpolation a route
                            nobody rides renders the same "0 riding" anyway, but
                            written out it cannot quietly become a blank when
                            the billing row is missing. */}
                        {riding === 0 ? "0 riding" : `${riding} riding`}
                        {money && money.due > 0
                          ? ` · ${formatSchoolMoney(money.due)} to bill`
                          : ""}
                      </span>
                      {route.capacity ? (
                        <Badge tone={riding >= route.capacity ? "warn" : "success"}>
                          {riding} of {route.capacity} seats
                        </Badge>
                      ) : null}
                      {route.isActive ? null : <Badge tone="neutral">Not running</Badge>}
                      <span className="ml-auto">
                        <RecordActions resource="schools.students" verbs={routeVerbs} />
                      </span>
                    </div>

                    {route.stops.length === 0 ? (
                      <div className="px-3 py-2.5">
                        <span className="block text-[length:var(--type-body-sm)] font-semibold text-[color:var(--text-strong)]">
                          No stops yet
                        </span>
                        <span className="block text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          A route with no stops is a bus with nowhere to pull in.
                        </span>
                      </div>
                    ) : (
                      <ul className="divide-y divide-[color:var(--border-subtle)]">
                        {route.stops.map((stop) => (
                          <li
                            key={stop.id}
                            className="flex flex-wrap items-center gap-3 px-3 py-2"
                          >
                            <span className="min-w-0 flex-1">
                              {/* Numbered, because the number is the order the
                                  driver drives and the order the register is
                                  written in — "1. Mission Gate", then the rest. */}
                              <span className="block truncate font-medium text-[color:var(--text-strong)]">
                                {stop.sequence}. {stop.name}
                              </span>
                              <span
                                className={[
                                  "block truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums",
                                  stop.pickupMinute === null
                                    ? "text-[color:var(--tone-warn)]"
                                    : "text-[color:var(--text-muted)]",
                                ].join(" ")}
                              >
                                {stopTimes(stop)}
                              </span>
                            </span>
                            <RecordActions
                              resource="schools.students"
                              verbs={[
                                {
                                  label: "Edit",
                                  action: "edit",
                                  onSelect: () => setStopContext({ route, stop }),
                                },
                                {
                                  label: "Remove",
                                  action: "edit",
                                  tone: "danger",
                                  loading: pendingId === stop.id,
                                  confirm: {
                                    title: `Remove ${stop.name}`,
                                    description:
                                      "The bus stops pulling in here. Children picked up at this stop have to be moved to another one first.",
                                    confirmLabel: "Remove it",
                                  },
                                  onSelect: () => {
                                    setPendingId(stop.id);
                                    stopAction.mutate({ id: stop.id, remove: true });
                                  },
                                },
                              ]}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <TableControls
            tabs={views}
            search={
              <TableSearch
                label="Find a rider"
                placeholder="Name or admission number"
                value={search}
                onChange={setSearch}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Route"
                  allLabel={
                    allRoutes[0] ? routeShort(allRoutes[0]) : "Choose a route"
                  }
                  value={routeFilter}
                  options={allRoutes.map((route) => ({
                    value: route.id,
                    label: routeShort(route),
                  }))}
                  onChange={(value) => {
                    setRouteFilter(value);
                    setStopFilter("");
                  }}
                />
                <div className="min-w-0 flex-1 basis-[160px] sm:max-w-[180px]">
                  <Label htmlFor="bus-date" className="text-sm text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="bus-date"
                    type="date"
                    value={onDate}
                    onChange={(event) => setOnDate(event.target.value)}
                  />
                </div>
                <FilterSelect
                  label="Journey"
                  allLabel="Morning"
                  value={direction === "MORNING" ? "" : direction}
                  options={[{ value: "AFTERNOON", label: "Afternoon" }]}
                  onChange={(value) =>
                    setDirection(value === "AFTERNOON" ? "AFTERNOON" : "MORNING")
                  }
                />
                <FilterSelect
                  label="Stop"
                  allLabel="Every stop"
                  value={stopFilter}
                  options={[
                    ...(activeRouteRecord?.stops ?? []).map((stop) => ({
                      value: stop.id,
                      label: `${stop.sequence}. ${stop.name}`,
                    })),
                    { value: "__none__", label: "No stop set" },
                  ]}
                  onChange={setStopFilter}
                />
                <ClassFilter
                  value={classes}
                  onChange={setClasses}
                  label="Year group"
                  allLabel="Every year group"
                  includeStreams={false}
                />
              </>
            }
            actions={
              <CreateButton
                resource="schools.students"
                action="edit"
                label="Put a child on the bus"
                onSelect={() => setAddingRider(true)}
                unavailable={activeRouteRecord ? undefined : "There is no route to ride."}
              />
            }
          />

          {register ? (
            // Verbatim from the canvas: the route, then the four counts in the
            // order somebody reads them off — on, not on, unmarked, of how
            // many are expected. The date is not repeated here; it is the
            // filter three inches above, and the app bar's caption.
            <p className="text-sm text-muted-foreground">
              {routeShort(register.route)} · {register.summary.on} on,{" "}
              {register.summary.notOn} not on, {register.summary.unmarked} unmarked
              of {register.summary.expected}
            </p>
          ) : null}

          {registerQuery.isLoading ? (
            <TableRowsSkeleton
              columns={[{ avatar: true, twoLine: true }, { width: 90 }, { width: 240 }]}
            />
          ) : rows.length === 0 ? (
            allRows.length === 0 ? (
              <NothingYet
                title="Nobody rides this route this term"
                body="Put a child on the bus and they appear here every morning until they are taken off it."
                action={
                  <CreateButton
                    resource="schools.students"
                    action="edit"
                    label="Put a child on the bus"
                    onSelect={() => setAddingRider(true)}
                    unavailable={
                      activeRouteRecord ? undefined : "There is no route to ride."
                    }
                  />
                }
              />
            ) : (
              <NothingMatched
                what="riders"
                filters={[
                  stopFilter === "__none__"
                    ? "No stop set"
                    : (activeRouteRecord?.stops.find((stop) => stop.id === stopFilter)
                        ?.name ?? ""),
                  classes.classId ? "that year group" : "",
                  search.trim(),
                ].filter(Boolean)}
                onClear={
                  anyRiderFilter
                    ? () => {
                        setStopFilter("");
                        setClasses(ALL_CLASSES);
                        setSearch("");
                      }
                    : undefined
                }
              />
            )
          ) : (
            <ul className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
              {rows.map((row) => {
                const marked = marks[row.riderId] ?? row.boarding?.boarded ?? null;
                return (
                  <li
                    key={row.riderId}
                    className="flex flex-wrap items-center gap-3 px-3 py-2"
                  >
                    <PersonAvatar
                      firstName={row.student.firstName}
                      lastName={row.student.lastName}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {row.student.lastName}, {row.student.firstName}
                      </span>
                      <span className="block truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                        {riderLine(row)}
                      </span>
                    </span>
                    {marked === null ? <Badge tone="warn">Not marked</Badge> : null}
                    <span className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={marked === true ? "primary" : "secondary"}
                        onClick={() =>
                          setMarks((current) => ({ ...current, [row.riderId]: true }))
                        }
                      >
                        On
                      </Button>
                      <Button
                        size="sm"
                        variant={marked === false ? "danger" : "secondary"}
                        onClick={() =>
                          setMarks((current) => ({ ...current, [row.riderId]: false }))
                        }
                      >
                        Not on
                      </Button>
                    </span>
                    <RecordActions
                      resource="schools.students"
                      verbs={[
                        {
                          label: "Move stop",
                          action: "edit",
                          unavailable:
                            (activeRouteRecord?.stops.length ?? 0) === 0
                              ? "This route has no stops to move them to."
                              : undefined,
                          onSelect: () => setMovingRider(row),
                        },
                        {
                          label: "Off the bus",
                          action: "edit",
                          tone: "danger",
                          loading: pendingId === row.riderId,
                          confirm: {
                            title: "Take them off the bus",
                            description: `${row.student.firstName} ${row.student.lastName} stops riding for the rest of the term and drops off tomorrow's register. The term's transport fee already billed is not undone.`,
                            confirmLabel: "Take them off",
                          },
                          onSelect: () => {
                            setPendingId(row.riderId);
                            riderAction.mutate({ id: row.riderId, remove: true });
                          },
                        },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <RouteDialog
        open={addingRoute || editingRoute !== null}
        route={editingRoute}
        onClose={() => {
          setAddingRoute(false);
          setEditingRoute(null);
        }}
      />
      <StopDialog
        open={stopContext !== null}
        route={stopContext?.route ?? null}
        stop={stopContext?.stop ?? null}
        onClose={() => setStopContext(null)}
      />
      <RiderDialog
        open={addingRider || movingRider !== null}
        route={activeRouteRecord}
        rider={movingRider}
        onClose={() => {
          setAddingRider(false);
          setMovingRider(null);
        }}
      />
    </div>
  );
}

/* ── routes ──────────────────────────────────────────────────────────── */

type RouteDraft = {
  code: string;
  name: string;
  driverName: string;
  driverPhone: string;
  vehicleReg: string;
  capacity: string;
  termFee: string;
};

const EMPTY_ROUTE: RouteDraft = {
  code: "",
  name: "",
  driverName: "",
  driverPhone: "",
  vehicleReg: "",
  capacity: "",
  termFee: "",
};

function RouteDialog({
  open,
  route,
  onClose,
}: {
  open: boolean;
  route: Route | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RouteDraft>(EMPTY_ROUTE);
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setDraft(
      route
        ? {
            code: route.code,
            name: route.name,
            driverName: route.driverName ?? "",
            driverPhone: route.driverPhone ?? "",
            vehicleReg: route.vehicleReg ?? "",
            capacity: route.capacity != null ? String(route.capacity) : "",
            termFee: route.termFee != null ? String(Number(route.termFee)) : "",
          }
        : EMPTY_ROUTE,
    );
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name.trim(),
        driverName: draft.driverName.trim() || null,
        driverPhone: draft.driverPhone.trim() || null,
        vehicleReg: draft.vehicleReg.trim() || null,
        capacity: draft.capacity.trim() ? Number(draft.capacity.trim()) : null,
        termFee: draft.termFee.trim() ? Number(draft.termFee.trim()) : null,
      };
      return route
        ? fetchJson(`/api/v2/schools/transport/routes/${route.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...body, code: draft.code.trim() }),
          })
        : fetchJson("/api/v2/schools/transport", {
            method: "POST",
            body: JSON.stringify({ action: "route", ...body, code: draft.code.trim() }),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "transport"] });
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
      title={route ? routeShort(route) : "Add a route"}
      description="The bus, who drives it, how many it seats and what a term on it costs."
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
            {route ? "Save the route" : "Add the route"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="route-code">Code</Label>
          <Input
            id="route-code"
            required
            value={draft.code}
            placeholder="R2"
            onChange={(event) =>
              setDraft((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-name">Where it goes</Label>
          <Input
            id="route-name"
            required
            value={draft.name}
            placeholder="Chishawasha"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-driver">Driver</Label>
          <Input
            id="route-driver"
            value={draft.driverName}
            placeholder="Mr Katsande"
            onChange={(event) =>
              setDraft((current) => ({ ...current, driverName: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Left blank the route reads &ldquo;no driver named&rdquo; on every screen,
            which is the point — an unnamed driver is a gap, not a detail.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-driver-phone">Driver&rsquo;s number</Label>
          <Input
            id="route-driver-phone"
            value={draft.driverPhone}
            onChange={(event) =>
              setDraft((current) => ({ ...current, driverPhone: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-vehicle">Vehicle</Label>
          <Input
            id="route-vehicle"
            value={draft.vehicleReg}
            placeholder="AEK 4412"
            onChange={(event) =>
              setDraft((current) => ({ ...current, vehicleReg: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-capacity">Seats</Label>
          <Input
            id="route-capacity"
            type="number"
            min={1}
            value={draft.capacity}
            onChange={(event) =>
              setDraft((current) => ({ ...current, capacity: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            The bus fills to this and then refuses the next child.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="route-fee">Fee a term</Label>
          <Input
            id="route-fee"
            type="number"
            min={0}
            step="0.01"
            value={draft.termFee}
            onChange={(event) =>
              setDraft((current) => ({ ...current, termFee: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            Reported on this screen, never posted. Charging for it belongs with the fee
            run.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}

/* ── stops ───────────────────────────────────────────────────────────── */

function StopDialog({
  open,
  route,
  stop,
  onClose,
}: {
  open: boolean;
  route: Route | null;
  stop: Stop | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sequence, setSequence] = useState("");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setName(stop?.name ?? "");
    setSequence(stop ? String(stop.sequence) : String((route?.stops.length ?? 0) + 1));
    setPickup(stop ? (clock(stop.pickupMinute) ?? "") : "");
    setDrop(stop ? (clock(stop.dropMinute) ?? "") : "");
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        sequence: Number(sequence),
        pickupMinute: toMinute(pickup),
        dropMinute: toMinute(drop),
      };
      if (stop) {
        return fetchJson(`/api/v2/schools/transport/stops/${stop.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      if (!route) throw new Error("No route chosen");
      return fetchJson("/api/v2/schools/transport", {
        method: "POST",
        body: JSON.stringify({ action: "stop", routeId: route.id, ...body }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "transport"] });
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
      title={stop ? stop.name : "Add a stop"}
      description={
        route ? `Where ${route.code} pulls in, and when.` : "Where the bus pulls in."
      }
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
            {stop ? "Save the stop" : "Add the stop"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stop-name">Stop</Label>
          <Input
            id="stop-name"
            required
            value={name}
            placeholder="Chishawasha Shops"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stop-sequence">Position on the route</Label>
          <Input
            id="stop-sequence"
            type="number"
            min={1}
            required
            value={sequence}
            onChange={(event) => setSequence(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            The order the driver drives, and the order the register is written in.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stop-pickup">Pick up</Label>
          <Input
            id="stop-pickup"
            type="time"
            value={pickup}
            onChange={(event) => setPickup(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stop-drop">Drop</Label>
          <Input
            id="stop-drop"
            type="time"
            value={drop}
            onChange={(event) => setDrop(event.target.value)}
          />
        </div>
      </div>
    </RecordDialog>
  );
}

/* ── riders ──────────────────────────────────────────────────────────── */

/**
 * Putting a child on the bus, and moving them to another stop.
 *
 * One dialog because it is one question with the child already answered in the
 * second case. Which route a rider is on is not editable: that is ending one
 * ridership and starting another, and the new bus has its own seat count.
 */
function RiderDialog({
  open,
  route,
  rider,
  onClose,
}: {
  open: boolean;
  route: Route | null;
  /** Set when moving somebody who already rides; null when adding. */
  rider: RegisterRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [stopId, setStopId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setStudentId(rider?.student.id ?? "");
    setStopId(rider?.stop?.id ?? "");
  });

  const studentsQuery = useQuery({
    queryKey: ["schools", "transport", "candidates"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300, status: "ACTIVE" }),
    enabled: open && !rider,
  });

  const save = useMutation({
    mutationFn: () => {
      if (rider) {
        return fetchJson(`/api/v2/schools/transport/riders/${rider.riderId}`, {
          method: "PATCH",
          body: JSON.stringify({ stopId: stopId || null }),
        });
      }
      if (!route) throw new Error("No route chosen");
      return fetchJson("/api/v2/schools/transport", {
        method: "POST",
        body: JSON.stringify({
          action: "rider",
          routeId: route.id,
          studentId,
          stopId: stopId || null,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "transport"] });
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
      title={
        rider
          ? `${rider.student.lastName}, ${rider.student.firstName}`
          : "Put a child on the bus"
      }
      description={
        route ? routeShort(route) : "Choose a route on the register first."
      }
      size="sm"
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
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!rider && !studentId}
          >
            {rider ? "Move them" : "Put them on"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {rider ? null : (
          <FilterSelect
            label="Child"
            allLabel="Choose a child"
            className="space-y-2"
            value={studentId}
            options={(studentsQuery.data?.data ?? []).map((student) => ({
              value: student.id,
              label: `${student.lastName}, ${student.firstName} · ${student.studentNo}`,
            }))}
            onChange={setStudentId}
          />
        )}
        <FilterSelect
          label="Stop"
          allLabel="No stop set"
          className="space-y-2"
          value={stopId}
          options={(route?.stops ?? []).map((stop) => ({
            value: stop.id,
            label: `${stop.sequence}. ${stop.name}${clock(stop.pickupMinute) ? ` · ${clock(stop.pickupMinute)}` : ""}`,
          }))}
          onChange={setStopId}
        />
        <p className="text-sm text-muted-foreground">
          A child with no stop still rides — they appear on the register as &ldquo;no stop
          set&rdquo;, which is the driver&rsquo;s cue to ask.
        </p>
      </div>
    </RecordDialog>
  );
}
