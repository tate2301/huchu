/**
 * Roll-up for the timeline (K3, "Grouping"). A person's words are never rolled up. Two things are:
 *  - one person's edits to one record within an hour of the first become one line;
 *  - machine events of one kind in one module on one day become a count.
 * Everything else stays a row of its own. The result keeps the order of the input (newest first) and
 * each group sits where its newest member was.
 */

export type ActorKind = "person" | "machine" | "vane";

export type RollableEvent = {
  id: string;
  /** Milliseconds since the epoch. */
  at: number;
  actor: { kind: ActorKind; id: string };
  /** What happened: "comment", "edit", "sale", "receipt", "call". */
  kind: string;
  module: string;
  recordId?: string;
  /** For an edit: the field that changed. */
  field?: string;
};

export type Single<E extends RollableEvent> = { type: "single"; event: E };
export type EditGroup<E extends RollableEvent> = {
  type: "edits";
  actorId: string;
  recordId?: string;
  events: E[];
  fields: string[];
  from: number;
  to: number;
};
export type MachineCount<E extends RollableEvent> = {
  type: "count";
  kind: string;
  module: string;
  day: string;
  events: E[];
  from: number;
  to: number;
};
export type Rolled<E extends RollableEvent> = Single<E> | EditGroup<E> | MachineCount<E>;

export const EDIT_WINDOW_MS = 60 * 60 * 1000;
const WORKSPACE_ZONE = "Africa/Harare";

/** The calendar day of an instant in the workspace's zone, as 2026-10-17. */
export function dayKey(at: number, timeZone = WORKSPACE_ZONE): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone });
}

export function rollUp<E extends RollableEvent>(
  events: readonly E[],
  options: { windowMs?: number; timeZone?: string } = {},
): Rolled<E>[] {
  const windowMs = options.windowMs ?? EDIT_WINDOW_MS;
  const zone = options.timeZone ?? WORKSPACE_ZONE;
  const newestFirst = [...events].sort((a, b) => b.at - a.at);
  const taken = new Set<string>();
  const out: Rolled<E>[] = [];

  // Which group each event belongs to, decided against the oldest member so a window never stretches.
  const editGroups = new Map<string, E[]>();
  const oldestFirst = [...newestFirst].reverse();
  const open = new Map<string, { start: number; key: string }>();
  for (const e of oldestFirst) {
    if (e.actor.kind !== "person" || e.kind !== "edit") continue;
    const base = `${e.actor.id}|${e.recordId ?? ""}`;
    const current = open.get(base);
    let key: string;
    if (current && e.at - current.start < windowMs) {
      key = current.key;
    } else {
      key = `${base}|${e.at}`;
      open.set(base, { start: e.at, key });
    }
    const list = editGroups.get(key) ?? [];
    list.push(e);
    editGroups.set(key, list);
  }
  const editKeyOf = new Map<string, string>();
  for (const [key, list] of editGroups) for (const e of list) editKeyOf.set(e.id, key);

  const machineGroups = new Map<string, E[]>();
  for (const e of newestFirst) {
    if (e.actor.kind !== "machine") continue;
    const key = `${e.module}|${e.kind}|${dayKey(e.at, zone)}`;
    const list = machineGroups.get(key) ?? [];
    list.push(e);
    machineGroups.set(key, list);
  }

  for (const e of newestFirst) {
    if (taken.has(e.id)) continue;
    const editKey = editKeyOf.get(e.id);
    if (editKey) {
      const members = (editGroups.get(editKey) ?? []).slice().sort((a, b) => b.at - a.at);
      if (members.length > 1) {
        members.forEach((m) => taken.add(m.id));
        const fields = [...new Set(members.map((m) => m.field).filter((f): f is string => !!f))];
        out.push({
          type: "edits",
          actorId: e.actor.id,
          recordId: e.recordId,
          events: members,
          fields,
          from: members[members.length - 1].at,
          to: members[0].at,
        });
        continue;
      }
    }
    if (e.actor.kind === "machine") {
      const key = `${e.module}|${e.kind}|${dayKey(e.at, zone)}`;
      const members = machineGroups.get(key) ?? [];
      if (members.length > 1) {
        members.forEach((m) => taken.add(m.id));
        out.push({
          type: "count",
          kind: e.kind,
          module: e.module,
          day: dayKey(e.at, zone),
          events: members,
          from: members[members.length - 1].at,
          to: members[0].at,
        });
        continue;
      }
    }
    taken.add(e.id);
    out.push({ type: "single", event: e });
  }
  return out;
}
