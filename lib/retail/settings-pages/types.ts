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

/** One block of the aside: a list of bullets or a paragraph, and a link after it ("Posting to the books."). */
export type SettingsAsideSection = {
  title: string;
  bullets?: string[];
  text?: string;
  link?: { label: string; href: string };
};

/** Who last changed the page and when; `what` names a change of the page's own kind ("rate"). */
export type SettingsLastChanged = { by: string; at: string; what?: string };

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
  /**
   * A narrower grant that changes some fields only (the manager's ZiG rate):
   * a role with it and without `change` edits `fields` and reads the rest; a
   * save that changes anything else is refused with `refused` (403).
   */
  partly?: { can: [RetailResource, RetailAction]; fields: string[]; refused: string };
  /** The clean save bar's line for a change of the page's own kind (`lastChanged.what`). */
  lastChangedLine?: (lastChanged: SettingsLastChanged, now: Date) => string | null;
};

/** `GET /api/v2/retail/settings/[page]`. */
export type SettingsResponse = {
  values: Record<string, unknown>;
  /** The caller may change something here. */
  canEdit: boolean;
  /** With `partly`: the only fields this caller may change. Absent: every field the page changes. */
  editable?: string[];
  lastChanged: SettingsLastChanged | null;
};

/** `PATCH /api/v2/retail/settings/[page]`. */
export type SettingsSaved = Pick<SettingsResponse, "values" | "lastChanged">;
