/**
 * Who may do what in HR.
 *
 * These are cheap assertions about a lookup table, and they earn their place
 * because the table is a policy decision that somebody will one day change
 * casually. The ones that matter most are the negative cases: an OPERATOR and a
 * TEACHER must reach nothing, and a CLERK must not be able to approve their own
 * work or move money.
 */

import { describe, it, expect } from "vitest";

import {
  canHrRoleDo,
  hasPayrollVisibility,
  hrPermissionDenial,
  HR_RESOURCES,
} from "./permissions";

const session = (role: string | null | undefined) => ({ user: { role } });

describe("tenant administrators", () => {
  it.each(["SUPERADMIN", "MANAGER"])("%s may do everything", (role) => {
    for (const resource of HR_RESOURCES) {
      expect(canHrRoleDo(role, resource, "view")).toBe(true);
      expect(canHrRoleDo(role, resource, "approve")).toBe(true);
      expect(canHrRoleDo(role, resource, "configure")).toBe(true);
    }
  });
});

describe("the payroll clerk", () => {
  it("prepares and submits a run", () => {
    expect(canHrRoleDo("CLERK", "hr.payroll", "view")).toBe(true);
    expect(canHrRoleDo("CLERK", "hr.payroll", "create")).toBe(true);
    expect(canHrRoleDo("CLERK", "hr.payroll", "edit")).toBe(true);
    expect(canHrRoleDo("CLERK", "hr.payroll", "submit")).toBe(true);
  });

  it("cannot approve it", () => {
    // The two-step workflow's whole point. `isTwoStepActionAllowed` stops one
    // person doing both; this stops the clerk doing the second half at all.
    expect(canHrRoleDo("CLERK", "hr.payroll", "approve")).toBe(false);
  });

  it("cannot move money", () => {
    expect(canHrRoleDo("CLERK", "hr.disbursements", "disburse")).toBe(false);
    expect(canHrRoleDo("CLERK", "hr.disbursements", "create")).toBe(false);
    // But can see what was paid, which is most of their job.
    expect(canHrRoleDo("CLERK", "hr.disbursements", "view")).toBe(true);
  });

  it("cannot change a statutory rate", () => {
    // A rate change has a filing consequence, and the person who prepares the
    // run should not also decide what it is computed on.
    expect(canHrRoleDo("CLERK", "hr.statutory", "view")).toBe(true);
    expect(canHrRoleDo("CLERK", "hr.statutory", "configure")).toBe(false);
    expect(canHrRoleDo("CLERK", "hr.statutory", "edit")).toBe(false);
  });
});

describe("roles with no business in HR", () => {
  it("gives an OPERATOR the register and nothing else", () => {
    // This case used to assert they got *nothing*, under a comment saying "they
    // mark attendance" — which was true only because the attendance API had no
    // role check to deny them. `hr.attendance` makes the grant explicit and, in
    // doing so, actually narrows it: before, any signed-in user could write to a
    // register, and `Attendance.overtime` is read straight into a payroll run.
    expect(canHrRoleDo("OPERATOR", "hr.attendance", "view")).toBe(true);
    expect(canHrRoleDo("OPERATOR", "hr.attendance", "create")).toBe(true);
    expect(canHrRoleDo("OPERATOR", "hr.attendance", "edit")).toBe(true);

    // Marking is not a two-step workflow, and nothing about a register is
    // configuration.
    expect(canHrRoleDo("OPERATOR", "hr.attendance", "approve")).toBe(false);
    expect(canHrRoleDo("OPERATOR", "hr.attendance", "configure")).toBe(false);

    // Everything else stays shut. Their own payslip reaches them through the
    // row-level self-service check, not through a role grant.
    for (const resource of HR_RESOURCES) {
      if (resource === "hr.attendance") continue;
      expect(canHrRoleDo("OPERATOR", resource, "view")).toBe(false);
    }
  });

  it.each(["TEACHER", "PARENT", "STUDENT", "BURSAR", "REGISTRAR", "WARDEN", "HOD"])(
    "gives a %s nothing",
    (role) => {
      // These share the `UserRole` enum with the HR roles, so a school running
      // payroll here would otherwise expose the salary bill to its teachers.
      // A BURSAR handles school fees, which is not the same as the payroll.
      //
      // No exemption for `hr.attendance` in this loop, unlike the OPERATOR case
      // above: a workforce register is not a teacher's or a parent's to read
      // either, and a school marks class attendance through `schools.attendance`,
      // which is a different table and a different question.
      for (const resource of HR_RESOURCES) {
        expect(canHrRoleDo(role, resource, "view")).toBe(false);
      }
    },
  );

  it("denies an absent or empty role", () => {
    expect(canHrRoleDo(null, "hr.payroll", "view")).toBe(false);
    expect(canHrRoleDo(undefined, "hr.payroll", "view")).toBe(false);
    expect(canHrRoleDo("", "hr.payroll", "view")).toBe(false);
    expect(canHrRoleDo("NOT_A_ROLE", "hr.payroll", "view")).toBe(false);
  });

  it("normalises case and whitespace rather than failing open or closed on it", () => {
    expect(canHrRoleDo("  manager ", "hr.payroll", "approve")).toBe(true);
    expect(canHrRoleDo("Clerk", "hr.payroll", "approve")).toBe(false);
  });
});

describe("hrPermissionDenial", () => {
  it("returns null when allowed", () => {
    expect(hrPermissionDenial(session("MANAGER"), "hr.payroll", "approve")).toBeNull();
  });

  it("returns a message a person can act on", () => {
    // A message rather than a throw, because a throw is caught by the generic
    // handler and reported as a 500 — telling the caller the server is broken
    // when in fact they simply may not.
    expect(hrPermissionDenial(session("CLERK"), "hr.payroll", "approve")).toBe(
      "Your role cannot approve payroll",
    );
    expect(hrPermissionDenial(session("OPERATOR"), "hr.payslips", "view")).toBe(
      "Your role cannot view payslips",
    );
  });
});

describe("hasPayrollVisibility", () => {
  it("is the question the payslip route asks", () => {
    expect(hasPayrollVisibility("MANAGER")).toBe(true);
    expect(hasPayrollVisibility("CLERK")).toBe(true);
    // An operator has none — so the payslip route falls through to matching
    // `Employee.userId`, and they get their own or nothing.
    expect(hasPayrollVisibility("OPERATOR")).toBe(false);
    expect(hasPayrollVisibility("TEACHER")).toBe(false);
  });
});
