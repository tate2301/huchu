import { describe, it, expect } from "vitest";
import {
  CALENDAR_KIND_LABELS,
  defaultIsTeachingDay,
  type SchoolCalendarEventKindValue,
} from "./calendar-kinds";

const ALL_KINDS: SchoolCalendarEventKindValue[] = [
  "HOLIDAY",
  "PUBLIC_HOLIDAY",
  "HALF_TERM",
  "STAFF_ONLY",
  "EXAM",
  "EVENT",
];

describe("defaultIsTeachingDay", () => {
  it("closes the school for the kinds that mean the school is shut", () => {
    // The point of the default. Someone entering Christmas and tabbing past the
    // checkbox must not be shown twelve missing registers on Christmas Day.
    expect(defaultIsTeachingDay("HOLIDAY")).toBe(false);
    expect(defaultIsTeachingDay("PUBLIC_HOLIDAY")).toBe(false);
    expect(defaultIsTeachingDay("HALF_TERM")).toBe(false);
    expect(defaultIsTeachingDay("STAFF_ONLY")).toBe(false);
  });

  it("keeps the school open for the kinds that happen during school", () => {
    expect(defaultIsTeachingDay("EXAM")).toBe(true);
    expect(defaultIsTeachingDay("EVENT")).toBe(true);
  });

  it("answers for every kind, and labels every kind", () => {
    // A kind added to the enum without a rule here would fall through the
    // switch and return undefined, which reads as "closed" at the call site
    // and would silently shut the school.
    for (const kind of ALL_KINDS) {
      expect(typeof defaultIsTeachingDay(kind), kind).toBe("boolean");
      expect(CALENDAR_KIND_LABELS[kind], kind).toBeTruthy();
    }
  });
});
