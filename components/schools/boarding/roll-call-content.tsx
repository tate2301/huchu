"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, toast } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  ListRowsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { fetchJson } from "@/lib/api-client";
import { rollCallSummary, type RollCallTally } from "@/lib/schools/boarding-roll-call";
import { cn } from "@/lib/utils";

import {
  fetchHostelOccupancy,
  fetchHostels,
  type BoardingHostel,
} from "@/components/schools/boarding/boarding-data";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";

/**
 * Who is in the building tonight, dormitory by dormitory.
 *
 * ## What the screen is for
 *
 * One number: how many names nobody has looked at yet. Everything on the page
 * exists to drive it to zero and then let the warden sign the register off.
 * `canSubmit` in `lib/schools/boarding-roll-call.ts` is the rule — while
 * anybody is `NOT_SEEN` the sign-off is refused, because submitting then would
 * record "we checked" when nobody did.
 *
 * ## Who is already accounted for
 *
 * A child signed out at the gate is not a child the warden failed to find, and
 * a child in the sick bay is two doors away with a temperature. The server
 * seeds their entries `SIGNED_OUT` and `SICK_BAY` when the night opens, so
 * **they need no tick** — their rows say where they are and are not pressable.
 * Making somebody tick past them is exactly how the count stops being a check
 * and becomes a ritual.
 *
 * ## Why this is a grouped list and not a table
 *
 * A roll call is taken walking down a dormitory, which is why the rows are
 * grouped by room and each group carries its own "Everyone here". A sortable,
 * filterable, paginated table of the same names would be a worse instrument
 * for the one job: reading the room in front of you and pressing the names in
 * it. The dormitory order comes from the beds, so the list is in the order
 * somebody physically walks.
 *
 * ## `ABSENT` is an answer, `NOT_SEEN` is not
 *
 * "Not here" is a real state a warden asserts, and it does not block the
 * sign-off — a child looked for and not found is an answer, and a bad one, but
 * it is the warden's to give and the phone call starts from there. Nothing on
 * this screen can put a name back to `NOT_SEEN`; the API refuses it, and it
 * would make "we have not counted yet" something a person can claim.
 */

type EntryStatus = "NOT_SEEN" | "PRESENT" | "SIGNED_OUT" | "SICK_BAY" | "ABSENT";

type RollCallEntry = {
  id: string;
  studentId: string;
  bedId: string | null;
  status: EntryStatus;
  notes: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    isPrefect: boolean;
  };
};

type RollCall = {
  id: string;
  status: "OPEN" | "SUBMITTED";
  session: "MORNING" | "EVENING";
  takenOn: string;
  submittedAt: string | null;
  hostel: { id: string; code: string; name: string };
  term: { id: string; code: string; name: string };
  takenBy: { id: string; name: string | null; email: string };
  entries: RollCallEntry[];
  tally: RollCallTally;
  summary: string;
  canSubmit: boolean;
};

const SESSIONS = [
  { value: "EVENING", label: "Evening" },
  { value: "MORNING", label: "Morning" },
];

const STATUS_LABEL: Record<EntryStatus, string> = {
  NOT_SEEN: "Not ticked",
  PRESENT: "In",
  SIGNED_OUT: "Signed out",
  SICK_BAY: "Sick bay",
  ABSENT: "Not here",
};

const STATUS_TONE: Record<EntryStatus, "neutral" | "success" | "warn" | "danger"> = {
  NOT_SEEN: "neutral",
  PRESENT: "success",
  SIGNED_OUT: "warn",
  SICK_BAY: "danger",
  ABSENT: "danger",
};

/** A status the warden asserted, as opposed to one the school already knew. */
function isAccountedForElsewhere(status: EntryStatus): boolean {
  return status === "SIGNED_OUT" || status === "SICK_BAY";
}

