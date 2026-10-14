import { isReadOnlyHttpMethod } from "@/lib/platform/subscription";

/**
 * What an operator signed in as a member may not do, whatever they chose.
 *
 * Look only: nothing that writes. Make changes: what the member could do,
 * except the four things that are the member's own — their password, their
 * profile and email, and the workspace's payment method — because support
 * changing those is how an account is taken over. Ending the session is
 * always allowed: it is the way out.
 *
 * Kept free of the database so the API guards can ask it on every request.
 */

export type SignInAsClaim = {
  id: string;
  number: number;
  operatorName: string;
  mode: "LOOK" | "CHANGE";
  /** ISO time the session ends. */
  until: string;
};

export const END_SIGN_IN_AS_PATH = "/api/sign-in-as/end";

const NEVER_AS_A_MEMBER = [
  "/api/preferences/password",
  "/api/preferences/profile",
  "/api/preferences/billing",
  "/api/users/password-reset",
];

function within(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Why this request is refused while signed in as a member, or null when it may go ahead. */
export function signInAsRefusal(
  signInAs: SignInAsClaim | null | undefined,
  method: string | null | undefined,
  pathname: string | null | undefined,
): string | null {
  if (!signInAs || isReadOnlyHttpMethod(method)) return null;
  const path = pathname ?? "";
  if (within(path, END_SIGN_IN_AS_PATH)) return null;
  if (signInAs.mode === "LOOK") {
    return "You signed in to look only, so nothing can be changed. End the session and sign in again to make changes.";
  }
  if (NEVER_AS_A_MEMBER.some((base) => within(path, base))) {
    return "Support cannot change a member's password, email or payment method. Ask the member to.";
  }
  return null;
}
