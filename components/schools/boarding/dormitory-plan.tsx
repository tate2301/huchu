"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A dormitory, drawn as the room actually is.
 *
 * Thirty-two beds down two walls with an aisle between them is the normal
 * case, so a dormitory is its **two wall runs, a bay per bunk or single bed,
 * upper and lower stacked**. Drawing it as a grid of four-bed cards was the
 * mistake in the pass before this one: a grid can tell you a number, and the
 * number is the one thing a warden could already get from a count. The plan
 * tells them *which end of the room* is empty, which is the question they
 * actually walked in with.
 *
 * ## One drawing, two sizes, and the size follows the scope
 *
 * `mini` is the same drawing at 18px with the text removed. That is the whole
 * scaling idea — a house of four dormitories and a school of forty are the
 * same picture at different sizes, so nobody has to learn a second
 * representation to see more at once. It is not a summary of the plan and not
 * a bar: every bed that exists is still a bed on screen, in its real place.
 *
 * ## A free bed is a thing, not an absence
 *
 * A free bed is drawn — dashed, with a `+` — rather than being left as a hole
 * in the picture. A list of allocations can say who is in the house and never
 * where there is space.
 *
 * **Out of service is not free.** A broken bed is hatched, carries the reason
 * on its tooltip, and is never offered to the placer. See
 * `lib/schools/boarding-rules.ts`, which refuses it rather than filtering it
 * out, so one place decides whether a bed can take a child.
 *
 * The geometry lives in `bay` and `tier` columns, not in the bed's code. "04U"
 * is a naming convention a school is free to break, and a drawing that guesses
 * at a room's shape from a string is a drawing that silently misplaces a child
 * the first time somebody types "4-upper".
 */

/* ── what the drawing is made of ─────────────────────────────────────── */

export type PlanOccupant = {
  id: string;
  /** Shown on the tooltip: "Tendai Moyo". */
  name: string;
  /** Two letters, shown in the bed at full size. */
  initials: string;
  /** Their admission number, for the tooltip's second half. */
  reference?: string;
  /** Away at the gate tonight — a mark, not an empty bed. */
  signedOut?: boolean;
  /** In the sick bay. Their bed is HELD, not freed, so it stays theirs. */
  sickBay?: boolean;
  isPrefect?: boolean;
};

export type PlanBed = {
  id: string;
  /** The code a warden reads out: "12U". */
  code: string;
  /** Which bunk along the wall. Null means the room's plan is not recorded. */
  bay: number | null;
  /** "U" or "L" of that bunk; null for a single bed. */
  tier: string | null;
  /** AVAILABLE, or anything else meaning it cannot be slept in. */
  status: string;
  /** "Bunk ladder broken · joiner Thursday". */
  statusReason?: string | null;
  occupant: PlanOccupant | null;
  /**
   * Why this bed cannot take the pupil in hand — `bedRefusal`'s sentence,
   * verbatim. A bed carrying one is dimmed and cannot be pressed, and the
   * sentence is its tooltip: "Nyanga House takes boys only" tells a warden
   * they picked the wrong house, where "not eligible" tells them nothing.
   */
  refusal?: string | null;
  /** Cleared for the pupil in hand, and worth pointing at. */
  offered?: boolean;
  /** In a fill that has been batched but not committed. */
  pending?: boolean;
};

export type PlanRoom = {
  id: string;
  /** What the room is called on the plan — its code, or a fuller name. */
  name: string;
  floor?: string | null;
  isPrefectDorm?: boolean;
  beds: PlanBed[];
};

export type PlanSize = "mini" | "full";

/* ── the numbers the drawing is built from ───────────────────────────── */

/**
 * Both sizes in one table, because they are one drawing. Changing a gap here
 * changes it in the house's four plans and the school's forty at once, which
 * is the property that keeps them the same picture.
 */
const METRICS = {
  full: {
    bed: { width: 38, height: 30, radius: 6 },
    runGap: 5,
    runPad: 6,
    bayGap: 3,
    stackGap: 2,
    padding: "14px 16px 12px",
    planGap: 2,
  },
  mini: {
    bed: { width: 18, height: 14, radius: 3 },
    runGap: 3,
    runPad: 3,
    bayGap: 2,
    stackGap: 1,
    padding: "11px 13px 9px",
    planGap: 0,
  },
} as const;

/** The hatch that means a bed cannot be slept in, at either size. */
const HATCH =
  "repeating-linear-gradient(135deg, var(--surface-muted), var(--surface-muted) 4px, var(--hairline) 4px, var(--hairline) 8px)";
