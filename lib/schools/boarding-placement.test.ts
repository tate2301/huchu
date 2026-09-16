/**
 * The boarding placer's rules, and the roll call's opening state.
 *
 * Pure functions only — no database. These are the decisions a warden argues
 * with, so they are the ones worth pinning: which beds are offered, in what
 * order, and what a roll call says before anybody has ticked anything.
 *
 * The constraint tests that need Postgres live in `boarding.test.ts`.
 */

import { describe, it, expect } from "vitest";

import {
  bedRefusal,
  bedScore,
  type PlaceableBed,
  type PlaceablePupil,
} from "./boarding-rules";
import {
  canSubmit,
  openingStatus,
  rollCallDate,
  rollCallSummary,
  tally,
} from "./boarding-roll-call";

function bed(overrides: Partial<PlaceableBed> = {}): PlaceableBed {
  return {
    id: "bed-1",
    status: "AVAILABLE",
    bay: 1,
    tier: "L",
    room: { id: "room-1", isPrefectDorm: false, yearGroupIds: [] },
    hostel: { id: "house-1", name: "Nyanga House", genderPolicy: "MALE" },
    occupantId: null,
    ...overrides,
  };
}

function pupil(overrides: Partial<PlaceablePupil> = {}): PlaceablePupil {
  return {
    id: "pupil-1",
    firstName: "Tapiwa",
    lastName: "Moyo",
    gender: "M",
    isPrefect: false,
    currentClassId: "form-1",
    ...overrides,
  };
}

describe("bedRefusal", () => {
  it("offers a free bed in the right house", () => {
    expect(bedRefusal(bed(), pupil())).toBeNull();
  });

  it("refuses a bed somebody else is in", () => {
    expect(bedRefusal(bed({ occupantId: "someone-else" }), pupil())).toBe(
      "Somebody is already in this bed",
    );
  });

  /**
   * The rule the prototype's README calls out by name. A broken bed that
   * merely looks empty is the one that gets a child assigned to a bunk with no
   * ladder.
   */
  it("refuses an out-of-service bed even though nobody is in it", () => {
    expect(bedRefusal(bed({ status: "OUT_OF_SERVICE" }), pupil())).toBe(
      "This bed is out of service",
    );
  });

  it("refuses a girl a bed in a boys' house, and says why", () => {
    expect(bedRefusal(bed(), pupil({ gender: "F" }))).toBe("Nyanga House takes boys only");
  });

  /**
   * A blank gender is refused rather than waved through — one empty field must
   * not be the thing that puts a boy in a girls' dormitory.
   */
  it("refuses a child with no gender recorded from a single-sex house", () => {
    expect(bedRefusal(bed(), pupil({ gender: null }))).toContain("no gender recorded");
  });

  it("lets anybody into a mixed house", () => {
    const mixed = bed({ hostel: { id: "h", name: "Vumba House", genderPolicy: "MIXED" } });
    expect(bedRefusal(mixed, pupil({ gender: null }))).toBeNull();
  });

  it("keeps a prefects' dormitory for prefects", () => {
    const prefectDorm = bed({ room: { id: "r", isPrefectDorm: true, yearGroupIds: [] } });
    expect(bedRefusal(prefectDorm, pupil({ isPrefect: false }))).toBe(
      "This dormitory is for prefects",
    );
    expect(bedRefusal(prefectDorm, pupil({ isPrefect: true }))).toBeNull();
  });
});

