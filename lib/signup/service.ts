import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/crm/phone";
import { logAuthEvent } from "@/lib/auth-core/events";
import { issueEmailCode, verifyEmailCode } from "@/lib/auth-core/email-code";
import { sendEmailCodeMail } from "@/lib/auth-core/email-code-mail";
import { createSessionHandoff } from "@/lib/auth-core/session-handoff";
import { SlugTakenError, provisionTenant } from "@/lib/platform/provision";
import { getProduct, getTrialTierCode, type ProductDefinition } from "@/lib/platform/products";
import {
  checkWorkspaceSlug,
  describeWorkspaceSlugProblem,
  suggestWorkspaceSlug,
} from "@/lib/signup/workspace-address";
import { normaliseZimbabweMobile } from "@/lib/signup/whatsapp-number";

/**
 * Self-serve signup: a stranger on a product's signup page becomes the first
 * admin of a new workspace, with nobody from Corelith involved.
 *
 * Three steps, each its own call, because each is its own page and a phone on
 * a patchy connection will retry any of them:
 *
 * 1. `startSignup` — name and email. Sends a six-digit code.
 * 2. `verifySignupCode` — the code proves the address.
 * 3. `createWorkspaceFromSignup` — business name, address and WhatsApp number.
 *    Provisions the workspace on the product's trial and returns a one-use
 *    ticket that signs the new admin in on the workspace's own host.
 *
 * Every step is safe to repeat. The third in particular: a request that has
 * already made its workspace returns that workspace again with a fresh ticket.
 */

const NAME_MIN = 2;
const NAME_MAX = 80;
const ATTRIBUTION_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
  "referrer",
  "landingPath",
] as const;

export type SignupAttribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

type CodeRefusal = { ok: false; reason: "TOO_SOON" | "TOO_MANY"; retryAfterSeconds: number };

export type StartSignupResult =
  | { ok: true; requestId: string; email: string }
  | { ok: false; reason: "INVALID_NAME" | "INVALID_EMAIL" | "ACCOUNT_EXISTS" | "EMAIL_FAILED" }
  | CodeRefusal;

export type ResendSignupCodeResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_VERIFIED" | "EMAIL_FAILED" }
  | CodeRefusal;

export type VerifySignupCodeResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "INVALID" | "EXPIRED" | "LOCKED" | "MISSING" };

export type CreateWorkspaceResult =
  | { ok: true; companySlug: string; handoffToken: string; homePath: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_VERIFIED" | "INVALID_NAME" | "INVALID_WHATSAPP" | "ACCOUNT_EXISTS" }
  | { ok: false; reason: "INVALID_SLUG"; message: string }
  | { ok: false; reason: "SLUG_TAKEN"; suggestion: string | null };

function cleanName(value: string): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name.length >= NAME_MIN && name.length <= NAME_MAX ? name : null;
}

function cleanAttribution(input: SignupAttribution | null | undefined): Prisma.InputJsonObject | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 300);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function hasAccount(email: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  return Boolean(user);
}

async function deliverSignupCode(product: ProductDefinition, email: string, code: string) {
  try {
    await sendEmailCodeMail({ to: email, code, productName: product.name, purpose: "SIGNUP" });
    return { ok: true as const };
  } catch (error) {
    console.error("[signup] code email failed", error);
    return { ok: false as const, reason: "EMAIL_FAILED" as const };
  }
}

export async function startSignup(
  input: { product: ProductDefinition; name: string; email: string; attribution?: SignupAttribution | null },
  now = new Date(),
): Promise<StartSignupResult> {
  const name = cleanName(input.name);
  if (!name) return { ok: false, reason: "INVALID_NAME" };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "INVALID_EMAIL" };

  // One address, one account, until a person can belong to more than one
  // workspace. Saying so here beats sending a code for a signup that would
  // fail at the last step.
  if (await hasAccount(email)) return { ok: false, reason: "ACCOUNT_EXISTS" };

  // The code is issued before the request is written, so a throttled attempt
  // leaves nothing behind.
  const issued = await issueEmailCode({ email, purpose: "SIGNUP" }, now);
  if (!issued.ok) return issued;

  const request = await prisma.signupRequest.create({
    data: { product: input.product.id, email, name, attribution: cleanAttribution(input.attribution) },
    select: { id: true },
  });

  const sent = await deliverSignupCode(input.product, email, issued.code);
  if (!sent.ok) return sent;

  await logAuthEvent({
    eventType: "signup.started",
    actor: email,
    entityType: "signup-request",
    entityId: request.id,
    payload: { product: input.product.id },
  });

  return { ok: true, requestId: request.id, email };
}

/** The request behind the signup cookie, while it is still open. */
export async function getSignupRequest(requestId: string | null | undefined) {
  if (!requestId) return null;
  return prisma.signupRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      product: true,
      email: true,
      name: true,
      verifiedAt: true,
      companyId: true,
      company: { select: { slug: true } },
    },
  });
}

export async function resendSignupCode(requestId: string, now = new Date()): Promise<ResendSignupCodeResult> {
  const request = await getSignupRequest(requestId);
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (request.verifiedAt) return { ok: false, reason: "ALREADY_VERIFIED" };
  const issued = await issueEmailCode({ email: request.email, purpose: "SIGNUP" }, now);
  if (!issued.ok) return issued;
  return deliverSignupCode(getProduct(request.product), request.email, issued.code);
}