function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`;
}

export function RollCallContent() {
  const queryClient = useQueryClient();

  const [hostelId, setHostelId] = useState("");
  const [session, setSession] = useState("EVENING");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const hostelsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels"],
    queryFn: fetchHostels,
  });

  const houses = useMemo<BoardingHostel[]>(
    () => (hostelsQuery.data ?? []).filter((hostel) => hostel.isActive),
    [hostelsQuery.data],
  );

  // No house chosen means the first one, derived rather than written into
  // state once the query lands. Seeding state from a query needs an effect
  // that fires after the first paint, so the screen would render houseless for
  // a frame and a warden who was quick could open the wrong register.
  const activeHouseId = hostelId || houses[0]?.id || "";

  /**
   * Opening the night's register is a POST that is safe to repeat.
   *
   * `POST /roll-calls` opens tonight's count for a house or hands back the one
   * already open — the unique index on (house, night, session) is what makes
   * that true even when two wardens press at the same moment. So it is read
   * here as a query: arriving on the screen, refreshing it, or a phone coming
   * back from sleep all land on the same register rather than making a second
   * one.
   */
  const rollCallQuery = useQuery({
    queryKey: ["schools", "boarding", "roll-call", activeHouseId, session],
    enabled: Boolean(activeHouseId),
    queryFn: () =>
      fetchJson<RollCall>("/api/v2/schools/boarding/roll-calls", {
        method: "POST",
        body: JSON.stringify({ hostelId: activeHouseId, session }),
      }),
  });

  /*
   * The beds, only so the names can be put in the order somebody walks them.
   * A roll-call entry knows which bed a child was in but not which room it is
   * in, and a register that lists a house alphabetically is a register taken
   * standing in a corridor.
   */
  const occupancyQuery = useQuery({
    queryKey: ["schools", "boarding", "board", activeHouseId],
    enabled: Boolean(activeHouseId),
    queryFn: () => fetchHostelOccupancy(activeHouseId),
  });

  const rollCall = rollCallQuery.data ?? null;

  const bedIndex = useMemo(() => {
    const index = new Map<string, { roomId: string; roomCode: string; bedCode: string }>();
    for (const bed of occupancyQuery.data?.beds ?? []) {
      index.set(bed.id, {
        roomId: bed.room.id,
        roomCode: bed.room.code,
        bedCode: bed.code,
      });
    }
    return index;
  }, [occupancyQuery.data]);

  const needle = search.trim().toLowerCase();

  /** The register, split into the dormitories it is walked in. */
  const dormitories = useMemo(() => {
    if (!rollCall) return [];
    const groups = new Map<
      string,
      { id: string; name: string; rows: { entry: RollCallEntry; bedCode: string | null }[] }
    >();

    for (const entry of rollCall.entries) {
      const place = entry.bedId ? bedIndex.get(entry.bedId) : undefined;
      const key = place?.roomId ?? "off-plan";
      const name = place ? `Room ${place.roomCode}` : "No bed recorded";
      const group = groups.get(key) ?? { id: key, name, rows: [] };
      group.rows.push({ entry, bedCode: place?.bedCode ?? null });
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      group.rows.sort((left, right) => {
        const byBed = (left.bedCode ?? "~").localeCompare(right.bedCode ?? "~");
        if (byBed !== 0) return byBed;
        return fullName(left.entry.student).localeCompare(fullName(right.entry.student));
      });
    }

    return [...groups.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((group) => ({
        ...group,
        // Searching narrows the names on screen without changing the count the
        // page is about: the "to go" figure is the whole house or it is not
        // worth driving to zero.
        rows: needle
          ? group.rows.filter((row) =>
              `${fullName(row.entry.student)} ${row.entry.student.studentNo} ${row.bedCode ?? ""}`
                .toLowerCase()
                .includes(needle),
            )
          : group.rows,
      }))
      .filter((group) => group.rows.length > 0);
  }, [rollCall, bedIndex, needle]);

  const setStatus = useMutation({
    mutationFn: (input: { studentId: string; status: Exclude<EntryStatus, "NOT_SEEN"> }) => {
      if (!rollCall) throw new Error("No roll call is open");
      return fetchJson<RollCall>(
        `/api/v2/schools/boarding/roll-calls/${rollCall.id}/entries`,
        { method: "PATCH", body: JSON.stringify(input) },
      );
    },
    onSettled: () => setSavingId(null),
    onSuccess: (updated) => {
      // The handler answers with the whole register, tally and all, so the
      // counts on screen move with the tick rather than after a round trip
      // that fetches the same rows again.
      queryClient.setQueryData(
        ["schools", "boarding", "roll-call", activeHouseId, session],
        updated,
      );
    },
  });

  const markEveryone = useMutation({
    mutationFn: async (studentIds: string[]) => {
      if (!rollCall) throw new Error("No roll call is open");
      let latest: RollCall | null = null;
      // One at a time. A dormitory is thirty names and the handler recomputes
      // the register on each, so firing them together would have the last
      // answer back overwrite an earlier one and leave a tick missing on
      // screen that is present in the database.
      for (const studentId of studentIds) {
        latest = await fetchJson<RollCall>(
          `/api/v2/schools/boarding/roll-calls/${rollCall.id}/entries`,
          { method: "PATCH", body: JSON.stringify({ studentId, status: "PRESENT" }) },
        );
      }
      return latest;
    },
    onSettled: () => setSavingId(null),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(
        ["schools", "boarding", "roll-call", activeHouseId, session],
        updated,
      );
    },
  });

  const submit = useMutation({
    mutationFn: () => {
      if (!rollCall) throw new Error("No roll call is open");
      return fetchJson<RollCall>(`/api/v2/schools/boarding/roll-calls/${rollCall.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "submit" }),
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(
        ["schools", "boarding", "roll-call", activeHouseId, session],
        updated,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      toast(`${updated.hostel.name} is signed off.`, {
        tone: "success",
        description: updated.summary,
      });
    },
  });

  const tally = rollCall?.tally;
  const submitted = rollCall?.status === "SUBMITTED";
  const loading = hostelsQuery.isPending || rollCallQuery.isPending;
  const busy = setStatus.isPending || markEveryone.isPending;

  const tick = (studentId: string, status: Exclude<EntryStatus, "NOT_SEEN">) => {
    setSavingId(studentId);
    setStatus.mutate({ studentId, status });
  };

  return (
    <>
      <PageChrome title="Roll call">
        <Button
          variant="primary"
          loading={submit.isPending}
          disabled={!rollCall?.canSubmit || submit.isPending}
          title={
            submitted
              ? "This register has already been signed off."
              : rollCall && !rollCall.canSubmit
                ? `${rollCall.tally.notSeen} still to account for — nobody goes to bed until this is zero.`
                : undefined
          }
          onClick={() => submit.mutate()}
        >
          Sign the register off
        </Button>
      </PageChrome>

      {hostelsQuery.error ? (
        <LoadError
          what="the houses"
          error={hostelsQuery.error}
          onRetry={() => void hostelsQuery.refetch()}
        />
      ) : null}
      {rollCallQuery.error ? (
        <LoadError
          what="tonight's register"
          error={rollCallQuery.error}
          onRetry={() => void rollCallQuery.refetch()}
        />
      ) : null}
      {setStatus.error ? <SaveError what="That tick" error={setStatus.error} /> : null}
      {markEveryone.error ? (
        <SaveError what="That dormitory" error={markEveryone.error} />
      ) : null}
      {submit.error ? <SaveError what="The register" error={submit.error} /> : null}

      <TableControls
        tabs={<BoardingViews hostels={houses.length} rollCall={tally?.notSeen} />}
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Find a name or a bed"
          />
        }
        filters={
          <>
            <FilterSelect
              label="House"
              allLabel={houses[0]?.name ?? "Choose a house"}
              value={hostelId}
              options={houses.map((house) => ({ value: house.id, label: house.name }))}
              onChange={setHostelId}
            />
            <FilterSelect
              label="Count"
              allLabel="Evening"
              value={session === "EVENING" ? "" : session}
              options={SESSIONS.filter((option) => option.value !== "EVENING")}
              onChange={(value) => setSession(value || "EVENING")}
            />
          </>
        }
        count={tally ? `${tally.total} on the roll` : null}
      />

      {loading ? (
        <ListRowsSkeleton rows={10} label="Opening tonight's register" />
      ) : !rollCall ? (
        <NothingYet
          title="There is no house to take a register in"
          body="A boarding house and its beds come first; after that this is where the night's count lives."
          action={
            <Button asChild variant="secondary">
              <Link href="/schools/boarding/hostels">Open hostels</Link>
            </Button>
          }
        />
      ) : rollCall.entries.length === 0 ? (
        <NothingYet
          title={`Nobody is boarding in ${rollCall.hostel.name}`}
          body="A register is the house's allocations at lights-out, so it stays empty until somebody has a bed here."
          action={
            <Button asChild variant="secondary">
              <Link href="/schools/boarding/allocations">Open allocations</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Below the controls, not above them. This is not a band of standing
              totals (§2) — it is the answer to the question the filters above
              just asked, recomputed on every tick, and it is the one thing the
              page exists to move. */}
          <RollCallProgress tally={rollCall.tally} />

          {submitted ? (
            <Alert tone="success" title="Signed off">
              {rollCall.summary}
              {rollCall.takenBy.name ? ` — by ${rollCall.takenBy.name}.` : "."} Nothing on
              this register can be changed now.
            </Alert>
          ) : rollCall.tally.notSeen === 0 ? (
            <Alert
              tone="success"
              title="Everybody accounted for"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  loading={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  Sign it off
                </Button>
              }
            >
              {rollCall.summary}
            </Alert>
          ) : (
            <Alert tone="warn" title={rollCallSummary(rollCall.tally)}>
              Nobody goes to bed until that is zero. Signed-out and sick-bay pupils are
              already accounted for and need no tick.
            </Alert>
          )}

          <SavingOverlay saving={busy} label="Marking the register…">
            <div className="space-y-5">
              {dormitories.map((dormitory) => {
                const outstanding = dormitory.rows
                  .filter((row) => row.entry.status === "NOT_SEEN")
                  .map((row) => row.entry.studentId);

                return (
                  <section key={dormitory.id} aria-label={dormitory.name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--border)] pb-1.5">
                      <h2 className="text-sm font-semibold text-[color:var(--text-strong)]">
                        {dormitory.name}
                        <span className="pl-2 font-normal text-[color:var(--text-subtle)]">
                          {dormitory.rows.length} on the roll
                          {outstanding.length > 0
                            ? ` · ${outstanding.length} to go`
                            : " · all accounted for"}
                        </span>
                      </h2>
                      {outstanding.length > 0 && !submitted ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setSavingId(dormitory.id);
                            markEveryone.mutate(outstanding);
                          }}
                        >
                          Everyone here
                        </Button>
                      ) : null}
                    </div>

                    <ul className="divide-y divide-[color:var(--border-subtle)]">
                      {dormitory.rows.map(({ entry, bedCode }) => (
                        <RollCallRow
                          key={entry.id}
                          entry={entry}
                          bedCode={bedCode}
                          locked={submitted}
                          saving={savingId === entry.studentId}
                          onTick={tick}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {dormitories.length === 0 ? (
                <NothingLeftToDo
                  title="No name here matches that search"
                  body={`Nobody in ${rollCall.hostel.name} is called “${search.trim()}”.`}
                  action={
                    <Button variant="secondary" onClick={() => setSearch("")}>
                      Clear the search
                    </Button>
                  }
                />
              ) : null}
            </div>
          </SavingOverlay>
        </div>
      )}
    </>
  );
}

/**
 * In, signed out, in the sick bay, and still to find — as one bar.
 *
 * The lengths are the real proportions, so the bar says what the count is
 * doing at arm's length, and the sentence under it says it precisely for
 * anybody who cannot read a colour.
 */
function RollCallProgress({ tally }: { tally: RollCallTally }) {
  const total = Math.max(1, tally.total);
  const share = (value: number) => `${((value / total) * 100).toFixed(1)}%`;

  return (
    <div className="space-y-1.5">
      <div
        role="img"
        aria-label={rollCallSummary(tally)}
        className="flex h-2 w-full overflow-hidden rounded-[var(--radius-pill)] bg-[color:var(--surface-sunken)]"
      >
        <span style={{ width: share(tally.present), background: "var(--tone-success)" }} />
        <span style={{ width: share(tally.signedOut), background: "var(--tone-warn)" }} />
        <span style={{ width: share(tally.sickBay), background: "var(--tone-danger)" }} />
        <span
          style={{ width: share(tally.absent), background: "var(--tone-danger-strong)" }}
        />
      </div>
      <p className="font-mono text-xs tabular-nums text-[color:var(--text-subtle)]">
        {tally.present} in · {tally.signedOut} signed out · {tally.sickBay} sick bay
        {tally.absent > 0 ? ` · ${tally.absent} not here` : ""} · {tally.notSeen} not yet
      </p>
    </div>
  );
}

/**
 * One name on the register.
 *
 * The whole row is the tick target, because at nine o'clock somebody is
 * holding a torch and reading down a wall of beds. A pupil the school already
 * accounts for is not a target at all — their row says where they are and
 * stays out of the way.
 */
function RollCallRow({
  entry,
  bedCode,
  locked,
  saving,
  onTick,
}: {
  entry: RollCallEntry;
  bedCode: string | null;
  locked: boolean;
  saving: boolean;
  onTick: (studentId: string, status: Exclude<EntryStatus, "NOT_SEEN">) => void;
}) {
  const elsewhere = isAccountedForElsewhere(entry.status);
  const present = entry.status === "PRESENT";
  const pressable = !locked && !elsewhere;

  const verbs: RecordVerb[] = [
    {
      label: "Not here",
      action: "edit",
      tone: "warning",
      loading: saving,
      onSelect: () => onTick(entry.studentId, "ABSENT"),
    },
    {
      label: "In the sick bay",
      action: "edit",
      loading: saving,
      onSelect: () => onTick(entry.studentId, "SICK_BAY"),
    },
  ];

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[5px] border text-xs font-bold leading-none",
          present
            ? "border-[color:var(--tone-success)] bg-[color:var(--tone-success)] text-[color:var(--surface)]"
            : elsewhere
              ? "border-transparent text-[color:var(--text-subtle)]"
              : "border-[color:var(--border-strong)] text-transparent",
        )}
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[color:var(--text-strong)]">
          {fullName(entry.student)}
          {entry.student.isPrefect ? (
            <span className="pl-1.5 text-xs font-normal text-[color:var(--text-subtle)]">
              prefect
            </span>
          ) : null}
        </span>
        <span className="block truncate font-mono text-xs text-[color:var(--text-subtle)]">
          {entry.student.studentNo}
          {bedCode ? ` · bed ${bedCode}` : " · no bed recorded"}
        </span>
      </span>
      <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
    </>
  );

  return (
    <li className="flex items-center gap-2">
      {pressable ? (
        <button
          type="button"
          aria-pressed={present}
          aria-label={`${fullName(entry.student)} — ${present ? "ticked in" : "tick in"}`}
          disabled={saving}
          onClick={() => onTick(entry.studentId, "PRESENT")}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-[color:var(--surface-sunken)] disabled:opacity-50"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2">{body}</span>
      )}

      {pressable ? (
        <RecordActions
          layout="menu"
          resource="schools.boarding"
          label={`Other marks for ${fullName(entry.student)}`}
          verbs={verbs}
        />
      ) : null}
    </li>
  );
}
