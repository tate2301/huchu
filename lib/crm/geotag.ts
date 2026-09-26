/**
 * Where and when a site photo was taken, read off the photo itself.
 *
 * A site photo is evidence: this floor, at this address, on this day. The
 * picture alone cannot say any of that, so the report reads the camera's own
 * record — the EXIF block — on the rep's phone before the file is uploaded,
 * and stores the location and capture time beside it.
 *
 * Reading happens on the device rather than on the server for two reasons.
 * The file never has to make a second trip, and a phone's clock and position
 * at capture are the facts worth keeping; the server only knows when the
 * upload finally arrived, which on a site with no signal may be days later.
 *
 * A photo with no location is still accepted. Refusing it would lose the
 * picture of the crack in the slab because the camera app was the wrong one,
 * which is worse than having it without coordinates — so it is tagged "No
 * location" and the rep is told, and the notice recommends an app that stamps
 * every shot.
 */

/** What a photo carries from the camera, in the shape `CrmSiteVisitPhoto` stores it. */
export type PhotoGeotag = {
  latitude: number | null;
  longitude: number | null;
  /** ISO-8601, from the device's clock at capture. */
  capturedAt: string | null;
};

export const NO_GEOTAG: PhotoGeotag = { latitude: null, longitude: null, capturedAt: null };

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Math.abs(value) > limit) return null;
  return value;
}

/**
 * EXIF writes dates as "2026:09:20 10:15:30", with colons in the date. exifr
 * normally revives that into a `Date`; this catches the one it hands back
 * as text, which it does when the value will not parse cleanly.
 */
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function captureTime(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const match = EXIF_DATE.exec(value.trim());
    if (match) {
      const [, year, month, day, hour, minute, second] = match.map(Number);
      // Local time, as the camera wrote it: EXIF carries no zone, and the
      // phone reading it is the one that took it.
      date = new Date(year, month - 1, day, hour, minute, second);
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  // A camera whose clock was never set writes zeros, which parse to a date
  // before the phone existed. That is not a capture time; it is a missing one.
  if (date.getFullYear() < 2000) return null;
  return date.toISOString();
}

/**
 * Turn exifr's output into what we store.
 *
 * exifr returns `undefined` for a file with no metadata and an object of
 * whatever tags it found otherwise, with `latitude` and `longitude` already
 * signed decimal degrees when the GPS block was readable. Anything else —
 * text where a number belongs, a coordinate off the globe — is treated as
 * absent rather than stored as a wrong place.
 */
export function geotagFromExif(output: unknown): PhotoGeotag {
  if (!output || typeof output !== "object") return NO_GEOTAG;
  const tags = output as Record<string, unknown>;

  let latitude = coordinate(tags.latitude, 90);
  let longitude = coordinate(tags.longitude, 180);
  // Half a location is no location: a latitude alone puts the photo on a line
  // around the planet.
  if (latitude === null || longitude === null) {
    latitude = null;
    longitude = null;
  }
  // 0, 0 is in the Gulf of Guinea. A phone that had no fix when the shutter
  // went writes it anyway, so it means "no fix", never "here".
  if (latitude === 0 && longitude === 0) {
    latitude = null;
    longitude = null;
  }

  return {
    latitude,
    longitude,
    capturedAt: captureTime(tags.DateTimeOriginal) ?? captureTime(tags.CreateDate),
  };
}

export function hasLocation(geotag: Pick<PhotoGeotag, "latitude" | "longitude">): boolean {
  return geotag.latitude !== null && geotag.longitude !== null;
}

/**
 * Read a photo's location and capture time on the device.
 *
 * Never throws. A PDF, a screenshot, a file exifr cannot parse — each comes
 * back as no geotag, which the report then says out loud. exifr is loaded on
 * demand so the report sheet does not carry it until somebody picks a photo.
 *
 * The bytes are handed over rather than the `Blob`: exifr reads a Blob through
 * `FileReader`, which exists in a browser and nowhere else, and an upload is
 * capped at 10MB, so holding one in memory for a moment costs nothing.
 */
export async function readPhotoGeotag(file: Blob): Promise<PhotoGeotag> {
  if (!file.type.startsWith("image/")) return NO_GEOTAG;
  try {
    const exifr = (await import("exifr")).default;
    const output = await exifr.parse(await file.arrayBuffer(), {
      gps: true,
      pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
    });
    return geotagFromExif(output);
  } catch {
    return NO_GEOTAG;
  }
}

/** The app reps are pointed at when nobody has chosen one. */
export const DEFAULT_FIELD_CAMERA_APP = "GPS Map Camera";

/**
 * A store search for the app, by name.
 *
 * Used when the tenant has not pasted a link of their own. A listing URL is
 * tied to one publisher's package and dies when the app is pulled or renamed;
 * a search for the name keeps finding it, or something that does the same job.
 */
export function fieldCameraSearchUrl(appName: string): string {
  return `https://play.google.com/store/search?q=${encodeURIComponent(appName)}&c=apps`;
}

export type FieldCamera = {
  appName: string;
  /** Where "Get {app}" goes. */
  storeUrl: string;
};

/** What the tenant chose, with the defaults filled in where they chose nothing. */
export function resolveFieldCamera(company: {
  fieldCameraAppName: string | null;
  fieldCameraAppUrl: string | null;
}): FieldCamera {
  const appName = company.fieldCameraAppName?.trim() || DEFAULT_FIELD_CAMERA_APP;
  return {
    appName,
    storeUrl: company.fieldCameraAppUrl?.trim() || fieldCameraSearchUrl(appName),
  };
}
