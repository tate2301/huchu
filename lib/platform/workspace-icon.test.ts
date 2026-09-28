import { describe, expect, it } from "vitest";

import {
  drawableLogoType,
  iconLayout,
  iconPurpose,
  iconSize,
  imageAspect,
  logoFetchUrl,
  logoReadsAt,
} from "./workspace-icon";

const ORIGIN = "https://app.example.com";

describe("logoFetchUrl", () => {
  it("fetches a public https logo", () => {
    expect(logoFetchUrl("https://www.floorcode.co.zw/logo.svg", ORIGIN)?.href).toBe(
      "https://www.floorcode.co.zw/logo.svg",
    );
  });

  it("resolves a path on this site against its origin", () => {
    expect(logoFetchUrl("/uploads/logo.png", ORIGIN)?.href).toBe("https://app.example.com/uploads/logo.png");
  });

  it.each([
    "http://www.floorcode.co.zw/logo.svg",
    "https://localhost/logo.png",
    "https://127.0.0.1/logo.png",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/logo.png",
    "https://metadata.google.internal/logo.png",
    "https://printer.local/logo.png",
    "https://intranet/logo.png",
    "https://user:secret@example.com/logo.png",
    "//evil.example.com/logo.png",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s", (url) => {
    expect(logoFetchUrl(url, ORIGIN)).toBeNull();
  });

  it("has nothing to fetch without a logo", () => {
    expect(logoFetchUrl(null, ORIGIN)).toBeNull();
  });
});

describe("drawableLogoType", () => {
  it("draws PNG, JPEG and SVG", () => {
    expect(drawableLogoType("image/png", "https://a.co/l")).toBe("image/png");
    expect(drawableLogoType("image/jpeg; charset=binary", "https://a.co/l")).toBe("image/jpeg");
    expect(drawableLogoType("image/svg+xml", "https://a.co/l")).toBe("image/svg+xml");
  });

  it("trusts an .svg extension when the host will not say", () => {
    expect(drawableLogoType("text/plain", "https://a.co/logo.svg")).toBe("image/svg+xml");
    expect(drawableLogoType(null, "https://a.co/logo.SVG?v=2")).toBe("image/svg+xml");
  });

  it("will not draw an icon file or anything that is not an image", () => {
    expect(drawableLogoType("image/x-icon", "https://a.co/favicon.ico")).toBeNull();
    expect(drawableLogoType("text/html", "https://a.co/logo")).toBeNull();
  });
});

describe("iconLayout", () => {
  it("keeps a maskable logo inside the circle the platform may crop to", () => {
    const { radius, logoBox } = iconLayout(512, "maskable");
    expect(radius).toBe(0);
    // The box's corners must sit inside a circle 80% across.
    expect(Math.hypot(logoBox / 2, logoBox / 2)).toBeLessThanOrEqual(512 * 0.4);
  });

  it("gives a tab-sized icon nearly all of its pixels", () => {
    expect(iconLayout(32, "any").logoBox).toBeGreaterThanOrEqual(27);
  });

  it("leaves the corners to iOS", () => {
    expect(iconLayout(180, "apple").radius).toBe(0);
  });
});

describe("iconPurpose and iconSize", () => {
  it("defaults what it does not recognise", () => {
    expect(iconPurpose("monochrome")).toBe("any");
    expect(iconSize("abc")).toBe(512);
    expect(iconSize("4000")).toBe(1024);
    expect(iconSize("8")).toBe(16);
  });
});

const text = (value: string) => new TextEncoder().encode(value);

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number) {
  // SOI, an APP0 segment of 16 bytes, then a baseline frame header.
  const bytes = new Uint8Array(2 + 18 + 19);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  view.setUint16(4, 16);
  bytes.set([0xff, 0xc0], 20);
  view.setUint16(22, 17);
  bytes[24] = 8;
  view.setUint16(25, height);
  view.setUint16(27, width);
  return bytes;
}

describe("imageAspect", () => {
  it("reads a PNG's header", () => {
    expect(imageAspect(png(600, 200), "image/png")).toBe(3);
  });

  it("reads a JPEG's frame, past the segments before it", () => {
    expect(imageAspect(jpeg(400, 400), "image/jpeg")).toBe(1);
  });

  it("reads an SVG's viewBox, then its width and height", () => {
    expect(imageAspect(text('<?xml version="1.0"?><svg xmlns="x" viewBox="0 0 240 60">'), "image/svg+xml")).toBe(4);
    expect(imageAspect(text('<svg width="120px" height="120">'), "image/svg+xml")).toBe(1);
  });

  it("cannot tell a shape from a percentage or from nothing", () => {
    expect(imageAspect(text('<svg width="100%" height="100%">'), "image/svg+xml")).toBeNull();
    expect(imageAspect(new Uint8Array(4), "image/png")).toBeNull();
  });
});

describe("logoReadsAt", () => {
  it("gives a wordmark's tab to the initial and keeps it everywhere larger", () => {
    expect(logoReadsAt(4, 32)).toBe(false);
    expect(logoReadsAt(4, 192)).toBe(true);
  });

  it("keeps a squarish logo in the tab", () => {
    expect(logoReadsAt(1.2, 32)).toBe(true);
    expect(logoReadsAt(null, 32)).toBe(true);
  });
});