export async function verifySignupCode(
  requestId: string,
  code: string,
  now = new Date(),
): Promise<VerifySignupCodeResult> {
  const request = await getSignupRequest(requestId);
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (request.verifiedAt) return { ok: true };

  const result = await verifyEmailCode({ email: request.email, purpose: "SIGNUP", code }, now);
  if (!result.ok) return result;

  await prisma.signupRequest.update({ where: { id: request.id }, data: { verifiedAt: now } });
  await logAuthEvent({
    eventType: "signup.verified",
    actor: request.email,
    entityType: "signup-request",
    entityId: request.id,
  });
  return { ok: true };
}

/** Whether an address already belongs to a workspace, or is held for one. */
export async function isWorkspaceSlugTaken(slug: string): Promise<boolean> {
  const [company, reservation] = await Promise.all([
    prisma.company.findUnique({ where: { slug }, select: { id: true } }),
    prisma.subdomainReservation.findUnique({ where: { subdomain: slug }, select: { id: true } }),
  ]);
  return Boolean(company || reservation);
}

/** The first free, valid address close to the one asked for. */
export async function findFreeWorkspaceSlug(slug: string): Promise<string | null> {
  const base = suggestWorkspaceSlug(slug).slice(0, 36).replace(/-+$/, "");
  const candidates = [base, `${base}-hq`, `${base}-zw`, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)];
  for (const candidate of candidates) {
    if (checkWorkspaceSlug(candidate)) continue;
    if (!(await isWorkspaceSlugTaken(candidate))) return candidate;
  }
  return null;
}

/** Workspace name suggested by a work email's domain; nothing for free mail. */
export function suggestBusinessName(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const freeMail = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|proton|protonmail|aol|zoho)\./;
  if (!domain || freeMail.test(domain)) return "";
  const label = domain.split(".")[0] ?? "";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function createWorkspaceFromSignup(
  requestId: string,
  input: { businessName: string; slug: string; whatsapp: string },
  now = new Date(),
): Promise<CreateWorkspaceResult> {
  const request = await getSignupRequest(requestId);
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (!request.verifiedAt) return { ok: false, reason: "NOT_VERIFIED" };

  const product = getProduct(request.product);

  // Already made: the submit was retried. Same workspace, fresh ticket.
  if (request.companyId && request.company) {
    const admin = await prisma.user.findFirst({
      where: { companyId: request.companyId, email: request.email },
      select: { id: true },
    });
    if (admin) {
      return {
        ok: true,
        companySlug: request.company.slug,
        handoffToken: await createSessionHandoff(admin.id, now),
        homePath: product.homePath,
      };
    }
  }

  const businessName = cleanName(input.businessName);
  if (!businessName) return { ok: false, reason: "INVALID_NAME" };

  const slug = String(input.slug ?? "").trim().toLowerCase();
  const slugProblem = checkWorkspaceSlug(slug);
  if (slugProblem) return { ok: false, reason: "INVALID_SLUG", message: describeWorkspaceSlugProblem(slugProblem) };

  const whatsapp = normaliseZimbabweMobile(input.whatsapp);
  if (!whatsapp) return { ok: false, reason: "INVALID_WHATSAPP" };

  // A company already on this address is ours only if this request's admin is
  // in it — a first attempt that provisioned and then lost its connection.
  // Anyone else's is taken, and provisioning is told to refuse rather than
  // resume, so a race for the same address can never add a stranger to it.
  const existing = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, users: { where: { email: request.email }, select: { id: true } } },
  });
  const resumingOwnAttempt = Boolean(existing && existing.users.length > 0);
  if ((existing && !resumingOwnAttempt) || (!existing && (await isWorkspaceSlugTaken(slug)))) {
    return { ok: false, reason: "SLUG_TAKEN", suggestion: await findFreeWorkspaceSlug(slug) };
  }

  let provisioned;
  try {
    provisioned = await provisionTenant(
      {
        name: businessName,
        slug,
        product: product.id,
        templateCode: product.templateCode ?? undefined,
        tierCode: getTrialTierCode(product),
        adminEmail: request.email,
        adminName: request.name,
        subscriptionStatus: "TRIALING",
        trialDays: product.trialDays,
        actor: `signup:${request.id}`,
        reason: `Self-serve signup for ${product.name}`,
        onExistingSlug: resumingOwnAttempt ? "resume" : "refuse",
      },
      now,
    );
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { ok: false, reason: "SLUG_TAKEN", suggestion: await findFreeWorkspaceSlug(slug) };
    }
    if (error instanceof Error && /already belongs to another tenant/.test(error.message)) {
      return { ok: false, reason: "ACCOUNT_EXISTS" };
    }
    throw error;
  }

  const companyId = provisioned.company.id;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: provisioned.admin.id },
      data: { phone: whatsapp, emailVerified: request.verifiedAt },
    }),
    prisma.signupRequest.update({ where: { id: request.id }, data: { companyId } }),
  ]);

  await logAuthEvent({
    eventType: "signup.workspace-created",
    actor: request.email,
    companyId,
    entityType: "signup-request",
    entityId: request.id,
    payload: { product: product.id, slug, tier: provisioned.subscription.planCode },
  });

  return {
    ok: true,
    companySlug: provisioned.company.slug,
    handoffToken: await createSessionHandoff(provisioned.admin.id, now),
    homePath: product.homePath,
  };
}
