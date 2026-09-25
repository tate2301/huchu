/**
 * What a site photo's own metadata says about where and when it was taken.
 *
 * The failure worth pinning is not a crash — `readPhotoGeotag` cannot throw —
 * it is a wrong place stored as if it were right. A phone with no fix writes
 * 0, 0; a camera with no clock writes zeros for the date; half a coordinate
 * is a line round the planet. Each of those has to arrive as "no location",
 * which the report then says out loud, rather than as a pin in the sea.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FIELD_CAMERA_APP,
  NO_GEOTAG,
  fieldCameraSearchUrl,
  geotagFromExif,
  hasLocation,
  readPhotoGeotag,
  resolveFieldCamera,
} from "@/lib/crm/geotag";

describe("mapping exifr's output", () => {
  it("keeps a location and the capture time", () => {
    // The shape exifr hands back for a GPS Map Camera shot in Harare.
    const geotag = geotagFromExif({
      DateTimeOriginal: new Date("2026-09-20T08:15:30.000Z"),
      GPSLatitudeRef: "S",
      GPSLatitude: [17, 49, 30],
      GPSLongitudeRef: "E",
      GPSLongitude: [31, 2, 15],
      latitude: -17.825,
      longitude: 31.0375,
    });

    expect(geotag).toEqual({
      latitude: -17.825,
      longitude: 31.0375,
      capturedAt: "2026-09-20T08:15:30.000Z",
    });
    expect(hasLocation(geotag)).toBe(true);
  });

  it("says there is no location when the camera wrote none, and keeps the time", () => {
    const geotag = geotagFromExif({ DateTimeOriginal: new Date("2026-09-20T08:15:30.000Z") });
    expect(geotag.latitude).toBeNull();
    expect(geotag.longitude).toBeNull();
    expect(geotag.capturedAt).toBe("2026-09-20T08:15:30.000Z");
    expect(hasLocation(geotag)).toBe(false);
  });

  it("keeps a location with no capture time", () => {
    const geotag = geotagFromExif({ latitude: -17.825, longitude: 31.0375 });
    expect(hasLocation(geotag)).toBe(true);
    expect(geotag.capturedAt).toBeNull();
  });

  it("falls back to the creation date when the original is missing", () => {
    const geotag = geotagFromExif({ CreateDate: new Date("2026-09-21T06:00:00.000Z") });
    expect(geotag.capturedAt).toBe("2026-09-21T06:00:00.000Z");
  });

  it("reads a date exifr left as EXIF text", () => {
    const geotag = geotagFromExif({ DateTimeOriginal: "2026:09:20 10:15:30" });
    // Local time, as the phone that took it wrote it.
    expect(geotag.capturedAt).toBe(new Date(2026, 8, 20, 10, 15, 30).toISOString());
  });

  it("treats a file with no metadata at all as having none", () => {
    expect(geotagFromExif(undefined)).toEqual(NO_GEOTAG);
    expect(geotagFromExif(null)).toEqual(NO_GEOTAG);
    expect(geotagFromExif("not an object")).toEqual(NO_GEOTAG);
  });
});

describe("junk from the camera", () => {
  it("drops 0, 0 — a phone with no fix writes it anyway", () => {
    expect(hasLocation(geotagFromExif({ latitude: 0, longitude: 0 }))).toBe(false);
  });

  it("keeps a real coordinate that merely sits on the equator", () => {
    // Only the pair 0, 0 means "no fix"; Kampala-ish is a place.
    const geotag = geotagFromExif({ latitude: 0, longitude: 32.58 });
    expect(geotag).toMatchObject({ latitude: 0, longitude: 32.58 });
  });

  it("drops half a coordinate rather than storing a line round the planet", () => {
    const geotag = geotagFromExif({ latitude: -17.825 });
    expect(geotag.latitude).toBeNull();
    expect(geotag.longitude).toBeNull();
  });

  it("drops coordinates off the globe", () => {
    expect(hasLocation(geotagFromExif({ latitude: 91, longitude: 31 }))).toBe(false);
    expect(hasLocation(geotagFromExif({ latitude: -17.8, longitude: 181 }))).toBe(false);
  });

  it("drops text and NaN where a number belongs", () => {
    expect(hasLocation(geotagFromExif({ latitude: "-17.8", longitude: "31.0" }))).toBe(false);
    expect(hasLocation(geotagFromExif({ latitude: Number.NaN, longitude: 31 }))).toBe(false);
    expect(hasLocation(geotagFromExif({ latitude: -17.8, longitude: Infinity }))).toBe(false);
  });

  it("drops a date the camera's unset clock produced", () => {
    expect(geotagFromExif({ DateTimeOriginal: "0000:00:00 00:00:00" }).capturedAt).toBeNull();
    expect(geotagFromExif({ DateTimeOriginal: new Date("1970-01-01T00:00:00Z") }).capturedAt).toBeNull();
    expect(geotagFromExif({ DateTimeOriginal: new Date(Number.NaN) }).capturedAt).toBeNull();
    expect(geotagFromExif({ DateTimeOriginal: 1695000000 }).capturedAt).toBeNull();
  });
});

/**
 * A real JPEG, just big enough to carry an EXIF block: a GPS directory for
 * 17°49'30"S 31°02'15"E and nothing else, not even a capture time. Built by
 * hand because a binary fixture would hide what is in it.
 */
