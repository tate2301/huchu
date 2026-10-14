"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import { acceptInvite } from "@/lib/operators/manage";
import { requestMeta, safeAdminPath } from "@/lib/operators/guards";
import {
  endSession,
  findSession,
  OPERATOR_COOKIE,
  PENDING_TTL_MS,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from "@/lib/operators/session";
import { checkCode, checkPassword, confirmAuthenticator, type CodeResult } from "@/lib/operators/sign-in";

export type SignInState = { error?: string; email?: string } | null;

const HARARE_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Harare",
});

function lockedMessage(until: Date) {
  return `Too many wrong tries. Sign-in is locked until ${HARARE_TIME.format(until)}.`;
}

function withCallback(path: string, callbackUrl: string) {
  return callbackUrl === "/admin" ? path : `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export async function signInWithPassword(_: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "");
  const callbackUrl = safeAdminPath(form.get("callbackUrl"));
  const result = await checkPassword({
    email,
    password: String(form.get("password") ?? ""),
    ...(await requestMeta()),
  });

  if (!result.ok) {
    return {
      email,
      error:
        result.reason === "locked"
          ? lockedMessage(result.until)
          : "That email and password do not match an operator.",
    };
  }

  const jar = await cookies();
  jar.set(OPERATOR_COOKIE, result.token, sessionCookieOptions(PENDING_TTL_MS));
  redirect(withCallback(result.next === "code" ? "/admin/login/code" : "/admin/login/set-up", callbackUrl));
}

function codeMessage(result: Exclude<CodeResult, { ok: true }>) {
  switch (result.reason) {
    case "locked":
      return lockedMessage(result.until);
    case "expired":
      return "That took longer than five minutes. Sign in again.";
    default:
      return "That code is not right. Enter the one your app shows now; it changes every 30 seconds.";
  }
}

async function finishCode(
  form: FormData,
  check: typeof checkCode,
): Promise<SignInState> {
  const jar = await cookies();
  const token = jar.get(OPERATOR_COOKIE)?.value;
  const result = await check(token, String(form.get("code") ?? ""));
  if (!result.ok) {
    if (result.reason !== "wrong") jar.delete(OPERATOR_COOKIE);
    return { error: codeMessage(result) };
  }
  jar.set(OPERATOR_COOKIE, token!, sessionCookieOptions(SESSION_TTL_MS));
  redirect(safeAdminPath(form.get("callbackUrl")));
}

export async function submitCode(_: SignInState, form: FormData): Promise<SignInState> {
  return finishCode(form, checkCode);
}

export async function confirmSetUp(_: SignInState, form: FormData): Promise<SignInState> {
  return finishCode(form, confirmAuthenticator);
}

export async function signOut() {
  const jar = await cookies();
  const session = await findSession(jar.get(OPERATOR_COOKIE)?.value);
  if (session) {
    await endSession(session.id);
    if (session.verifiedAt) {
      await recordOperatorEvent({
        operatorId: session.operator.id,
        eventType: "operator.signed_out",
        entityType: "operator",
        entityId: session.operator.id,
      });
    }
  }
  jar.delete(OPERATOR_COOKIE);
  redirect("/admin/login");
}

export async function acceptOperatorInvite(_: SignInState, form: FormData): Promise<SignInState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords are not the same." };
  let accepted;
  try {
    accepted = await acceptInvite(String(form.get("token") ?? ""), password, await requestMeta());
  } catch (error) {
    if (error instanceof AdminRefusal) return { error: error.message };
    throw error;
  }
  const jar = await cookies();
  jar.set(OPERATOR_COOKIE, accepted.sessionToken, sessionCookieOptions(PENDING_TTL_MS));
  redirect(accepted.next === "code" ? "/admin/login/code" : "/admin/login/set-up");
}
