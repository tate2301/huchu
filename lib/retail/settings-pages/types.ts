import type { z } from "zod";

import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import type { SheetSection } from "@/lib/workspace/sheet-kind";

/**
 * A settings page as data (00-foundations 5.10.2): what SettingsFrame draws
 * and what `GET/PATCH /api/v2/retail/settings/[page]` checks. Browser-safe —
 * the server's half (where each value is stored) is `lib/retail/settings`.
 */

/** A section of the form: the sheet's, plus a line under its title. */
export type SettingsSection = SheetSection & {
  /** "Changed in Management › Branding": where its values are kept when not here. */
  note?: { text: string; link?: { label: string; href: string } };
};

/** One block of the aside: a list of bullets or a paragraph. */
export type SettingsAsideSection = { title: string; bullets?: string[]; text?: string };

export type SettingsPage = {
  /** The page header's title. */
  title: string;
  sections: SettingsSection[];
  aside: SettingsAsideSection[];
  /** The aside's "Who can change this", and the save bar's line when read-only. */
  whoCanChange: string;
  /** Reading the page. */
  read: [RetailResource, RetailAction];
  /** Saving it; a role without this reads every field as `read`. */
  change: [RetailResource, RetailAction];
  /**
   * One rule per field this page changes. A field drawn on the page and not
   * here is read-only on it (a value kept elsewhere, or one a later unit
   * makes editable).
   */
  schema: z.ZodObject<Record<string, z.ZodType>>;
  /** Names for the fields it changes and does not draw, for Activity's lines. */
  labels?: Record<string, string>;
};

/** `GET /api/v2/retail/settings/[page]`. */
export type SettingsResponse = {
  values: Record<string, unknown>;
  canEdit: boolean;
  lastChanged: { by: string; at: string } | null;
};

/** `PATCH /api/v2/retail/settings/[page]`. */
export type SettingsSaved = Pick<SettingsResponse, "values" | "lastChanged">;
