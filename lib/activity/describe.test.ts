import { describe, expect, it } from "vitest";

import {
  activityEventType,
  activityModuleForPath,
  describeChange,
  describeRecordLabel,
  humanizeModel,
} from "./describe";

describe("describeChange", () => {
  it("names an update's record and lists the fields it set", () => {
    const change = describeChange({
      model: "Employee",
      operation: "update",
      queryArgs: {
        where: { id: "e1" },
        data: { status: "ACTIVE", salary: 1200, updatedAt: new Date(), jobGrade: { connect: { id: "g" } } },
      },
      result: { id: "e1", firstName: "Rudo", lastName: "Moyo" },
    });
    expect(change).toEqual({
      model: "Employee",
      action: "updated",
      recordId: "e1",
      label: "Rudo Moyo",
      fields: [
        { name: "status", value: "ACTIVE" },
        { name: "salary", value: "1200" },
        { name: "jobGrade" },
      ],
    });
  });

  it("never records a secret's value", () => {
    const change = describeChange({
      model: "User",
      operation: "update",
      queryArgs: { data: { password: "hunter2", passwordResetToken: "abc" } },
      result: { id: "u1", email: "a@b.test" },
    });
    expect(change?.fields).toEqual([{ name: "password" }, { name: "passwordResetToken" }]);
  });

  it("counts a bulk write and skips one that touched nothing", () => {
    expect(
      describeChange({ model: "Site", operation: "deleteMany", queryArgs: {}, result: { count: 3 } }),
    ).toEqual({ model: "Site", action: "deleted", recordId: null, label: null, count: 3 });
    expect(
      describeChange({ model: "Site", operation: "deleteMany", queryArgs: {}, result: { count: 0 } }),
    ).toBeNull();
  });

  it("ignores reads and bookkeeping tables", () => {
    expect(describeChange({ model: "Site", operation: "findMany", queryArgs: {}, result: [] })).toBeNull();
    expect(
      describeChange({ model: "PlatformAuditEvent", operation: "create", queryArgs: {}, result: { id: "x" } }),
    ).toBeNull();
  });
});

describe("words", () => {
  it("labels a record by name, then number, then email", () => {
    expect(describeRecordLabel({ id: "1", name: "Main shaft" })).toBe("Main shaft");
    expect(describeRecordLabel({ id: "1", invoiceNumber: "INV-0042" })).toBe("INV-0042");
    expect(describeRecordLabel({ id: "1", email: "a@b.test" })).toBe("a@b.test");
    expect(describeRecordLabel({ id: "1" })).toBeNull();
  });

  it("humanizes models and composes event types", () => {
    expect(humanizeModel("SchoolFeeInvoice")).toBe("School fee invoice");
    expect(activityEventType({ model: "SchoolFeeInvoice", action: "deleted" })).toBe(
      "SCHOOL_FEE_INVOICE.DELETED",
    );
  });

  it("files a request under its module", () => {
    expect(activityModuleForPath("/api/v2/schools/students/1")).toBe("schools");
    expect(activityModuleForPath("/api/hr/departments")).toBe("people");
    expect(activityModuleForPath("/api/gold/receipts")).toBe("gold");
  });
});
