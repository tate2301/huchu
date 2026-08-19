/**
 * Product photographs for the shelf.
 *
 * S-7.8. `Product.imageUrl` has existed all along and the till has always
 * rendered it — `pos-checkout-view.tsx` draws it in the catalogue grid and the
 * phone list, falling back to a package glyph. Nothing in the product could
 * ever put a value there: the catalogue API accepted `imageUrl` as a
 * `z.string().url()`, meaning a URL you already had somewhere else, and no
 * screen offered a field for it. Every card in the shop was a grey box.
 *
 * ── Why the checks live here and not in the route ──────────────────────────
 *
 * So they can be tested without a request, a session or a network. What a till
 * will accept onto its shelf is a product rule, and the interesting cases —
 * a file lying about its type, a photo straight off a phone camera at 8MB — are
 * exactly the ones you want pinned by a test rather than discovered by a
 * shopkeeper on a Saturday.
 *
 * ── The magic-number check ─────────────────────────────────────────────────
 *
 * `File.type` is whatever the browser felt like saying, and on an upload form
 * it is trivially forged. The first bytes are not. Both are checked and they
 * have to agree — a `.png` whose bytes are a PDF is refused rather than stored
 * and served back to a browser later.
 */

/** 2MB. A shelf photo is a thumbnail on a tablet, not a print asset. */
export const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;

export const CATALOG_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type CatalogImageType = (typeof CATALOG_IMAGE_TYPES)[number];

/** The extension each accepted type is stored under. */
const EXTENSION: Record<CatalogImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type CatalogImageCheck =
  | { ok: true; type: CatalogImageType; extension: string }
  | { ok: false; error: string };

/**
 * What the first bytes say the file actually is.
 *
 * PNG and JPEG are unambiguous in their first few bytes. WebP is a RIFF
 * container, so it needs both the `RIFF` magic and the `WEBP` form type four
 * bytes later — `RIFF` alone is also WAV and AVI.
 */
export function sniffImageType(bytes: Uint8Array): CatalogImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Whether this upload may go on the shelf.
 *
 * Refusals name the actual problem. "Invalid file" tells a shopkeeper holding a
 * phone nothing about whether to try a different photo or a different format.
 */
export function checkCatalogImage(input: {
  bytes: Uint8Array;
  declaredType: string | null | undefined;
}): CatalogImageCheck {
  if (input.bytes.length === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (input.bytes.length > MAX_CATALOG_IMAGE_BYTES) {
    const mb = (input.bytes.length / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `That image is ${mb}MB. Shelf photos have to be 2MB or smaller — most phones can shrink one when you share it.`,
    };
  }

  const sniffed = sniffImageType(input.bytes);
  if (!sniffed) {
    return {
      ok: false,
      error: "That file is not a PNG, JPEG or WebP image.",
    };
  }

  /*
    A declared type that disagrees with the bytes is refused rather than
    quietly trusted either way round. It is nearly always a renamed file, and
    the one time it is not, it is somebody probing.
  */
  const declared = input.declaredType?.trim().toLowerCase() ?? "";
  if (declared && declared !== sniffed) {
    // `image/jpg` is a common and harmless spelling of `image/jpeg`.
    const normalised = declared === "image/jpg" ? "image/jpeg" : declared;
    if (normalised !== sniffed) {
      return {
        ok: false,
        error: "That file's contents do not match the kind of image it claims to be.",
      };
    }
  }

  return { ok: true, type: sniffed, extension: EXTENSION[sniffed] };
}

/**
 * Where the bytes live in blob storage.
 *
 * Scoped by company so one tenant's photographs never share a prefix with
 * another's, and suffixed with the extension because the service worker
 * decides what to cache by looking at the end of the path — a shelf photo
 * stored without one would not survive the line going down, which is the
 * moment the till needs it most.
 */
export function catalogImagePath(input: {
  companyId: string;
  productId: string;
  extension: string;
  now: number;
}) {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9-]/g, "-");
  return `companies/${safe(input.companyId)}/retail/catalog/${safe(input.productId)}-${input.now}.${input.extension}`;
}
