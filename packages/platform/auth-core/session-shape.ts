/**
 * The session as the kernel's auth options shape it.
 *
 * next-auth types a session's user as name, email and image; the kernel's
 * callbacks put the tenant claims on it — id, role, company, features. This
 * augmentation says so once, from the claims type the callbacks are written
 * against, and holds for every program that includes this file: the kernel's
 * session readers import it, a host references it from its next-auth.d.ts,
 * and a module component that reads the session imports it by path.
 */
import type { DefaultSession } from "next-auth";
import type { AuthSessionClaims } from "./types";

declare module "next-auth" {
  interface Session {
    user: AuthSessionClaims & DefaultSession["user"];
  }

  interface User extends AuthSessionClaims {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<AuthSessionClaims> {
    id?: string;
  }
}

export {};
