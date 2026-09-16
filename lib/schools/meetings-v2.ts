import { fetchJson } from "@/lib/api-client";

/**
 * Parent meetings, from the browser's side.
 *
 * The meetings screens have always reached for `fetchJson` themselves, because
 * every request they made was one of the three the route's `action` union
 * takes and the body was three fields long. Correcting an evening is not that
 * shape: it names a night by its edges, sends only the parts of the window the
 * office actually changed, and leaves the rest alone. That is a body worth
 * describing once, here, rather than assembling in a component.
 *
 * As everywhere in this module, `successResponse` does not wrap: this reads the
 * body directly rather than reaching for `.data.data`.
 */

export type MoveEveningInput = {
  teacherProfileId: string;
  /**
   * Which evening: the instant its first slot starts and the instant its last
   * one ends. Instants rather than a date because the night a slot falls on is
   * the school's local night, and only the browser knows what that is.
   */
  eveningFrom: string;
  eveningTo: string;
  /** Where it is moving to. Both or neither — an evening moves as a window. */
  from?: string;
  to?: string;
  minutesEach?: number;
  /** Null takes the room off the evening; leaving it out keeps the one it has. */
  location?: string | null;
};

export type MoveEveningResult = {
  /** False when only the room was corrected and the slots stayed where they were. */
  moved: boolean;
  /** Slots whose room was rewritten in place. */
  updated: number;
  /** Slots taken down so the window could be cut again. */
  cancelled: number;
  created: number;
  /** Times the teacher was already open for, left alone rather than opened twice. */
  skipped: number;
};

/**
 * Move a teacher's evening to another night, re-cut its slots, or write the
 * room onto it.
 *
 * The route refuses to move a night that families have booked, and says how
 * many they hold — see the doc on the handler for why that refusal is the
 * right answer rather than a confirmation.
 */
export function moveEvening(input: MoveEveningInput) {
  return fetchJson<MoveEveningResult>("/api/v2/schools/meetings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
