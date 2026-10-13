import { describe, expect, it } from "vitest";

import { builderSurface } from "./paths";

describe("builderSurface", () => {
  it("keeps the rail for a report's builder", () => {
    expect(builderSurface("/reports/c/9301a491/edit")).toBe("rail");
  });
  it("takes the whole window to arrange a report's page", () => {
    expect(builderSurface("/reports/crm-deals/arrange")).toBe("full");
  });
  it("leaves every other page in the shell", () => {
    expect(builderSurface("/reports/c/9301a491")).toBeNull();
    expect(builderSurface("/reports/crm-deals")).toBeNull();
    expect(builderSurface("/reports/insights/arrange")).toBeNull();
    expect(builderSurface("/books/invoices")).toBeNull();
  });
});
