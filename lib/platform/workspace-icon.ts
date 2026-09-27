/**
 * The workspace's icon: its logo, or its initial, on a square.
 *
 * A logo is drawn as uploaded nowhere else it has to fit a square. Most are
 * wordmarks, and a wordmark squeezed into a 16px tab is a grey smear, so the
 * icon contains it inside a padded tile rather than handing the browser the
 * file and letting it crop.
 */

export const ICON_PURPOSES = ["any", "maskable", "apple"] as const;
export type IconPurpose = (typeof ICON_PURPOSES)[number];

export function iconPurpose(value: string | null): IconPurpose {
  return ICON_PURPOSES.includes(value as IconPurpose) ? (value as IconPurpose) : "any";
}

export function iconSize(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 512;
  return Math.min(1024, Math.max(16, Math.round(parsed)));
}

export type IconLayout = {
  /** Corner radius of the tile, in pixels. */
  radius: number;
  /** The square the logo is contained in, in pixels. */
  logoBox: number;
};

/**
 * How much of the tile a logo may use.
 *
 * - A maskable icon is cropped by the platform to as little as a circle 80%
 *   across, so the logo keeps to the middle and the tile is full-bleed.
 * - iOS rounds the corners itself, so the apple tile is full-bleed too.
 * - At tab sizes every pixel counts: the logo takes nearly all of it.
 */
export function iconLayout(size: number, purpose: IconPurpose): IconLayout {
  if (purpose === "maskable") return { radius: 0, logoBox: Math.round(size * 0.56) };
  if (purpose === "apple") return { radius: 0, logoBox: Math.round(size * 0.7) };
  if (size <= 64) return { radius: Math.round(size * 0.2), logoBox: Math.round(size * 0.86) };
  return { radius: Math.round(size * 0.22), logoBox: Math.round(size * 0.72) };
}

/** Image types the renderer can draw. An .ico cannot be, and falls back. */
export const DRAWABLE_LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;
export type DrawableLogoType = (typeof DRAWABLE_LOGO_TYPES)[number];

export function drawableLogoType(contentType: string | null, url: string): DrawableLogoType | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if ((DRAWABLE_LOGO_TYPES as readonly string[]).includes(type)) return type as DrawableLogoType;
  if (type === "image/jpg") return "image/jpeg";
  // Some hosts serve SVG as text or as a download; trust the extension then.
  if ((type === "" || type.startsWith("text/") || type === "application/octet-stream") &&
    /\.svg$/i.test(new URL(url).pathname)) {
    return "image/svg+xml";
  }
  return null;
}

/**
 * The address to fetch a logo from, or null when it must not be fetched.
 *
 * The URL is whatever a tenant's admin typed, and this server fetches it, so
 * it is held to a public https address — or a path on this site. Nothing
 * that names a machine rather than a site: no IP literals, no localhost, no
 * internal or link-local names.
 */
export function logoFetchUrl(logoUrl: string | null, origin: string): URL | null {
  if (!logoUrl) return null;
  let url: URL;
  try {
    url = logoUrl.startsWith("/") && !logoUrl.startsWith("//") ? new URL(logoUrl, origin) : new URL(logoUrl);
  } catch {
    return null;
  }
  if (url.origin === new URL(origin).origin) return url;
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.startsWith("[")
  ) {
    return null;
  }
  return url;
}

/** Bytes a logo may weigh before it is not worth drawing. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function svgLength(value: string | undefined): number | null {
  const match = value?.trim().match(/^([\d.]+)(px)?$/);
  return match ? Number(match[1]) : null;
}

/** Width over height, read from the file itself; null when it cannot be told. */
export function imageAspect(bytes: Uint8Array, type: DrawableLogoType): number | null {
  const ratio = (width: number, height: number) =>
    width > 0 && height > 0 && Number.isFinite(width / height) ? width / height : null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (type === "image/png") {
    // The IHDR chunk always comes first: width then height, big-endian.
    return bytes.byteLength >= 24 ? ratio(view.getUint32(16), view.getUint32(20)) : null;
  }

  if (type === "image/jpeg") {
    // Walk the segments to the frame header, which carries the dimensions.
    let at = 2;
    while (at + 9 < bytes.byteLength && bytes[at] === 0xff) {
      const marker = bytes[at + 1]!;
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return ratio(view.getUint16(at + 7), view.getUint16(at + 5));
      at += 2 + view.getUint16(at + 2);
    }
    return null;
  }

  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  const tag = head.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (box && box.length === 4) return ratio(box[2]!, box[3]!);
  const width = svgLength(attr("width"));
  const height = svgLength(attr("height"));
  return width && height ? ratio(width, height) : null;
}

/**
 * Whether a logo of this shape reads at this size.
 *
 * A wordmark contained in a 32px square is a line a few pixels tall; at app
 * icon sizes the same wordmark is legible. So a logo more than twice as wide
 * as it is tall — or tall as it is wide — gives way to the initial in a tab,
 * and keeps its place everywhere larger.
 */
export function logoReadsAt(aspect: number | null, size: number): boolean {
  if (size > 64 || aspect === null) return true;
  return Math.max(aspect, 1 / aspect) <= 2;
}
