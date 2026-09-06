import { getServerSession } from "next-auth";
import { resolveAuthOptions } from "./auth-options";
import type { AuthenticatedSession } from "./types";

/** The signed-in session of the current request, or null. */
export async function getCurrentAuthSession(): Promise<AuthenticatedSession | null> {
  return (await getServerSession(await resolveAuthOptions())) as AuthenticatedSession | null;
}
