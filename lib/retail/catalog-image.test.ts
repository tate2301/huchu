/**
 * What may go on the shelf.
 *
 * The forged-type case is the one worth having: `File.type` comes from the
 * browser and an upload form can say anything, so the bytes are the authority
 * and the two have to agree.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_CATALOG_IMAGE_BYTES,
  catalogImagePath,
  checkCatalogImage,
  sniffImageType,
} from "./catalog-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
/** `RIFF` … `WEBP`. */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
/** `RIFF` … `WAVE` — a sound file, not a picture. */
const WAV = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe("what the bytes actually are", () => {
  it("recognises the three formats a shelf photo may be", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("does not take RIFF alone for a WebP", () => {
    // `RIFF` is also WAV and AVI; the form type four bytes in is what decides.
    expect(sniffImageType(WAV)).toBeNull();
  });

  it("recognises nothing in a PDF", () => {
    expect(sniffImageType(PDF)).toBeNull();
  });

  it("does not fall over on a file too short to have magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("what the till will accept", () => {
  it("takes an honest PNG", () => {
    const result = checkCatalogImage({ bytes: PNG, declaredType: "image/png" });
    expect(result).toEqual({ ok: true, type: "image/png", extension: "png" });
  });

  it("forgives image/jpg for image/jpeg", () => {
    // A spelling half the world uses. Harmless, and refusing it would only
    // teach a shopkeeper that the upload is broken.
    const result = checkCatalogImage({ bytes: JPEG, declaredType: "image/jpg" });
    expect(result.ok).toBe(true);
  });

  it("refuses a PDF wearing a PNG's name", () => {
    const result = checkCatalogImage({ bytes: PDF, declaredType: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a PNG, JPEG or WebP/i);
  });

  it("refuses a real image whose declared type disagrees with its bytes", () => {
    const result = checkCatalogImage({ bytes: PNG, declaredType: "image/webp" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not match/i);
  });

  it("trusts the bytes when the browser says nothing", () => {
    expect(checkCatalogImage({ bytes: PNG, declaredType: "" }).ok).toBe(true);
    expect(checkCatalogImage({ bytes: PNG, declaredType: null }).ok).toBe(true);
  });

  it("refuses an empty file before anything else", () => {
    const result = checkCatalogImage({ bytes: new Uint8Array([]), declaredType: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });

  it("refuses a photo straight off a phone camera, and says how big it was", () => {
    const tooBig = new Uint8Array(MAX_CATALOG_IMAGE_BYTES + 1);
    tooBig.set(PNG);
    const result = checkCatalogImage({ bytes: tooBig, declaredType: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("2.0MB");
      expect(result.error).toMatch(/2MB or smaller/);
    }
  });

  it("accepts a file exactly on the limit", () => {
    const exact = new Uint8Array(MAX_CATALOG_IMAGE_BYTES);
    exact.set(PNG);
    expect(checkCatalogImage({ bytes: exact, declaredType: "image/png" }).ok).toBe(true);
  });
});

describe("where the bytes are stored", () => {
  it("scopes by company and ends in the extension", () => {
    // The extension is load-bearing: `public/sw.js` decides what to cache for
    // offline by the end of the path, so a photo stored without one would
    // vanish from the till the moment the line dropped.
    const path = catalogImagePath({
      companyId: "acme-1",
      productId: "prod-9",
      extension: "png",
      now: 1787085351200,
    });
    expect(path).toBe("companies/acme-1/retail/catalog/prod-9-1787085351200.png");
    expect(path.endsWith(".png")).toBe(true);
  });

  it("strips anything that could climb out of the prefix", () => {
    const path = catalogImagePath({
      companyId: "../../etc",
      productId: "a/b",
      extension: "png",
      now: 1,
    });
    expect(path).not.toContain("..");
    expect(path).toBe("companies/------etc/retail/catalog/a-b-1.png");
  });
});
