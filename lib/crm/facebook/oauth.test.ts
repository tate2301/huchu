import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { FacebookAppConfig } from "./app";
import { authorizeUrl, signState, verifyState } from "./oauth";

const CONFIG: FacebookAppConfig = {
  appId: "120000000000001",
  appSecret: "a-platform-app-secret-value",
  webhookVerifyToken: "verify-me",
};

const OTHER: FacebookAppConfig = { ...CONFIG, appSecret: "a-different-app-secret" };

describe("state", () => {
  it("round-trips the workspace that started the flow", () => {
    const state = signState("company-123", CONFIG);
    expect(verifyState(state, CONFIG)).toEqual({ ok: true, companyId: "company-123" });
  });

  it("is different every time, so one captured link is not a reusable one", () => {
    expect(signState("company-123", CONFIG)).not.toBe(signState("company-123", CONFIG));
  });

  it("rejects a state signed by anything but this deployment", () => {
    expect(verifyState(signState("company-123", OTHER), CONFIG)).toEqual({
      ok: false,
      reason: "MISMATCH",
    });
  });

  it("rejects a state whose workspace was edited in transit", () => {
    const [, issuedAt, nonce, mac] = signState("company-123", CONFIG).split(".");
    const tampered = ["company-999", issuedAt, nonce, mac].join(".");
    expect(verifyState(tampered, CONFIG)).toEqual({ ok: false, reason: "MISMATCH" });
  });

  it("expires, so an old redirect cannot be replayed", () => {
    const [companyId, , nonce] = signState("company-123", CONFIG).split(".");
    const stale = `${companyId}.${Date.now() - 20 * 60 * 1000}.${nonce}`;
    const mac = createHmac("sha256", CONFIG.appSecret).update(stale).digest("base64url");
    expect(verifyState(`${stale}.${mac}`, CONFIG)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("rejects anything that is not a state at all", () => {
    expect(verifyState(null, CONFIG)).toEqual({ ok: false, reason: "MALFORMED" });
    expect(verifyState("", CONFIG)).toEqual({ ok: false, reason: "MALFORMED" });
    expect(verifyState("nonsense", CONFIG)).toEqual({ ok: false, reason: "MALFORMED" });
  });
});

describe("authorizeUrl", () => {
  it("asks for exactly the permissions the integration uses", () => {
    const url = new URL(authorizeUrl(signState("company-123", CONFIG), CONFIG));
    const scopes = (url.searchParams.get("scope") ?? "").split(",");

    expect(scopes).toContain("leads_retrieval");
    // Without this one the Page is never subscribed, and no lead ever arrives.
    expect(scopes).toContain("pages_manage_metadata");
    // Nothing beyond what is used — a consent screen that over-asks loses the
    // customer at the last step.
    expect(scopes).toEqual([
      "leads_retrieval",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
    ]);
  });

  it("sends the customer to Facebook with this deployment's app id", () => {
    const url = new URL(authorizeUrl("some-state", CONFIG));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.appId);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("some-state");
    expect(url.searchParams.get("redirect_uri")).toMatch(
      /\/api\/v2\/crm\/integrations\/facebook\/callback$/,
    );
  });
});
