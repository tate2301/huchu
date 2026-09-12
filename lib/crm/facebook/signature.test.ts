import { describe, expect, it } from "vitest";

import { signPayload, verifySignature, verifyTokenMatches } from "./signature";

const SECRET = "a-meta-app-secret-long-enough";
const BODY = JSON.stringify({
  object: "page",
  entry: [{ id: "101", time: 1757577600, changes: [{ field: "leadgen", value: { leadgen_id: "9" } }] }],
});

describe("verifySignature", () => {
  it("accepts a signature over the exact delivered bytes", () => {
    expect(verifySignature(BODY, signPayload(BODY, SECRET), SECRET)).toEqual({ ok: true });
  });

  it("rejects a signature made with a different app secret", () => {
    const other = signPayload(BODY, "some-other-app-secret-value");
    expect(verifySignature(BODY, other, SECRET)).toEqual({ ok: false, reason: "MISMATCH" });
  });

  it("rejects a body that changed after it was signed", () => {
    const signature = signPayload(BODY, SECRET);
    const tampered = BODY.replace('"leadgen_id":"9"', '"leadgen_id":"10"');
    expect(verifySignature(tampered, signature, SECRET)).toEqual({ ok: false, reason: "MISMATCH" });
  });

  it("rejects re-serialised JSON, which is why the route must read raw bytes", () => {
    const signature = signPayload(BODY, SECRET);
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifySignature(reserialised, signature, SECRET).ok).toBe(false);
  });

  it("names a missing header separately from a wrong one", () => {
    expect(verifySignature(BODY, null, SECRET)).toEqual({ ok: false, reason: "MISSING" });
    expect(verifySignature(BODY, "", SECRET)).toEqual({ ok: false, reason: "MISSING" });
  });

  it("rejects a header that is not sha256=", () => {
    expect(verifySignature(BODY, "sha1=abc123", SECRET)).toEqual({ ok: false, reason: "MALFORMED" });
  });

  it("does not throw on a signature of the wrong length", () => {
    expect(verifySignature(BODY, "sha256=deadbeef", SECRET)).toEqual({ ok: false, reason: "MISMATCH" });
  });
});

describe("verifyTokenMatches", () => {
  it("matches an identical token and nothing else", () => {
    expect(verifyTokenMatches("tok_abc", "tok_abc")).toBe(true);
    expect(verifyTokenMatches("tok_abd", "tok_abc")).toBe(false);
    expect(verifyTokenMatches("tok_ab", "tok_abc")).toBe(false);
    expect(verifyTokenMatches(null, "tok_abc")).toBe(false);
  });
});