const HATCH_MINI =
  "repeating-linear-gradient(135deg, var(--surface-muted), var(--surface-muted) 2px, transparent 2px, transparent 4px)";

export function isBedFree(bed: PlanBed): boolean {
  return bed.occupant === null && bed.status === "AVAILABLE";
}

export function isBedOutOfService(bed: PlanBed): boolean {
  return bed.status !== "AVAILABLE" && bed.occupant === null;
}

export type PlanStats = {
  total: number;
  taken: number;
  /** Beds that can be slept in tonight. Out of service is NOT counted here. */
  free: number;
  outOfService: number;
  /** Beds that exist and work — the denominator a warden means by "of". */
  usable: number;
};

export function planStats(beds: readonly PlanBed[]): PlanStats {
  const taken = beds.filter((bed) => bed.occupant !== null).length;
  const outOfService = beds.filter((bed) => isBedOutOfService(bed)).length;
  const free = beds.filter((bed) => isBedFree(bed)).length;
  return {
    total: beds.length,
    taken,
    free,
    outOfService,
    usable: beds.length - outOfService,
  };
}

/** How the plan describes itself in a line: "24 of 30 taken · 6 free". */
export function planSentence(stats: PlanStats): string {
  const parts = [`${stats.taken} of ${stats.usable} taken`];
  if (stats.free > 0) parts.push(`${stats.free} free`);
  if (stats.outOfService > 0) parts.push(`${stats.outOfService} out of service`);
  return parts.join(" · ");
}

/**
 * The bays of a room, low to high.
 *
 * A bed with no bay recorded is not given a made-up one. It is reported by
 * `bedsOffPlan` instead, so the room says "three beds are not on the plan"
 * rather than drawing them somewhere they are not.
 */
export function planBays(beds: readonly PlanBed[]): number[] {
  return [...new Set(beds.map((bed) => bed.bay).filter((bay): bay is number => bay !== null))].sort(
    (a, b) => a - b,
  );
}

export function bedsOffPlan(beds: readonly PlanBed[]): PlanBed[] {
  return beds.filter((bed) => bed.bay === null);
}

/** Upper over lower, the way the bunk is. A single bed sorts with the lower. */
function byTier(a: PlanBed, b: PlanBed): number {
  return (a.tier === "U" ? 0 : 1) - (b.tier === "U" ? 0 : 1);
}

/* ── one bed ─────────────────────────────────────────────────────────── */

function BedButton({
  bed,
  size,
  onPress,
}: {
  bed: PlanBed;
  size: PlanSize;
  onPress?: (bed: PlanBed) => void;
}) {
  const mini = size === "mini";
  const metrics = METRICS[size].bed;
  const occupant = bed.occupant;
  const out = isBedOutOfService(bed);
  const refused = Boolean(bed.refusal);

  const style: CSSProperties = {
    width: metrics.width,
    height: metrics.height,
    borderRadius: metrics.radius,
    fontSize: mini ? 0 : occupant ? 11 : 14,
  };

  let title: string;
  if (out) {
    title = bed.statusReason
      ? `Bed ${bed.code} — out of service: ${bed.statusReason}`
      : `Bed ${bed.code} — out of service`;
  } else if (occupant) {
    title = [occupant.name, occupant.reference, `bed ${bed.code}`].filter(Boolean).join(" · ");
  } else {
    title = `Bed ${bed.code} — free`;
  }
  // The refusal replaces the tooltip rather than joining it. Somebody pressing
  // a dimmed bed is asking one question, and the sentence is the answer.
  if (bed.refusal) title = bed.refusal;

  if (out) {
    style.background = mini ? HATCH_MINI : HATCH;
    style.boxShadow = mini ? "inset 0 0 0 1px var(--border)" : undefined;
    style.border = mini ? "0" : "1px solid var(--border)";
    style.color = "var(--text-subtle)";
    if (!mini) style.fontSize = 12;
  } else if (occupant) {
    style.background = mini ? "var(--border-strong)" : "var(--surface-muted)";
    style.border = mini ? "0" : "1px solid var(--border)";
    style.color = "var(--text-body)";
    if (bed.pending) {
      style.background = mini ? "var(--brand)" : "var(--brand-soft)";
      style.border = mini ? "0" : "1.5px solid var(--brand)";
      style.color = "var(--brand-strong)";
    }
  } else {
    style.background = "transparent";
    style.border = "1px dashed var(--border-strong)";
    style.color = "var(--text-subtle)";
    style.fontWeight = 400;
    if (bed.offered) {
      style.background = "var(--brand-soft)";
      style.border = "1px dashed var(--brand)";
      style.color = "var(--brand-strong)";
    }
  }
  if (refused) {
    style.opacity = 0.2;
  }

  const marks: ReactNode[] = [];
  if (occupant?.signedOut) marks.push(<Mark key="out" tone="var(--tone-warn)" size={size} label="Signed out" />);
  if (occupant?.sickBay) marks.push(<Mark key="sick" tone="var(--tone-danger)" size={size} label="In the sick bay" />);
  if (occupant?.isPrefect && !occupant.signedOut && !occupant.sickBay) {
    marks.push(<Mark key="pref" tone="var(--brand)" size={size} label="Prefect" />);
  }

  const face = mini ? "" : out ? "×" : occupant ? occupant.initials : "+";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-disabled={refused || undefined}
      onClick={refused || !onPress ? undefined : () => onPress(bed)}
      style={style}
      className={cn(
        "relative flex shrink-0 items-center justify-center font-semibold leading-none",
        "transition-[box-shadow,transform] duration-150",
        refused
          ? "pointer-events-none"
          : mini
            ? "hover:shadow-[0_0_0_2px_var(--brand)]"
            : "hover:-translate-y-px hover:shadow-[var(--shadow-hover)]",
        onPress && !refused ? "cursor-pointer" : "cursor-default",
      )}
    >
      {bed.tier && !mini ? (
        <span
          aria-hidden="true"
          className="absolute left-[2px] top-[1px] font-[family-name:var(--font-mono)] text-[7.5px] font-normal text-[color:var(--text-subtle)]"
        >
          {bed.tier}
        </span>
      ) : null}
      {face ? <span aria-hidden="true">{face}</span> : null}
      {marks}
    </button>
  );
}

