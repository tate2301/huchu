/**
 * How this host authenticates: the kernel's options, built once. The kernel
 * asks for them through `registerAuthOptions` (see `modules.ts`), and the
 * few host files that still read them by name read them here.
 */
import { createAuthOptions } from "@corelithzw/platform/auth-core/create-auth-options";
import { isAuthExpired } from "@corelithzw/platform/auth-core/session-policy";
import type { PlatformJwtClaims, SessionPolicy } from "@corelithzw/platform/auth-core/types";

export const authOptions = createAuthOptions();

export { isAuthExpired, type PlatformJwtClaims, type SessionPolicy };
