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
