import { NotificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { moduleForType, needsYou, subjectOf } from "./describe";
import { kindOf, ROUTING_KINDS } from "./routing";
import { allows, kindsFor, personalMatrix, workspaceMatrix, type SettingRow } from "./settings";

describe("kindOf", () => {
  it("files every notification type under a kind the pages list", () => {
    const keys = new Set(ROUTING_KINDS.map((kind) => kind.key));
    for (const type of Object.values(NotificationType)) expect(keys.has(kindOf({ type, payload: null })), type).toBe(true);
  });

  it("reads the module a payload names before the type", () => {
    expect(kindOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "vane" } })).toBe("vane");
    expect(kindOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "books" } })).toBe("payments");
    expect(kindOf({ type: "HR_PAYROLL_SUBMITTED", payload: { module: "payroll" } })).toBe("approvals");
  });

  it("gives Books, leave, reports and Vane their own kinds by type", () => {
    expect(kindOf({ type: "BOOKS_PAYMENT_RECEIVED", payload: null })).toBe("payments");
    expect(kindOf({ type: "BOOKS_INVOICE_PAID", payload: null })).toBe("payments");
    expect(kindOf({ type: "HR_LEAVE_SUBMITTED", payload: null })).toBe("approvals");
    expect(kindOf({ type: "HR_LEAVE_APPROVED", payload: null })).toBe("decisions");
    expect(kindOf({ type: "REPORT_SENT", payload: null })).toBe("reports");
    expect(kindOf({ type: "VANE_ISSUE_RAISED", payload: null })).toBe("vane");
  });

  it("files the new types under their modules, and asks for leave and Vane's issues", () => {
    expect(moduleForType("BOOKS_INVOICE_PAID")).toBe("books");
    expect(moduleForType("REPORT_SENT")).toBe("reports");
    expect(moduleForType("VANE_ISSUE_RAISED")).toBe("vane");
    expect(moduleForType("HR_LEAVE_SUBMITTED")).toBe("people");
    expect(needsYou({ type: "HR_LEAVE_SUBMITTED", payload: null })).toBe(true);
    expect(needsYou({ type: "VANE_ISSUE_RAISED", payload: null })).toBe(true);
    const id = "6f1c2a9e-1111-4c2d-9a8b-0123456789ab";
    expect(subjectOf({ type: "BOOKS_PAYMENT_RECEIVED", title: "", summary: "", entityType: "PAYMENT", entityId: id, payload: null })).toEqual({ kind: "receipt", id });
    expect(subjectOf({ type: "HR_LEAVE_SUBMITTED", title: "", summary: "", entityType: "LEAVE_REQUEST", entityId: id, payload: null })).toEqual({ kind: "leave", id });
  });
});

describe("who hears about what", () => {
  const rows: SettingRow[] = [
    { userId: null, kind: "payments", channel: "EMAIL", enabled: false },
    { userId: "u1", kind: "mentions", channel: "IN_APP", enabled: false },
    { userId: "u1", kind: "records", channel: "EMAIL", enabled: true },
  ];

  it("is on with no row, off when the workspace or the person turned it off", () => {
    expect(allows(rows, "u1", "approvals", "EMAIL")).toBe(true);
    expect(allows(rows, "u1", "payments", "EMAIL")).toBe(false);
    expect(allows(rows, "u2", "payments", "EMAIL")).toBe(false);
    expect(allows(rows, "u1", "payments", "IN_APP")).toBe(true);
    expect(allows(rows, "u1", "mentions", "IN_APP")).toBe(false);
    expect(allows(rows, "u2", "mentions", "IN_APP")).toBe(true);
  });

  it("lists only the kinds the workspace can have", () => {
    const keys = kindsFor(["accounting.sales"]).map((kind) => kind.key);
    expect(keys).toContain("payments");
    expect(keys).toContain("approvals");
    expect(keys).not.toContain("notices");
  });

  it("draws the workspace's rules, and a person's own beside what the workspace turned off", () => {
    const workspace = workspaceMatrix(rows, ["accounting.sales", "crm.leads"]);
    expect(workspace.find((row) => row.key === "payments")?.on).toEqual({ IN_APP: true, EMAIL: false });
    const own = personalMatrix(rows, "u1", ["accounting.sales", "crm.leads"]);
    expect(own.find((row) => row.key === "mentions")?.on).toEqual({ IN_APP: false, EMAIL: true });
    expect(own.find((row) => row.key === "payments")?.offForAll).toEqual({ IN_APP: false, EMAIL: true });
  });
});