/** The dot on the corner of a bed: signed out, sick bay, prefect. */
function Mark({ tone, size, label }: { tone: string; size: PlanSize; label: string }) {
  const mini = size === "mini";
  return (
    <i
      title={label}
      aria-hidden="true"
      className="absolute rounded-full"
      style={{
        top: mini ? -2 : -3,
        right: mini ? -2 : -3,
        width: mini ? 7 : 11,
        height: mini ? 7 : 11,
        background: tone,
        border: `${mini ? 1.5 : 2}px solid var(--surface)`,
      }}
    />
  );
}

/* ── one wall run ────────────────────────────────────────────────────── */

function WallRun({
  label,
  bays,
  beds,
  size,
  onBedPress,
}: {
  label: string;
  bays: number[];
  beds: readonly PlanBed[];
  size: PlanSize;
  onBedPress?: (bed: PlanBed) => void;
}) {
  const mini = size === "mini";
  const metrics = METRICS[size];

  return (
    <div>
      {mini ? null : (
        <div className="py-0.5 text-[9.5px] uppercase tracking-[0.11em] text-[color:var(--text-subtle)]">
          {label}
        </div>
      )}
      <div
        className="flex min-w-min"
        style={{ gap: metrics.runGap, paddingTop: metrics.runPad, paddingBottom: metrics.runPad }}
      >
        {bays.map((bay) => {
          const inBay = beds.filter((bed) => bed.bay === bay).sort(byTier);
          return (
            <div
              key={bay}
              className="flex shrink-0 flex-col items-center"
              style={{ gap: metrics.bayGap }}
            >
              <div className="flex flex-col" style={{ gap: metrics.stackGap }}>
                {inBay.map((bed) => (
                  <BedButton key={bed.id} bed={bed} size={size} onPress={onBedPress} />
                ))}
              </div>
              {mini ? null : (
                <div className="font-[family-name:var(--font-mono)] text-[9px] text-[color:var(--text-subtle)]">
                  {String(bay).padStart(2, "0")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── the plan ────────────────────────────────────────────────────────── */

/**
 * The room. Two wall runs with an aisle between them.
 *
 * The bays are split down the middle — the first half against the window
 * wall, the second against the door wall — which is how the rooms are built
 * and how the numbering runs when somebody walks in and counts.
 */
export function DormitoryPlan({
  room,
  size = "full",
  onBedPress,
  onOpen,
  className,
}: {
  room: PlanRoom;
  size?: PlanSize;
  /** Pressing a bed. Beds carrying a refusal never call it. */
  onBedPress?: (bed: PlanBed) => void;
  /** Pressing the plan itself — how a mini plan opens its dormitory. */
  onOpen?: () => void;
  className?: string;
}) {
  const mini = size === "mini";
  const metrics = METRICS[size];
  const bays = planBays(room.beds);
  const half = Math.ceil(bays.length / 2);
  const off = bedsOffPlan(room.beds);

  // A room whose beds carry no bay cannot be drawn, and inventing a shape for
  // it would be the exact failure `bay` and `tier` were added to prevent. It
  // says so instead, and names how many beds are waiting for a place.
  const body = bays.length === 0 ? (
    <div className="flex flex-col gap-1 py-2">
      <p className="text-sm font-semibold text-[color:var(--text-strong)]">
        This room has no plan yet
      </p>
      <p className="text-xs text-[color:var(--text-muted)]">
        {room.beds.length === 0
          ? "There are no beds in it."
          : `Its ${room.beds.length} beds have no bay recorded, so the room cannot be drawn. Give each bed its bay and tier and the plan appears.`}
      </p>
    </div>
  ) : (
    <>
      <WallRun
        label="Window wall"
        bays={bays.slice(0, half)}
        beds={room.beds}
        size={size}
        onBedPress={onBedPress}
      />
      <div
        aria-hidden="true"
        className="flex items-center gap-2.5 py-[5px] text-[9.5px] uppercase tracking-[0.11em] text-[color:var(--text-subtle)] before:h-px before:flex-1 before:bg-[color:var(--border)] before:content-[''] after:h-px after:flex-1 after:bg-[color:var(--border)] after:content-['']"
        style={mini ? { paddingTop: 3, paddingBottom: 3, fontSize: 8.5 } : undefined}
      >
        aisle
      </div>
      <WallRun
        label="Door wall"
        bays={bays.slice(half)}
        beds={room.beds}
        size={size}
        onBedPress={onBedPress}
      />
      {off.length > 0 && !mini ? (
        // Not drawn somewhere invented. A bed with no bay has no place in the
        // room yet, and the honest thing is to say which beds those are.
        <p className="pt-2 text-xs text-[color:var(--text-muted)]">
          {off.length === 1
            ? `Bed ${off[0].code} is not on the plan — it has no bay recorded.`
            : `${off.length} beds are not on the plan — they have no bay recorded: ${off
                .map((bed) => bed.code)
                .join(", ")}.`}
        </p>
      ) : null}
    </>
  );

  const shell = cn(
    "flex w-fit max-w-full flex-col overflow-x-auto rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface)]",
    mini && onOpen ? "cursor-pointer hover:border-[color:var(--border-strong)]" : "",
    className,
  );
  const style: CSSProperties = { padding: metrics.padding, gap: metrics.planGap };

  if (mini && onOpen) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${room.name}`}
        onClick={(event) => {
          // A press on a bed is about that bed; only the room around it opens
          // the dormitory.
          if ((event.target as HTMLElement).closest("button")) return;
          onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={shell}
        style={style}
      >
        {body}
      </div>
    );
  }

  return (
    <div className={shell} style={style}>
      {body}
    </div>
  );
}

/* ── the key ─────────────────────────────────────────────────────────── */

function Swatch({ style }: { style: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[9px] rounded-[3px]"
      style={style}
    />
  );
}

/**
 * What the shapes mean. Shown under the plan, and the mini version says the
 * one extra thing a mini plan needs said — that it opens.
 */
export function DormitoryPlanLegend({ size = "full" }: { size?: PlanSize }) {
  const mini = size === "mini";
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-xs text-[color:var(--text-muted)]">
      <span className="inline-flex items-center gap-1.5">
        <Swatch
          style={
            mini
              ? { background: "var(--border-strong)" }
              : { background: "var(--surface-muted)", border: "1px solid var(--border)" }
          }
        />
        Taken
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ border: "1px dashed var(--border-strong)" }} />
        Free
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: HATCH_MINI, boxShadow: "inset 0 0 0 1px var(--border)" }} />
        Out of service
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: "var(--tone-warn)", borderRadius: 999, width: 8, height: 8 }} />
        Signed out
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: "var(--tone-danger)", borderRadius: 999, width: 8, height: 8 }} />
        Sick bay
      </span>
      {mini ? (
        <span>Press a dormitory to open it</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-[family-name:var(--font-mono)] text-[10px]">U</span> upper bunk
          <span className="font-[family-name:var(--font-mono)] text-[10px]">L</span> lower
        </span>
      )}
    </div>
  );
}

/* ── from the wire to the drawing ────────────────────────────────────── */

/**
 * A bed as `GET /boarding/hostels/[id]/occupancy` sends it.
 *
 * `bay`, `tier`, `status` and `statusReason` are **optional here and required
 * in the database**. The columns are real (see `SchoolHostelBed` in
 * `prisma/schema.prisma`) but `hostelOccupancy()` does not select them yet, so
 * they are typed as "may be missing from this response" rather than asserted.
 * A bed that arrives without a bay is reported as off-plan rather than drawn in
 * a place the room does not have — which is the whole reason the geometry is
 * data and not parsed out of the bed's code.
 */
export type OccupancyBed = {
  id: string;
  code: string;
  room: { id: string; code: string; floor: string | null; capacity: number | null };
  allocationId: string | null;
  student: { id: string; studentNo: string; firstName: string; lastName: string } | null;
  bay?: number | null;
  tier?: string | null;
  status?: string | null;
  statusReason?: string | null;
  isPrefectDorm?: boolean | null;
};

/** "Tendai Moyo" → "TM". One letter where there is only one name. */
export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
}

/**
 * The houses' beds, grouped into the rooms they are in.
 *
 * Rooms come back in the order their beds do, which the endpoint sorts by room
 * code — so the rail and the plans agree without a second sort here.
 */
export function roomsFromBeds(
  beds: readonly OccupancyBed[],
  decorate?: (bed: OccupancyBed) => Partial<PlanBed>,
): PlanRoom[] {
  const rooms = new Map<string, PlanRoom>();
  for (const bed of beds) {
    let room = rooms.get(bed.room.id);
    if (!room) {
      room = {
        id: bed.room.id,
        name: bed.room.code,
        floor: bed.room.floor,
        isPrefectDorm: bed.isPrefectDorm ?? false,
        beds: [],
      };
      rooms.set(bed.room.id, room);
    }
    room.beds.push({
      id: bed.id,
      code: bed.code,
      bay: bed.bay ?? null,
      tier: bed.tier ?? null,
      // A bed with no status on the wire is one that can be slept in. The
      // column defaults to AVAILABLE, so the absence is a thin response and
      // not a broken bed — assuming the opposite would hide every free bed in
      // the house behind a hatch.
      status: bed.status ?? "AVAILABLE",
      statusReason: bed.statusReason ?? null,
      occupant: bed.student
        ? {
            id: bed.student.id,
            name: `${bed.student.firstName} ${bed.student.lastName}`,
            initials: initialsOf(bed.student.firstName, bed.student.lastName),
            reference: bed.student.studentNo,
          }
        : null,
      ...decorate?.(bed),
    });
  }
  return [...rooms.values()];
}

/* ── the plan, while it is being read ────────────────────────────────── */
/**
 * The skeleton is the plan with the beds greyed, not a spinner and not a grey
 * box: the room's shape is the thing somebody is waiting for, so the wait is
 * the right shape and nothing moves when the beds land.
 */
export function DormitoryPlanSkeleton({
  size = "full",
  bays = 12,
  label = "Loading the plan",
}: {
  size?: PlanSize;
  bays?: number;
  label?: string;
}) {
  const mini = size === "mini";
  const metrics = METRICS[size];
  const half = Math.ceil(bays / 2);

  const run = (count: number, key: string) => (
    <div
      key={key}
      className="flex"
      style={{ gap: metrics.runGap, paddingTop: metrics.runPad, paddingBottom: metrics.runPad }}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="campus-skeleton-row flex flex-col items-center"
          style={{ gap: metrics.bayGap, animationDelay: `${index * 30}ms` }}
        >
          <div className="flex flex-col" style={{ gap: metrics.stackGap }}>
            {[0, 1].map((tier) => (
              <div
                key={tier}
                className="skeleton"
                style={{
                  width: metrics.bed.width,
                  height: metrics.bed.height,
                  borderRadius: metrics.bed.radius,
                }}
              />
            ))}
          </div>
          {mini ? null : <div className="skeleton h-[9px] w-3.5 rounded-[2px]" />}
        </div>
      ))}
    </div>
  );

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex w-fit max-w-full flex-col overflow-hidden rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface)]"
      style={{ padding: metrics.padding, gap: metrics.planGap }}
    >
      <span className="sr-only">{label}</span>
      {mini ? null : <div className="skeleton h-[9px] w-16 rounded-[2px]" />}
      {run(half, "window")}
      <div
        className="flex items-center gap-2.5 py-[5px] before:h-px before:flex-1 before:bg-[color:var(--border)] before:content-[''] after:h-px after:flex-1 after:bg-[color:var(--border)] after:content-['']"
        aria-hidden="true"
      />
      {run(bays - half, "door")}
    </div>
  );
}
