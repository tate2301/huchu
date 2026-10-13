import { describe, expect, it } from "vitest";

import { isCronRequest } from "./cron-request";

describe("who may call the tick", () => {
  it("lets in the scheduler's bearer secret, and nothing else", () => {
    expect(isCronRequest("Bearer s3cret-value", "s3cret-value")).toBe(true);
    expect(isCronRequest("Bearer wrong", "s3cret-value")).toBe(false);
    expect(isCronRequest("s3cret-value", "s3cret-value")).toBe(false);
    expect(isCronRequest(null, "s3cret-value")).toBe(false);
  });

  it("refuses everyone when no secret is configured", () => {
    expect(isCronRequest("Bearer ", "")).toBe(false);
    expect(isCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});
