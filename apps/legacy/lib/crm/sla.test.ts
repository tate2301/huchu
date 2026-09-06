import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKING_HOURS,
  STAGE_TARGET_MINUTES,
  addWorkingMinutes,
  formatSlaRemaining,
  stageSla,
  workingMinutesBetween,
} from "./sla";

/** Local time, so the helpers under test see the same clock the app does. */
function at(iso: string): Date {
  return new Date(iso);
}

describe("workingMinutesBetween", () => {
  it("counts only the part of a span inside working hours", () => {
    // 16:00 to 09:00 next day: one hour today, one hour tomorrow.
    expect(workingMinutesBetween(at("2026-07-27T16:00:00"), at("2026-07-28T09:00:00"))).toBe(120);
  });

  it("ignores the weekend", () => {
    // Friday 16:55 to Monday 09:10 is five minutes on Friday plus seventy on
    // Monday — the case that makes a wall-clock SLA lie.
    const friday = at("2026-07-24T16:55:00");
    const monday = at("2026-07-27T09:10:00");
    expect(friday.getDay()).toBe(5);
    expect(monday.getDay()).toBe(1);
    expect(workingMinutesBetween(friday, monday)).toBe(5 + 70);
  });

  it("counts nothing for a span entirely outside hours", () => {
    expect(workingMinutesBetween(at("2026-07-27T19:00:00"), at("2026-07-27T23:00:00"))).toBe(0);
  });

  it("counts nothing when the end is before the start", () => {
    expect(workingMinutesBetween(at("2026-07-27T12:00:00"), at("2026-07-27T09:00:00"))).toBe(0);
  });

  it("clamps a span that starts before the working day opens", () => {
    // 06:00 to 10:00 is two working hours, not four.
    expect(workingMinutesBetween(at("2026-07-27T06:00:00"), at("2026-07-27T10:00:00"))).toBe(120);
  });
});

describe("addWorkingMinutes", () => {
  it("rolls a target past the end of the day onto the next one", () => {
    // 16:45 + 30 working minutes lands at 08:15 the next working morning.
    const due = addWorkingMinutes(at("2026-07-27T16:45:00"), 30);
    expect(due.getDate()).toBe(28);
    expect(due.getHours()).toBe(8);
    expect(due.getMinutes()).toBe(15);
  });

  it("rolls a Friday evening target over the weekend", () => {
    const due = addWorkingMinutes(at("2026-07-24T16:55:00"), 30);
    expect(due.getDay()).toBe(1);
    expect(due.getHours()).toBe(8);
    expect(due.getMinutes()).toBe(25);
  });

  it("starts the clock at opening when the record arrives overnight", () => {
    const due = addWorkingMinutes(at("2026-07-27T02:00:00"), 30);
    expect(due.getHours()).toBe(8);
    expect(due.getMinutes()).toBe(30);
  });

  it("is the inverse of workingMinutesBetween", () => {
    const from = at("2026-07-27T09:00:00");
    const due = addWorkingMinutes(from, 400);
    expect(workingMinutesBetween(from, due)).toBe(400);
  });
});

describe("stageSla", () => {
  it("marks a new lead late once thirty working minutes have passed", () => {
    const state = stageSla("NEW", at("2026-07-27T09:00:00"), at("2026-07-27T09:45:00"));
    expect(state.targetMinutes).toBe(STAGE_TARGET_MINUTES.NEW);
    expect(state.breached).toBe(true);
    expect(state.remainingMinutes).toBe(-15);
  });

  it("does not mark a Friday-evening lead late on Monday morning", () => {
    const state = stageSla("NEW", at("2026-07-24T16:55:00"), at("2026-07-27T09:10:00"));
    // Five working minutes on Friday plus seventy on Monday is well past
    // thirty, so this one *is* late — but only by working time.
    expect(state.elapsedMinutes).toBe(75);
    expect(state.breached).toBe(true);
  });

  it("leaves a Friday-evening lead untouched first thing Monday", () => {
    const state = stageSla("NEW", at("2026-07-24T16:55:00"), at("2026-07-27T08:10:00"));
    expect(state.elapsedMinutes).toBe(15);
    expect(state.breached).toBe(false);
  });

  it("flags at-risk before it is late", () => {
    const state = stageSla("NEW", at("2026-07-27T09:00:00"), at("2026-07-27T09:25:00"));
    expect(state.breached).toBe(false);
    expect(state.atRisk).toBe(true);
  });

  it("runs no clock on a closed stage", () => {
    const won = stageSla("WON", at("2026-01-01T09:00:00"), at("2026-07-27T09:00:00"));
    expect(won.exempt).toBe(true);
    expect(won.breached).toBe(false);
    expect(formatSlaRemaining(won)).toBeNull();
  });

  it("survives an unparseable date rather than reporting a breach", () => {
    const state = stageSla("NEW", "not a date", at("2026-07-27T09:00:00"));
    expect(state.exempt).toBe(true);
    expect(state.breached).toBe(false);
  });
});

describe("formatSlaRemaining", () => {
  it("says minutes under an hour", () => {
    const state = stageSla("NEW", at("2026-07-27T09:00:00"), at("2026-07-27T09:10:00"));
    expect(formatSlaRemaining(state)).toBe("20m left");
  });

  it("says how late once breached", () => {
    const state = stageSla("NEW", at("2026-07-27T09:00:00"), at("2026-07-27T09:50:00"));
    expect(formatSlaRemaining(state)).toBe("20m late");
  });

  it("counts long spans in working days, not wall hours", () => {
    // A three-working-day target with one day elapsed has two days left; in
    // wall hours that would read as 18, which nobody means.
    const state = stageSla("CONTACTED", at("2026-07-27T08:00:00"), at("2026-07-27T17:00:00"));
    expect(formatSlaRemaining(state)).toBe("2d left");
  });

  it("uses the configured working day", () => {
    const halfDays = { ...DEFAULT_WORKING_HOURS, endMinute: 12 * 60 };
    expect(
      workingMinutesBetween(at("2026-07-27T08:00:00"), at("2026-07-27T17:00:00"), halfDays),
    ).toBe(240);
  });
});
