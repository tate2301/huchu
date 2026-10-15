import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";

import type { OperationActor } from "./types";

/**
 * The checks the app's own route makes before it does this, made again for
 * the person it runs as: their role may use the route, and the workspace (and
 * this person) has the part of Corelith it belongs to. An operation runs
 * module code directly, so without this it would skip both. The route's own
 * further checks (record ownership, capabilities) are the operation's to add.
 */
export function routeGate(actor: OperationActor, path: string, method = "POST"): string | null {
  if (!isRouteAllowedForRole(actor.role, path, method)) return "Your role cannot do this in the app.";
  if (!canAccessRouteWithToken(path, actor.session.user.enabledFeatures).allowed) {
    return "This part of Corelith is not on for you in this workspace.";
  }
  return null;
}

/** "30 October", from "2026-10-30". */
export function longDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** "INV-0142, INV-0150 and INV-0151". */
export function listOf(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
