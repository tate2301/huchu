/**
 * Who may sleep where, with no database behind it.
 *
 * Pure so the allocation screen can grey out the beds a child cannot have
 * before anybody clicks, and so the rules have one definition rather than one
 * in the handler and another in the UI.
 */

export type GenderPolicy = "MALE" | "FEMALE" | "MIXED";

/**
 * A student's gender, from a free-text column.
 *
 * The column has never been constrained, so it holds "M", "Male", "female" and
 * blanks. Normalising here rather than at each call site is what stops a girl
 * recorded as "F" being allowed into a boys' hostel because one comparison used
 * `=== "FEMALE"`.
 */
export function normaliseGender(value: string | null | undefined): GenderPolicy | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (["M", "MALE", "BOY", "B"].includes(upper)) return "MALE";
  if (["F", "FEMALE", "GIRL", "G"].includes(upper)) return "FEMALE";
  return null;
}

/**
 * Why a hostel will not take this child, or null when it will.
 *
 * A child with no gender recorded is refused from a single-sex hostel rather
 * than waved through. Letting an unknown pass is how one blank field puts a boy
 * in a girls' dormitory, and the fix — fill the field in — takes a warden ten
 * seconds.
 */
export function genderRefusal(
  hostel: { name: string; genderPolicy: string },
  student: { firstName: string; lastName: string; gender: string | null },
): string | null {
  const policy = hostel.genderPolicy.toUpperCase();
  if (policy === "MIXED") return null;

  const gender = normaliseGender(student.gender);
  if (gender === null) {
    return `${hostel.name} takes ${policy === "MALE" ? "boys" : "girls"} only, and ${student.firstName} ${student.lastName} has no gender recorded`;
  }
  if (gender !== policy) {
    return `${hostel.name} takes ${policy === "MALE" ? "boys" : "girls"} only`;
  }
  return null;
}

/** Why there is no room, or null when there is. */
export function capacityRefusal(
  place: { kind: "hostel" | "room"; name: string; capacity: number | null },
  occupied: number,
) {
  if (place.capacity === null) return null;
  if (occupied < place.capacity) return null;
  return `${place.name} is full — ${occupied} of ${place.capacity} ${
    place.kind === "hostel" ? "places" : "beds"
  } taken`;
}

/* ── which bed, of the ones that are free ──────────────────────────────── */

/** The shape the placer needs of a bed. */
export type PlaceableBed = {
  id: string;
  /** AVAILABLE, or anything else meaning it cannot be slept in. */
  status: string;
  bay: number | null;
  tier: string | null;
  room: {
    id: string;
    isPrefectDorm: boolean;
    yearGroupIds: string[];
  };
  hostel: { id: string; name: string; genderPolicy: string };
  /** Who is already in it, if anybody. */
  occupantId: string | null;
};

/** The shape the placer needs of a child. */
export type PlaceablePupil = {
  id: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  isPrefect: boolean;
  currentClassId: string | null;
};

/**
 * Why this bed cannot be offered to this child, or null when it can.
 *
 * Every refusal is a sentence a warden can act on, because this is what the
 * screen shows when somebody presses a bed that is greyed out. "Not eligible"
 * tells them nothing; "Nyanga takes boys only" tells them they picked the
 * wrong house, and "bed 12U is out of service" tells them to chase the joiner.
 *
 * **Out of service is not free.** A broken bed is refused here rather than
 * filtered out somewhere upstream, so there is exactly one place that decides
 * whether a bed can take a child.
 */
export function bedRefusal(bed: PlaceableBed, pupil: PlaceablePupil): string | null {
  if (bed.occupantId && bed.occupantId !== pupil.id) {
    return "Somebody is already in this bed";
  }
  if (bed.status !== "AVAILABLE") {
    return "This bed is out of service";
  }
  const gender = genderRefusal(bed.hostel, pupil);
  if (gender) return gender;

  if (bed.room.isPrefectDorm && !pupil.isPrefect) {
    return "This dormitory is for prefects";
  }
  return null;
}

/**
 * How good a bed is for this child, higher being better. Only ever called on
 * beds that `bedRefusal` has already cleared.
 *
 * The ordering is a warden's, not an optimiser's:
 *
 * 1. **The right class** dominates everything else. A Form 1 in the Form 1
 *    dormitory is the single thing that makes a house work socially, and the
 *    weight is large enough that no combination of the others outvotes it.
 * 2. **Their year-mates**, so a child arriving late is put with people they
 *    know rather than into the one empty corner of an Upper 6 dormitory.
 * 3. **The emptier house**, which spreads intake across houses instead of
 *    filling Nyanga to the roof while Vumba stands empty.
 * 4. **A lower bunk**, all else equal — nobody's first choice is a top bunk,
 *    and this is the tiebreak rather than a real preference.
 */
export function bedScore(
  bed: PlaceableBed,
  pupil: PlaceablePupil,
  context: {
    /** Who else is in that dormitory, by class id. */
    dormOccupantClassIds: string[];
    /** Free beds over total beds in the bed's house, 0..1. */
    houseFreeRatio: number;
  },
): number {
  let score = 0;

  if (pupil.currentClassId && bed.room.yearGroupIds.includes(pupil.currentClassId)) {
    score += 40;
  }
  if (pupil.currentClassId) {
    score += context.dormOccupantClassIds.filter((id) => id === pupil.currentClassId).length;
  }
  score += context.houseFreeRatio * 12;
  if (bed.tier === "L") score += 1;

  return score;
}

