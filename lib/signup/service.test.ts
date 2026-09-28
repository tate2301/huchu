/**
 * Self-serve signup, end to end against a real database.
 *
 * What a stranger must never be able to do: sign up without owning the
 * address, take an address somebody else has, get a second workspace by
 * pressing the button twice, or land as an admin in a company that is not
 * theirs. What they must always get: a Flare workspace on a trial, with the
 * CRM switched on and the till switched off.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sentCodes = new Map<string, string>();
vi.mock("@/lib/auth-core/email-code-mail", () => ({
  sendEmailCodeMail: async (input: { to: string; code: string }) => {
    sentCodes.set(input.to, input.code);
  },
}));

import { prisma } from "@/lib/prisma";
import { consumeSessionHandoff } from "@/lib/auth-core/session-handoff";
import { getCompanyFeatureMap } from "@/lib/platform/entitlements";
import { getProduct } from "@/lib/platform/products";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import {
  createWorkspaceFromSignup,
  findFreeWorkspaceSlug,
  resendSignupCode,
  startSignup,
  suggestBusinessName,
  verifySignupCode,
} from "./service";

const STAMP = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const FLARE = getProduct("FLARE");
const T0 = new Date("2026-09-28T08:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const createdEmails: string[] = [];
const createdSlugs: string[] = [];

function email(tag: string) {
  const value = `${tag}-${STAMP}@signup.example`;
  createdEmails.push(value);
  return value;
}

function slug(tag: string) {
  const value = `su-${tag}-${STAMP}`.slice(0, 40);
  createdSlugs.push(value);
  return value;
}

function at(ms: number) {
  return new Date(T0.getTime() + ms);
}

async function verifiedRequest(tag: string) {
  const address = email(tag);
  const started = await startSignup({ product: FLARE, name: "Tendai Moyo", email: address }, T0);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  const verified = await verifySignupCode(started.requestId, sentCodes.get(address) ?? "", at(1_000));
  if (!verified.ok) throw new Error(`verify failed: ${verified.reason}`);
  return { requestId: started.requestId, address };
}

async function destroy() {
  for (const value of createdSlugs) {
    const company = await prisma.company.findUnique({ where: { slug: value }, select: { id: true } });
    if (company) await destroyProvisionedTenant(company.id);
  }
  await prisma.signupRequest.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.emailCode.deleteMany({ where: { email: { in: createdEmails } } });
}

beforeEach(() => sentCodes.clear());
afterAll(async () => {
  await destroy();
  // A teardown that fails quietly is how test tenants piled up before; this
  // one says so.
  expect(await prisma.company.count({ where: { slug: { in: createdSlugs } } })).toBe(0);
  await prisma.$disconnect();
});

describe("startSignup", () => {
  it("sends a code and remembers who asked, with where they came from", async () => {
    const address = email("start");
    const result = await startSignup(
      { product: FLARE, name: "  Tendai   Moyo ", email: address.toUpperCase(), attribution: { utmSource: "facebook", referrer: "" } },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toBe(address);
    expect(sentCodes.get(address)).toMatch(/^\d{6}$/);

    const request = await prisma.signupRequest.findUniqueOrThrow({ where: { id: result.requestId } });
    expect(request).toMatchObject({ product: "FLARE", email: address, name: "Tendai Moyo", verifiedAt: null });
    expect(request.attribution).toEqual({ utmSource: "facebook" });
  });

  it("refuses a missing name and a malformed address", async () => {
    expect(await startSignup({ product: FLARE, name: " ", email: email("noname") }, T0)).toEqual({
      ok: false,
      reason: "INVALID_NAME",
    });
    expect(await startSignup({ product: FLARE, name: "Tendai", email: "tendai@" }, T0)).toEqual({
      ok: false,
      reason: "INVALID_EMAIL",
    });
  });

  it("tells somebody with an account to sign in instead of sending a code", async () => {
    const { requestId, address } = await verifiedRequest("existing");
    await createWorkspaceFromSignup(requestId, { businessName: "Existing Co", slug: slug("existing"), whatsapp: "0771234567" }, at(2_000));
    expect(await startSignup({ product: FLARE, name: "Tendai", email: address }, at(60_000))).toEqual({
      ok: false,
      reason: "ACCOUNT_EXISTS",
    });
  });

  it("leaves no request behind when the code is throttled", async () => {
    const address = email("throttle");
    await startSignup({ product: FLARE, name: "Tendai", email: address }, T0);
    const again = await startSignup({ product: FLARE, name: "Tendai", email: address }, at(5_000));
    expect(again).toMatchObject({ ok: false, reason: "TOO_SOON" });
    expect(await prisma.signupRequest.count({ where: { email: address } })).toBe(1);
  });
});

describe("verifySignupCode", () => {
  it("proves the address with the right code only", async () => {
    const address = email("verify");
    const started = await startSignup({ product: FLARE, name: "Tendai", email: address }, T0);
    if (!started.ok) throw new Error("start failed");
    const code = sentCodes.get(address) ?? "";
    const wrong = code === "000000" ? "111111" : "000000";

    expect(await verifySignupCode(started.requestId, wrong, at(1_000))).toEqual({ ok: false, reason: "INVALID" });
    expect(await verifySignupCode(started.requestId, code, at(2_000))).toEqual({ ok: true });
    // Pressing it again is fine.
    expect(await verifySignupCode(started.requestId, code, at(3_000))).toEqual({ ok: true });
    expect(await resendSignupCode(started.requestId, at(60_000))).toEqual({ ok: false, reason: "ALREADY_VERIFIED" });
  });

  it("knows nothing of a request it never made", async () => {
    expect(await verifySignupCode("00000000-0000-4000-8000-000000000000", "123456")).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });
});

describe("createWorkspaceFromSignup", () => {
  it("will not make a workspace for an address nobody proved", async () => {
    const address = email("unverified");
    const started = await startSignup({ product: FLARE, name: "Tendai", email: address }, T0);
    if (!started.ok) throw new Error("start failed");
    expect(
      await createWorkspaceFromSignup(started.requestId, { businessName: "Nope", slug: slug("unverified"), whatsapp: "0771234567" }),
    ).toEqual({ ok: false, reason: "NOT_VERIFIED" });
  });

  it(
    "makes a Flare workspace on a trial, with the CRM on and the till off, and a ticket into it",
    async () => {
      const { requestId, address } = await verifiedRequest("happy");
      const address_ = slug("happy");
      const result = await createWorkspaceFromSignup(
        requestId,
        { businessName: "Lux Liquor", slug: address_, whatsapp: "077 123 4567" },
        at(2_000),
      );
      expect(result).toMatchObject({ ok: true, companySlug: address_, homePath: "/crm" });
      if (!result.ok) return;

      const company = await prisma.company.findUniqueOrThrow({
        where: { slug: address_ },
        select: {
          id: true,
          name: true,
          product: true,
          tenantStatus: true,
          isProvisioned: true,
          subscriptions: { select: { status: true, trialEndsAt: true, plan: { select: { code: true } } } },
          users: { select: { id: true, email: true, role: true, phone: true, emailVerified: true, password: true } },
        },
      });
      expect(company).toMatchObject({ name: "Lux Liquor", product: "FLARE", tenantStatus: "ACTIVE", isProvisioned: true });
      expect(company.subscriptions).toHaveLength(1);
      expect(company.subscriptions[0].status).toBe("TRIALING");
      expect(company.subscriptions[0].trialEndsAt?.getTime()).toBe(at(2_000).getTime() + 14 * DAY_MS);

      expect(company.users).toHaveLength(1);
      expect(company.users[0]).toMatchObject({ email: address, role: "SUPERADMIN", phone: "+263771234567", password: null });
      expect(company.users[0].emailVerified).not.toBeNull();

      const features = await getCompanyFeatureMap(company.id);
      expect(features["crm.core"]).toBe(true);
      expect(features["retail.pos"]).toBe(false);

      expect(await consumeSessionHandoff(result.handoffToken, at(3_000))).toBe(company.users[0].id);
    },
    120_000,
  );

  it(
    "returns the same workspace when the button is pressed twice",
    async () => {
      const { requestId } = await verifiedRequest("twice");
      const address_ = slug("twice");
      const input = { businessName: "Twice Co", slug: address_, whatsapp: "0771234567" };
      const first = await createWorkspaceFromSignup(requestId, input, at(2_000));
      const second = await createWorkspaceFromSignup(requestId, input, at(3_000));
      expect(first).toMatchObject({ ok: true, companySlug: address_ });
      expect(second).toMatchObject({ ok: true, companySlug: address_ });
      if (!first.ok || !second.ok) return;
      expect(second.handoffToken).not.toBe(first.handoffToken);
      expect(await prisma.company.count({ where: { slug: address_ } })).toBe(1);
    },
    120_000,
  );

  it(
    "gives somebody else's address to nobody, and offers a free one",
    async () => {
      const owner = await verifiedRequest("owner");
      const taken = slug("taken");
      await createWorkspaceFromSignup(owner.requestId, { businessName: "Taken Co", slug: taken, whatsapp: "0771234567" }, at(2_000));

      const stranger = await verifiedRequest("stranger");
      const result = await createWorkspaceFromSignup(
        stranger.requestId,
        { businessName: "Taken Co", slug: taken, whatsapp: "0771234567" },
        at(3_000),
      );
      expect(result).toMatchObject({ ok: false, reason: "SLUG_TAKEN" });
      if (result.ok || result.reason !== "SLUG_TAKEN") return;
      expect(result.suggestion).toBeTruthy();
      expect(result.suggestion).not.toBe(taken);

      const company = await prisma.company.findUniqueOrThrow({ where: { slug: taken }, select: { id: true } });
      expect(await prisma.user.count({ where: { companyId: company.id, email: stranger.address } })).toBe(0);
    },
    120_000,
  );

  it("refuses a reserved address and a number WhatsApp cannot reach", async () => {
    const { requestId } = await verifiedRequest("refusals");
    expect(await createWorkspaceFromSignup(requestId, { businessName: "Co", slug: "admin", whatsapp: "0771234567" })).toMatchObject({
      ok: false,
      reason: "INVALID_SLUG",
    });
    expect(
      await createWorkspaceFromSignup(requestId, { businessName: "Co", slug: slug("landline"), whatsapp: "0242123456" }),
    ).toEqual({ ok: false, reason: "INVALID_WHATSAPP" });
  });
});

describe("suggestions", () => {
  it("names the business after a work email's domain, and not after free mail", () => {
    expect(suggestBusinessName("tendai@luxliquor.co.zw")).toBe("Luxliquor");
    expect(suggestBusinessName("tendai@lux-liquor.co.zw")).toBe("Lux Liquor");
    expect(suggestBusinessName("tendai@gmail.com")).toBe("");
    expect(suggestBusinessName("tendai@yahoo.co.uk")).toBe("");
  });

  it("offers the address itself when it is free", async () => {
    const free = `free-${STAMP}`;
    expect(await findFreeWorkspaceSlug(free)).toBe(free);
  });
});
