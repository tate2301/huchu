"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import "@corelithzw/platform/auth-core/session-shape";

import { schoolAccess, type SchoolAccess } from "../../access";

/**
 * The signed-in person's campus grants, for gating controls in the browser.
 *
 * This decides what is *rendered*; the API decides what is *allowed*. Both read
 * `lib/platform/personas.ts`, so they cannot drift, and neither is a substitute
 * for the other — a hidden button is a courtesy, not a security boundary.
 */
export function useSchoolAccess(): SchoolAccess {
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;
  return useMemo(() => schoolAccess(role), [role]);
}
