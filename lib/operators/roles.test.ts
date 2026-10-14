import { describe, expect, it } from "vitest";

import { OPERATOR_ACTIONS, operatorCan } from "@/lib/operators/roles";

describe("what each operator role may do", () => {
  it("lets an owner do everything", () => {
    for (const action of OPERATOR_ACTIONS) expect(operatorCan("OWNER", action)).toBe(true);
  });

  it("keeps money from support, and closing, owners and operators from both", () => {
    for (const action of ["billing.manage", "payment.review", "workspace.close", "workspace.changeOwner", "operator.manage"] as const) {
      expect(operatorCan("SUPPORT", action)).toBe(false);
    }
    for (const action of ["member.manage", "workspace.close", "operator.manage", "member.signInAsChange"] as const) {
      expect(operatorCan("BILLING", action)).toBe(false);
    }
  });

  it("lets billing look as a member, but only support and owners make changes as one", () => {
    expect(operatorCan("BILLING", "member.signInAs")).toBe(true);
    expect(operatorCan("SUPPORT", "member.signInAsChange")).toBe(true);
  });
});