describe("bedScore", () => {
  const context = { dormOccupantClassIds: [], houseFreeRatio: 0 };

  it("puts the right class far above everything else", () => {
    const right = bedScore(
      bed({ room: { id: "r", isPrefectDorm: false, yearGroupIds: ["form-1"] } }),
      pupil(),
      context,
    );
    // An empty house and a lower bunk together must not outvote the class.
    const wrong = bedScore(bed({ tier: "L" }), pupil(), {
      dormOccupantClassIds: [],
      houseFreeRatio: 1,
    });
    expect(right).toBeGreaterThan(wrong);
  });

  it("prefers a dormitory holding their year-mates", () => {
    const withMates = bedScore(bed(), pupil(), {
      ...context,
      dormOccupantClassIds: ["form-1", "form-1", "form-2"],
    });
    expect(withMates).toBeGreaterThan(bedScore(bed(), pupil(), context));
  });

  it("spreads intake towards the emptier house", () => {
    const empty = bedScore(bed(), pupil(), { ...context, houseFreeRatio: 1 });
    const full = bedScore(bed(), pupil(), { ...context, houseFreeRatio: 0 });
    expect(empty).toBeGreaterThan(full);
  });

  it("breaks a tie towards the lower bunk", () => {
    expect(bedScore(bed({ tier: "L" }), pupil(), context)).toBeGreaterThan(
      bedScore(bed({ tier: "U" }), pupil(), context),
    );
  });
});

describe("openingStatus", () => {
  const empty = new Set<string>();

  it("starts a child nobody has looked at yet as NOT_SEEN", () => {
    expect(
      openingStatus({ studentId: "p1", signedOutStudentIds: empty, sickBayStudentIds: empty }),
    ).toBe("NOT_SEEN");
  });

  /**
   * The point of the whole file: the warden should never be asked to tick past
   * a child the school already knows is away.
   */
  it("opens a signed-out child as SIGNED_OUT, not NOT_SEEN", () => {
    expect(
      openingStatus({
        studentId: "p1",
        signedOutStudentIds: new Set(["p1"]),
        sickBayStudentIds: empty,
      }),
    ).toBe("SIGNED_OUT");
  });

  it("opens a sick-bay child as SICK_BAY", () => {
    expect(
      openingStatus({
        studentId: "p1",
        signedOutStudentIds: empty,
        sickBayStudentIds: new Set(["p1"]),
      }),
    ).toBe("SICK_BAY");
  });

  it("lets signed out win over the sick bay — they are not in the building at all", () => {
    expect(
      openingStatus({
        studentId: "p1",
        signedOutStudentIds: new Set(["p1"]),
        sickBayStudentIds: new Set(["p1"]),
      }),
    ).toBe("SIGNED_OUT");
  });
});

describe("canSubmit", () => {
  it("refuses while anybody is still NOT_SEEN", () => {
    expect(canSubmit(["PRESENT", "NOT_SEEN"])).toBe(false);
  });

  /**
   * An absent child is an answer — a bad one that starts a phone call, but the
   * warden has given it. Blocking submission here would mean a house with a
   * genuinely missing child can never close its register.
   */
  it("allows submission with an ABSENT child, because that is an answer", () => {
    expect(canSubmit(["PRESENT", "ABSENT"])).toBe(true);
  });

  it("refuses an empty roll call", () => {
    expect(canSubmit([])).toBe(false);
  });
});

describe("rollCallSummary", () => {
  it("leads with what is left to do while the count is running", () => {
    const counts = tally(["PRESENT", "NOT_SEEN", "NOT_SEEN"]);
    expect(rollCallSummary(counts)).toBe("2 still to account for");
  });

  it("leads with the unaccounted-for once everybody has been looked at", () => {
    const counts = tally(["PRESENT", "ABSENT", "SIGNED_OUT"]);
    expect(rollCallSummary(counts)).toContain("1 unaccounted for");
  });

  it("says everybody is accounted for when they are", () => {
    const counts = tally(["PRESENT", "SIGNED_OUT", "SICK_BAY"]);
    expect(rollCallSummary(counts)).toContain("Everybody accounted for");
  });
});

describe("rollCallDate", () => {
  /**
   * A count at 21:05 and an amendment at 06:00 the next morning are the same
   * night's register. Without normalising, they are two rows and the unique
   * constraint never bites.
   */
  it("normalises an evening count to midnight", () => {
    const at = new Date("2026-05-12T21:05:00");
    const normalised = rollCallDate(at);
    expect(normalised.getHours()).toBe(0);
    expect(normalised.getMinutes()).toBe(0);
    expect(normalised.getDate()).toBe(12);
  });

  it("does not mutate what it is given", () => {
    const at = new Date("2026-05-12T21:05:00");
    rollCallDate(at);
    expect(at.getHours()).toBe(21);
  });
});
