/**
 * Leave arithmetic, against hand-worked figures and no database.
 *
 * The two things this has to get right are what a request costs and what is left,
 * and both are places where a plausible-looking implementation is wrong in a way
 * nobody notices until an employee is short a day.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@corelithzw/db";

import {
  DEFAULT_WORK_WEEK,
  countWorkingDays,
  holidayKeysForSite,
} from "./working-days";
import {
  accruedEntitlement,
  carryOverFor,
  computeLeaveBalances,
  leaveAffordabilityDenial,
  type LeaveTypeLike,
} from "./balances";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("counting working days", () => {
  it("counts a Monday-to-Friday week as five days", () => {
    const count = countWorkingDays({
      startDate: utc("2026-08-03"),
      endDate: utc("2026-08-07"),
    });
    expect(count.workingDays.toString()).toBe("5");
    expect(count.calendarDays).toBe(5);
    expect(count.restDays).toBe(0);
  });

  it("does not charge an employee for the weekend inside a range", () => {
    // Friday to Monday is four calendar days and two working ones.
    const count = countWorkingDays({
      startDate: utc("2026-08-07"),
      endDate: utc("2026-08-10"),
    });
    expect(count.workingDays.toString()).toBe("2");
    expect(count.calendarDays).toBe(4);
    expect(count.restDays).toBe(2);
  });

  it("does not charge an employee for a public holiday inside a range", () => {
    // 11 August 2026 is a Tuesday — Heroes' Day.
    const holidays = holidayKeysForSite([{ date: utc("2026-08-11") }]);
    const withHoliday = countWorkingDays({
      startDate: utc("2026-08-10"),
      endDate: utc("2026-08-14"),
      holidayKeys: holidays,
    });
    expect(withHoliday.workingDays.toString()).toBe("4");
    expect(withHoliday.holidays).toBe(1);

    const withoutHoliday = countWorkingDays({
      startDate: utc("2026-08-10"),
      endDate: utc("2026-08-14"),
    });
    // The whole point: the same range costs a day more without the calendar.
    expect(withoutHoliday.workingDays.toString()).toBe("5");
  });

  it("honours a six-day work week", () => {
    // A mine working Monday to Saturday. The same Friday-to-Monday range costs
    // three days here, not two.
    const sixDay = new Set([1, 2, 3, 4, 5, 6]);
    const count = countWorkingDays({
      startDate: utc("2026-08-07"),
      endDate: utc("2026-08-10"),
      workWeek: sixDay,
    });
    expect(count.workingDays.toString()).toBe("3");
    expect(count.restDays).toBe(1);
  });

  it("ignores another site's holiday", () => {
    // A local shutdown at Shaft 2 is not a holiday at head office.
    const keys = holidayKeysForSite(
      [{ date: utc("2026-08-12"), siteId: "shaft-2" }],
      "head-office",
    );
    expect(keys.size).toBe(0);

    const atShaft = holidayKeysForSite(
      [{ date: utc("2026-08-12"), siteId: "shaft-2" }],
      "shaft-2",
    );
    expect(atShaft.size).toBe(1);
  });

  it("applies a company-wide holiday at every site", () => {
    const keys = holidayKeysForSite([{ date: utc("2026-08-11"), siteId: null }], "anywhere");
    expect(keys.size).toBe(1);
  });

  it("charges half a day for a half-day request", () => {
    const count = countWorkingDays({
      startDate: utc("2026-08-05"),
      endDate: utc("2026-08-05"),
      isHalfDay: true,
    });
    expect(count.workingDays.toString()).toBe("0.5");
  });

  it("refuses to make a multi-day request cost half a day", () => {
    // The flag is only meaningful on a single day; honouring it across a range
    // would let somebody book a fortnight for half a day.
    const count = countWorkingDays({
      startDate: utc("2026-08-03"),
      endDate: utc("2026-08-07"),
      isHalfDay: true,
    });
    expect(count.workingDays.toString()).toBe("5");
  });

  it("returns zero for a range that ends before it starts", () => {
    const count = countWorkingDays({
      startDate: utc("2026-08-10"),
      endDate: utc("2026-08-03"),
    });
    expect(count.workingDays.toString()).toBe("0");
  });

  it("counts a single working day as one", () => {
    expect(
      countWorkingDays({ startDate: utc("2026-08-05"), endDate: utc("2026-08-05") })
        .workingDays.toString(),
    ).toBe("1");
  });

  it("counts a range that is entirely weekend as zero", () => {
    expect(
      countWorkingDays({ startDate: utc("2026-08-08"), endDate: utc("2026-08-09") })
        .workingDays.toString(),
    ).toBe("0");
    expect(DEFAULT_WORK_WEEK.has(0)).toBe(false);
    expect(DEFAULT_WORK_WEEK.has(6)).toBe(false);
  });
});

describe("accrual", () => {
  it("gives a monthly-accrual type a twelfth per month", () => {
    // 22 days over three months is 5.5, not 5 and not 6.
    expect(
      accruedEntitlement({
        accrualMethod: "MONTHLY_ACCRUAL",
        fullEntitlement: "22",
        monthsElapsed: 3,
      }).toString(),
    ).toBe("5.5");
  });

  it("rounds accrual to two places rather than to whole days", () => {
    // A twelfth of 22 is 1.8333…; rounding to days either gives away a day or
    // steals one.
    expect(
      accruedEntitlement({
        accrualMethod: "MONTHLY_ACCRUAL",
        fullEntitlement: "22",
        monthsElapsed: 1,
      }).toString(),
    ).toBe("1.83");
  });

  it("gives an annual-grant type everything regardless of month", () => {
    expect(
      accruedEntitlement({
        accrualMethod: "ANNUAL_GRANT",
        fullEntitlement: "22",
        monthsElapsed: 1,
      }).toString(),
    ).toBe("22");
  });

  it("never accrues more than the full entitlement or less than nothing", () => {
    expect(
      accruedEntitlement({
        accrualMethod: "MONTHLY_ACCRUAL",
        fullEntitlement: "12",
        monthsElapsed: 40,
      }).toString(),
    ).toBe("12");
    expect(
      accruedEntitlement({
        accrualMethod: "MONTHLY_ACCRUAL",
        fullEntitlement: "12",
        monthsElapsed: -3,
      }).toString(),
    ).toBe("0");
  });
});

describe("carry-over", () => {
  it("carries the remainder when it is under the limit", () => {
    const result = carryOverFor({ remainingAtYearEnd: "4", carryOverLimit: "5" });
    expect(result.carriedOver.toString()).toBe("4");
    expect(result.forfeited.toString()).toBe("0");
  });

  it("caps at the limit and reports what was lost", () => {
    // "You lost 3 days on 31 December" is the thing an employee needs told, so
    // clamping silently is not enough.
    const result = carryOverFor({ remainingAtYearEnd: "8", carryOverLimit: "5" });
    expect(result.carriedOver.toString()).toBe("5");
    expect(result.forfeited.toString()).toBe("3");
  });

  it("forfeits everything when the type has no carry-over", () => {
    // A null limit means no carry-over, not unlimited carry-over.
    const result = carryOverFor({ remainingAtYearEnd: "6", carryOverLimit: null });
    expect(result.carriedOver.toString()).toBe("0");
    expect(result.forfeited.toString()).toBe("6");
  });

  it("carries nothing from an overdrawn balance", () => {
    const result = carryOverFor({ remainingAtYearEnd: "-2", carryOverLimit: "5" });
    expect(result.carriedOver.toString()).toBe("0");
    expect(result.forfeited.toString()).toBe("0");
  });
});

const ANNUAL: LeaveTypeLike = {
  id: "annual",
  code: "ANNUAL",
  name: "Annual leave",
  accrualMethod: "ANNUAL_GRANT",
  defaultEntitlement: "22",
  policyNote: "Unused days expire 31 December",
  carryOverLimit: "5",
};

const COMPASSIONATE: LeaveTypeLike = {
  id: "compassionate",
  code: "COMPASSIONATE",
  name: "Compassionate leave",
  accrualMethod: "UNLIMITED",
  defaultEntitlement: "0",
  policyNote: null,
  carryOverLimit: null,
};

describe("balances", () => {
  it("derives remaining from what was granted and what was approved", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [
        { leaveTypeId: "annual", year: 2026, granted: "22", carriedOver: "3", adjustment: "0" },
      ],
      requests: [
        { leaveTypeId: "annual", status: "APPROVED", workingDays: "5", startDate: utc("2026-04-06") },
      ],
    });
    expect(balance.entitled.toString()).toBe("25");
    expect(balance.taken.toString()).toBe("5");
    expect(balance.remaining.toString()).toBe("20");
  });

  it("reserves submitted days without counting them as taken", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [
        { leaveTypeId: "annual", year: 2026, granted: "22", carriedOver: "0", adjustment: "0" },
      ],
      requests: [
        { leaveTypeId: "annual", status: "APPROVED", workingDays: "5", startDate: utc("2026-04-06") },
        { leaveTypeId: "annual", status: "SUBMITTED", workingDays: "3", startDate: utc("2026-09-07") },
      ],
    });
    expect(balance.taken.toString()).toBe("5");
    expect(balance.pending.toString()).toBe("3");
    // A pending request must reduce what can still be asked for, or an employee
    // books the same days twice while the first is waiting.
    expect(balance.remaining.toString()).toBe("14");
  });

  it("puts the days back when a request is withdrawn or rejected", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [
        { leaveTypeId: "annual", year: 2026, granted: "22", carriedOver: "0", adjustment: "0" },
      ],
      requests: [
        { leaveTypeId: "annual", status: "WITHDRAWN", workingDays: "5", startDate: utc("2026-04-06") },
        { leaveTypeId: "annual", status: "REJECTED", workingDays: "4", startDate: utc("2026-05-04") },
        { leaveTypeId: "annual", status: "CANCELLED", workingDays: "2", startDate: utc("2026-06-01") },
        { leaveTypeId: "annual", status: "DRAFT", workingDays: "9", startDate: utc("2026-07-06") },
      ],
    });
    expect(balance.taken.toString()).toBe("0");
    expect(balance.pending.toString()).toBe("0");
    expect(balance.remaining.toString()).toBe("22");
  });

  it("ignores a request from another leave year", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [
        { leaveTypeId: "annual", year: 2026, granted: "22", carriedOver: "0", adjustment: "0" },
      ],
      requests: [
        { leaveTypeId: "annual", status: "APPROVED", workingDays: "7", startDate: utc("2025-11-03") },
      ],
    });
    expect(balance.taken.toString()).toBe("0");
    expect(balance.remaining.toString()).toBe("22");
  });

  it("shows a manual adjustment as part of the entitlement", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [
        { leaveTypeId: "annual", year: 2026, granted: "22", carriedOver: "0", adjustment: "-2" },
      ],
      requests: [],
    });
    expect(balance.entitled.toString()).toBe("20");
  });

  it("falls back to the type's accrued default when nobody has run the grant", () => {
    // A new joiner with no entitlement row has leave; showing zero reads as "you
    // have none" rather than "the grant has not run".
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [{ ...ANNUAL, accrualMethod: "MONTHLY_ACCRUAL" }],
      entitlements: [],
      requests: [],
      monthsElapsed: 6,
    });
    expect(balance.entitled.toString()).toBe("11");
  });

  it("does not pretend an unlimited type has a remaining figure", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [COMPASSIONATE],
      entitlements: [],
      requests: [
        {
          leaveTypeId: "compassionate",
          status: "APPROVED",
          workingDays: "3",
          startDate: utc("2026-03-02"),
        },
      ],
    });
    expect(balance.isUnlimited).toBe(true);
    expect(balance.taken.toString()).toBe("3");
    expect(balance.remaining.toString()).toBe("0");
  });

  it("carries the policy note through so the rule shows next to the number", () => {
    const [balance] = computeLeaveBalances({
      year: 2026,
      leaveTypes: [ANNUAL],
      entitlements: [],
      requests: [],
    });
    expect(balance.policyNote).toBe("Unused days expire 31 December");
  });
});

describe("affordability", () => {
  const balanceWith = (remaining: string) => ({
    leaveTypeId: "annual",
    code: "ANNUAL",
    name: "Annual leave",
    policyNote: null,
    entitled: new Prisma.Decimal("22"),
    taken: new Prisma.Decimal("0"),
    pending: new Prisma.Decimal("0"),
    remaining: new Prisma.Decimal(remaining),
    isUnlimited: false,
  });

  it("allows a request within the balance", () => {
    expect(
      leaveAffordabilityDenial({ balance: balanceWith("5"), requestedDays: "5" }),
    ).toBeNull();
  });

  it("says how many days are left and how many were asked for", () => {
    const denial = leaveAffordabilityDenial({
      balance: balanceWith("3"),
      requestedDays: "5",
    });
    expect(denial).toContain("3");
    expect(denial).toContain("5");
  });

  it("refuses a range with no working days in it", () => {
    // Booking a weekend costs nothing, which means it also achieves nothing.
    expect(
      leaveAffordabilityDenial({ balance: balanceWith("10"), requestedDays: "0" }),
    ).toMatch(/no working days/i);
  });

  it("never refuses an unlimited type", () => {
    expect(
      leaveAffordabilityDenial({
        balance: { ...balanceWith("0"), isUnlimited: true },
        requestedDays: "40",
      }),
    ).toBeNull();
  });
});
