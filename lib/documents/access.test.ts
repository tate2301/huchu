import { describe, expect, it } from "vitest";

import { canReadRenderJob } from "./access";

const job = { companyId: "c1", requestedById: "u1" };

describe("canReadRenderJob", () => {
  it("lets the requester read their own job", () => {
    expect(canReadRenderJob({ id: "u1", role: "SALES_REP", companyId: "c1" }, job)).toBe(true);
  });

  it("keeps a colleague out", () => {
    expect(canReadRenderJob({ id: "u2", role: "SALES_REP", companyId: "c1" }, job)).toBe(false);
  });

  it("lets a manager in the same company read any job", () => {
    expect(canReadRenderJob({ id: "u3", role: "MANAGER", companyId: "c1" }, job)).toBe(true);
    expect(canReadRenderJob({ id: "u3", role: "SUPERADMIN", companyId: "c1" }, job)).toBe(true);
  });

  it("keeps everybody in another company out", () => {
    expect(canReadRenderJob({ id: "u1", role: "SUPERADMIN", companyId: "c2" }, job)).toBe(false);
  });

  it("treats a job nobody requested as a manager's", () => {
    const orphan = { companyId: "c1", requestedById: null };
    expect(canReadRenderJob({ id: "u1", role: "SALES_REP", companyId: "c1" }, orphan)).toBe(false);
    expect(canReadRenderJob({ id: "u3", role: "MANAGER", companyId: "c1" }, orphan)).toBe(true);
  });
});
