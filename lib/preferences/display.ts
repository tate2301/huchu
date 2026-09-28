/**
 * The vocabulary behind the Appearance board's Display section, in one place so
 * the route that validates it and the provider that applies it cannot drift.
 *
 * They are stored as TEXT with the values checked here rather than as a Prisma
 * enum, for the same reason every other small vocabulary in this schema is TEXT:
 * adding "cosy" or a fourth landing page must not require a migration.
 *
 * Deliberately not including the theme. Light / dark / system has to be applied
 * before first paint or the page flashes, so it stays in `localStorage` under
 * `huchu.appearance` where `components/providers/appearance-provider.tsx` reads
 * it synchronously; a fetch cannot be awaited there.
 */

/** Board: "Comfortable  Compact". */
export const DISPLAY_DENSITIES = ["comfortable", "compact"] as const;
export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];

/** Board: "Last page  Dashboard  Shift report". */
export const DISPLAY_OPEN_ON = ["last-page", "dashboard", "shift-report"] as const;
export type DisplayOpenOn = (typeof DISPLAY_OPEN_ON)[number];

export type DisplayPreference = {
  density: DisplayDensity;
  openOn: DisplayOpenOn;
  reduceMotion: boolean;
};

/**
 * What an account with no row reads as. These are the column defaults in
 * `UserDisplayPreference` spelled again in TypeScript on purpose: the GET falls
 * back to them without touching the database, so a person who has never opened
 * Appearance costs one indexed miss and no write.
 */
export const DISPLAY_PREFERENCE_DEFAULTS: DisplayPreference = {
  density: "comfortable",
  openOn: "dashboard",
  reduceMotion: false,
};

export function isDisplayDensity(value: unknown): value is DisplayDensity {
  return typeof value === "string" && (DISPLAY_DENSITIES as readonly string[]).includes(value);
}

export function isDisplayOpenOn(value: unknown): value is DisplayOpenOn {
  return typeof value === "string" && (DISPLAY_OPEN_ON as readonly string[]).includes(value);
}

/**
 * Narrow whatever the row or the API actually returned back into the union.
 * The columns are TEXT, so a value written by an older build — or by hand — must
 * read as the default rather than as an attribute nothing styles.
 */
export function normalizeDisplayPreference(value: {
  density?: unknown;
  openOn?: unknown;
  reduceMotion?: unknown;
}): DisplayPreference {
  return {
    density: isDisplayDensity(value.density) ? value.density : DISPLAY_PREFERENCE_DEFAULTS.density,
    openOn: isDisplayOpenOn(value.openOn) ? value.openOn : DISPLAY_PREFERENCE_DEFAULTS.openOn,
    reduceMotion:
      typeof value.reduceMotion === "boolean"
        ? value.reduceMotion
        : DISPLAY_PREFERENCE_DEFAULTS.reduceMotion,
  };
}
