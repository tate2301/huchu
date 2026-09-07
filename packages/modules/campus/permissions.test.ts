/**
 * School role permissions.
 *
 * The separation of duty a school expects — the bursar handles money, the
 * teacher handles marks, the warden handles beds — existed only as prose in the
 * persona catalogue. These assert it as behaviour.
 */

import { describe, it, expect } from "vitest";
import { canSchoolRoleDo, schoolPermissionDenial } from "./permissions";

describe("tenant administrators", () => {
  it("are not scoped by a vertical persona", () => {
    expect(canSchoolRoleDo("SUPERADMIN", "schools.fees", "write-off")).toBe(true);
    expect(canSchoolRoleDo("MANAGER", "schools.results", "publish")).toBe(true);
    expect(canSchoolRoleDo("superadmin", "schools.boarding", "allocate-bed")).toBe(true);
  });
});

describe("a teacher cannot touch money", () => {
  it("is refused every fee action", () => {
    for (const action of ["view", "issue", "receive-payment", "waive", "write-off", "void"]) {
      expect(canSchoolRoleDo("TEACHER", "schools.fees", action)).toBe(false);
    }
  });

  it("can still capture and submit attendance and marks", () => {
    expect(canSchoolRoleDo("TEACHER", "schools.attendance", "capture")).toBe(true);
    expect(canSchoolRoleDo("TEACHER", "schools.attendance", "submit")).toBe(true);
    expect(canSchoolRoleDo("TEACHER", "schools.results", "capture")).toBe(true);
    expect(canSchoolRoleDo("TEACHER", "schools.results", "submit")).toBe(true);
  });

  it("cannot moderate or publish its own marks", () => {
    expect(canSchoolRoleDo("TEACHER", "schools.results", "moderate")).toBe(false);
    expect(canSchoolRoleDo("TEACHER", "schools.results", "publish")).toBe(false);
  });
});

describe("a bursar cannot touch marks", () => {
  it("holds the fee ledger", () => {
    for (const action of ["view", "issue", "receive-payment", "waive", "write-off", "refund"]) {
      expect(canSchoolRoleDo("BURSAR", "schools.fees", action)).toBe(true);
    }
  });

  it("is refused results entirely", () => {
    expect(canSchoolRoleDo("BURSAR", "schools.results", "view")).toBe(false);
    expect(canSchoolRoleDo("BURSAR", "schools.results", "publish")).toBe(false);
    expect(canSchoolRoleDo("BURSAR", "schools.results", "capture")).toBe(false);
  });

  it("cannot enrol or take a register", () => {
    expect(canSchoolRoleDo("BURSAR", "schools.admissions", "create")).toBe(false);
    expect(canSchoolRoleDo("BURSAR", "schools.attendance", "capture")).toBe(false);
  });
});

describe("an HOD moderates but does not capture", () => {
  it("can moderate, request changes and approve", () => {
    expect(canSchoolRoleDo("HOD", "schools.results", "moderate")).toBe(true);
    expect(canSchoolRoleDo("HOD", "schools.results", "request-changes")).toBe(true);
    expect(canSchoolRoleDo("HOD", "schools.results", "approve")).toBe(true);
  });

  it("cannot enter marks or publish them", () => {
    expect(canSchoolRoleDo("HOD", "schools.results", "capture")).toBe(false);
    expect(canSchoolRoleDo("HOD", "schools.results", "publish")).toBe(false);
  });

  it("cannot touch fees or boarding", () => {
    expect(canSchoolRoleDo("HOD", "schools.fees", "view")).toBe(false);
    expect(canSchoolRoleDo("HOD", "schools.boarding", "allocate-bed")).toBe(false);
  });
});

describe("a warden runs boarding and nothing else", () => {
  it("can allocate, approve leave and record movements", () => {
    for (const action of ["allocate-bed", "approve-leave", "check-in", "check-out"]) {
      expect(canSchoolRoleDo("WARDEN", "schools.boarding", action)).toBe(true);
    }
  });

  it("cannot touch fees or results", () => {
    expect(canSchoolRoleDo("WARDEN", "schools.fees", "receive-payment")).toBe(false);
    expect(canSchoolRoleDo("WARDEN", "schools.results", "view")).toBe(false);
  });
});

describe("a registrar runs records", () => {
  it("can admit, enrol and invite", () => {
    expect(canSchoolRoleDo("REGISTRAR", "schools.admissions", "approve")).toBe(true);
    expect(canSchoolRoleDo("REGISTRAR", "schools.students", "create")).toBe(true);
    expect(canSchoolRoleDo("REGISTRAR", "schools.students", "invite")).toBe(true);
  });

  it("can see fees but not move money", () => {
    expect(canSchoolRoleDo("REGISTRAR", "schools.fees", "view")).toBe(true);
    expect(canSchoolRoleDo("REGISTRAR", "schools.fees", "receive-payment")).toBe(false);
    expect(canSchoolRoleDo("REGISTRAR", "schools.fees", "write-off")).toBe(false);
  });
});

describe("a school admin holds everything", () => {
  it("is allowed across every school resource", () => {
    expect(canSchoolRoleDo("SCHOOL_ADMIN", "schools.fees", "write-off")).toBe(true);
    expect(canSchoolRoleDo("SCHOOL_ADMIN", "schools.results", "publish")).toBe(true);
    expect(canSchoolRoleDo("SCHOOL_ADMIN", "schools.boarding", "allocate-bed")).toBe(true);
    expect(canSchoolRoleDo("SCHOOL_ADMIN", "schools.academics", "create")).toBe(true);
  });
});

describe("portal roles reach no staff surface", () => {
  it("refuses parents and students everywhere", () => {
    for (const role of ["PARENT", "STUDENT"]) {
      expect(canSchoolRoleDo(role, "schools.fees", "view")).toBe(false);
      expect(canSchoolRoleDo(role, "schools.students", "view")).toBe(false);
      expect(canSchoolRoleDo(role, "schools.results", "view")).toBe(false);
    }
  });
});

describe("roles from other verticals", () => {
  it("reach nothing in a school", () => {
    for (const role of ["CASHIER", "SALES_EXEC", "STOCK_CLERK", "SHOP_MANAGER"]) {
      expect(canSchoolRoleDo(role, "schools.fees", "view")).toBe(false);
      expect(canSchoolRoleDo(role, "schools.students", "view")).toBe(false);
    }
  });

  it("refuses an unknown, empty or missing role", () => {
    expect(canSchoolRoleDo("NOT_A_ROLE", "schools.fees", "view")).toBe(false);
    expect(canSchoolRoleDo("", "schools.fees", "view")).toBe(false);
    expect(canSchoolRoleDo(null, "schools.fees", "view")).toBe(false);
    expect(canSchoolRoleDo(undefined, "schools.fees", "view")).toBe(false);
  });
});

describe("denial messages", () => {
  it("says what was refused, and nothing when allowed", () => {
    expect(
      schoolPermissionDenial({ user: { role: "TEACHER" } }, "schools.fees", "receive-payment"),
    ).toContain("receive payment");
    expect(
      schoolPermissionDenial({ user: { role: "BURSAR" } }, "schools.fees", "receive-payment"),
    ).toBeNull();
  });
});
