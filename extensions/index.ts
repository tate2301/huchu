import type { CorelithExtension } from "@/lib/extensions/types";

/**
 * The extensions this deployment runs. Empty in core.
 *
 * An industry fork changes this one line to register its vertical, e.g.
 *
 *   import { milling } from "./milling";
 *   export const registeredExtensions: readonly CorelithExtension[] = [milling];
 *
 * Core never edits this file after creating it, so that line never conflicts
 * with a core sync. See docs/_start-here/RELEASES_AND_FORKS.md.
 */
export const registeredExtensions: readonly CorelithExtension[] = [];
