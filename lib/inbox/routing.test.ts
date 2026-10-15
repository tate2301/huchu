import { NotificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildRouting, categoryOf, kindOf, peopleLabel, routingFinding, ROUTING_KINDS, type Preference } from "./routing";

const pref = (patch: Partial<Preference> = {}): Preference => ({ emailEnabled: true, hrEnabled: true, opsEnabled: true, crmEnabled: true, ...patch });

describe("kindOf", () => {
  it("files every notification type under a kind the page lists", () => {
    const keys = new Set(ROUTING_KINDS.map((kind) => kind.key));
    for (const type of Object.values(NotificationType)) expect(keys.has(kindOf({ type, payload: null })), type).toBe(true);
  });

  it("reads the module a payload names before the type", () => {
    expect(kindOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "vane" } })).toBe("vane");
    expect(kindOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "books" } })).toBe("payments");
    expect(kindOf({ type: "HR_PAYROLL_SUBMITTED", payload: { module: "payroll" } })).toBe("approvals");
  });

  it("answers to the switch lib/notifications reads", () => {
    expect(categoryOf("HR_INCIDENT_CREATED")).toBe("HR");
    expect(categoryOf("CRM_MENTIONED")).toBe("CRM");
    expect(categoryOf("RETAIL_SHIFT_DIFFERENCE")).toBe("OPS");
  });
});

describe("buildRouting", () => {
  const names = new Map([
    ["u1", "James Nyabadza"],
    ["u2", "Rudo Moyo"],
  ]);

  it("counts the people each kind reached, and who of them is emailed", () => {
    const routing = buildRouting({
      received: [
        { userId: "u1", type: "HR_PAYROLL_SUBMITTED", payload: null },
        { userId: "u2", type: "HR_PAYROLL_SUBMITTED", payload: null },
        { userId: "u2", type: "CRM_REQUISITION_SUBMITTED", payload: null },
        { userId: "u1", type: "CRM_MENTIONED", payload: null },
      ],
      names,
      preferences: new Map([["u2", pref({ hrEnabled: false })]]),
      enabledFeatures: ["crm.core", "hr.payroll"],
      days: 30,
    });
    const approvals = routing.rows.find((row) => row.key === "approvals")!;
    expect(approvals.inApp).toEqual({ count: 2, names: ["James Nyabadza", "Rudo Moyo"] });
    // Rudo's HR switch is off, but the requisition is a CRM notice, so she is emailed it.
    expect(approvals.email.count).toBe(2);
    expect(routing.rows.find((row) => row.key === "mentions")!.inApp.count).toBe(1);
    expect(routing.heard).toBe(2);
  });

  it("lists the kinds the workspace can have, and any other that reached someone", () => {
    const routing = buildRouting({
      received: [{ userId: "u1", type: "RETAIL_SHIFT_DIFFERENCE", payload: null }],
      names,
      preferences: new Map(),
      enabledFeatures: ["crm.core"],
      days: 30,
    });
    const keys = routing.rows.map((row) => row.key);
    expect(keys).toContain("mentions");
    expect(keys).toContain("tills");
    expect(keys).not.toContain("notices");
    expect(routing.rows.find((row) => row.key === "decisions")!.inApp.count).toBe(0);
  });

  it("leaves out of email whoever turned it off", () => {
    const routing = buildRouting({
      received: [{ userId: "u1", type: "CRM_MENTIONED", payload: null }],
      names,
      preferences: new Map([["u1", pref({ emailEnabled: false })]]),
      enabledFeatures: ["crm.core"],
      days: 30,
    });
    expect(routing.rows.find((row) => row.key === "mentions")!.email.count).toBe(0);
  });
});

describe("words", () => {
  it("says what the workspace heard", () => {
    const routing = { rows: [], heard: 6, days: 30 };
    expect(routingFinding(routing, "Floorcode")).toBe("Floorcode heard about 6 kinds of thing in the last 30 days, in up to 2 places.");
    expect(routingFinding({ ...routing, heard: 0 }, "Floorcode")).toBe("Nobody at Floorcode was notified in the last 30 days.");
    expect(peopleLabel(1)).toBe("1 person");
  });
});