function jpegWithGps(): Uint8Array<ArrayBuffer> {
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  const gpsDirectory = 8 + 2 + 12 + 4;
  const rationals = gpsDirectory + 2 + 4 * 12 + 4;
  const tiff = [
    // Little-endian TIFF header, first directory at 8.
    0x49, 0x49, 0x2a, 0x00, ...u32(8),
    // IFD0: one entry pointing at the GPS directory.
    ...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsDirectory), ...u32(0),
    // GPS directory: latitude ref, latitude, longitude ref, longitude.
    ...u16(4),
    ...u16(1), ...u16(2), ...u32(2), 0x53, 0, 0, 0,
    ...u16(2), ...u16(5), ...u32(3), ...u32(rationals),
    ...u16(3), ...u16(2), ...u32(2), 0x45, 0, 0, 0,
    ...u16(4), ...u16(5), ...u32(3), ...u32(rationals + 24),
    ...u32(0),
    // 17 49 30.00 and 31 2 15.00, as rationals.
    ...u32(17), ...u32(1), ...u32(49), ...u32(1), ...u32(3000), ...u32(100),
    ...u32(31), ...u32(1), ...u32(2), ...u32(1), ...u32(1500), ...u32(100),
  ];
  const app1 = [...Array.from(new TextEncoder().encode("Exif")), 0, 0, ...tiff];
  const length = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...app1, 0xff, 0xd9]);
}

describe("reading a photo on the device", () => {
  it("reads the location out of a geotagged JPEG", async () => {
    const photo = new Blob([jpegWithGps()], { type: "image/jpeg" });
    const geotag = await readPhotoGeotag(photo);
    expect(geotag.latitude).toBeCloseTo(-17.825, 6);
    expect(geotag.longitude).toBeCloseTo(31.0375, 6);
    expect(geotag.capturedAt).toBeNull();
  });

  it("returns no geotag for a PDF without trying to parse it", async () => {
    const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    expect(await readPhotoGeotag(pdf)).toEqual(NO_GEOTAG);
  });

  it("returns no geotag, rather than throwing, for an image it cannot read", async () => {
    const broken = new Blob(["definitely not a jpeg"], { type: "image/jpeg" });
    expect(await readPhotoGeotag(broken)).toEqual(NO_GEOTAG);
  });
});

describe("the recommended camera app", () => {
  it("defaults to GPS Map Camera, found by a store search that cannot rot", () => {
    expect(resolveFieldCamera({ fieldCameraAppName: null, fieldCameraAppUrl: null })).toEqual({
      appName: DEFAULT_FIELD_CAMERA_APP,
      storeUrl: "https://play.google.com/store/search?q=GPS%20Map%20Camera&c=apps",
    });
  });

  it("searches for whatever name the tenant chose when they gave no link", () => {
    const camera = resolveFieldCamera({ fieldCameraAppName: "Timestamp Camera & GPS", fieldCameraAppUrl: "  " });
    expect(camera.appName).toBe("Timestamp Camera & GPS");
    expect(camera.storeUrl).toBe(fieldCameraSearchUrl("Timestamp Camera & GPS"));
    // The ampersand is escaped, or the search would stop at "Timestamp Camera ".
    expect(camera.storeUrl).toContain("Timestamp%20Camera%20%26%20GPS");
  });

  it("uses the tenant's own link when there is one", () => {
    const camera = resolveFieldCamera({
      fieldCameraAppName: null,
      fieldCameraAppUrl: "https://play.google.com/store/apps/details?id=com.example.camera",
    });
    expect(camera.appName).toBe(DEFAULT_FIELD_CAMERA_APP);
    expect(camera.storeUrl).toBe("https://play.google.com/store/apps/details?id=com.example.camera");
  });
});
