import { describe, expect, it } from "vitest";

import { trustedClientAddress } from "./client-address";

describe("trustedClientAddress", () => {
  it("takes the address our proxy appended, not the one the client wrote first", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 198.51.100.7" });
    expect(trustedClientAddress(headers, false)).toBe("198.51.100.7");
  });

  it("takes x-real-ip on Vercel, whose edge overwrites it", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.7" });
    expect(trustedClientAddress(headers, true)).toBe("198.51.100.7");
  });

  it("says unknown when nothing names the caller", () => {
    expect(trustedClientAddress(new Headers(), false)).toBe("unknown");
  });
});
