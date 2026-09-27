import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import {
  drawableLogoType,
  iconLayout,
  iconPurpose,
  iconSize,
  imageAspect,
  logoFetchUrl,
  logoReadsAt,
  MAX_LOGO_BYTES,
} from "@/lib/platform/workspace-icon";
import { resolveWorkspaceIdentityForCompany } from "@/lib/platform/workspace-identity";

/** A logo is drawn on white: it was made for paper, not for its own colour. */
const LOGO_TILE = "#ffffff";
const FETCH_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 2;

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LOGO_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type Logo = { src: string; aspect: number | null };

/**
 * The design system's typeface in its bold weight, for the initial.
 *
 * From the same Google Fonts the app's stylesheet already loads it from, cut
 * to the one glyph and kept for the life of the process. The renderer only
 * ships a regular weight, and a thin letter is a weak mark at 16px; when the
 * font cannot be fetched, a thin letter is still better than no icon.
 */
const initialFonts = new Map<string, Promise<ArrayBuffer | null>>();

function initialFont(initial: string): Promise<ArrayBuffer | null> {
  let font = initialFonts.get(initial);
  if (!font) {
    font = (async () => {
      try {
        const css = await fetch(
          `https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@800&text=${encodeURIComponent(initial)}`,
          { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        ).then((response) => (response.ok ? response.text() : ""));
        const src = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype|woff)'\)/)?.[1];
        if (!src) return null;
        const response = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        return response.ok ? await response.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    font.then((loaded) => {
      // A failure is not remembered: the next icon asks again.
      if (!loaded) initialFonts.delete(initial);
    });
    initialFonts.set(initial, font);
  }
  return font;
}

/**
 * The logo as a data URI the renderer can draw, with its shape, or null to
 * draw the initial.
 *
 * Redirects are followed by hand so each hop is held to the same rule as the
 * address the admin typed — a public site cannot bounce this server inward.
 */
async function loadLogo(logoUrl: string | null, origin: string): Promise<Logo | null> {
  let url = logoFetchUrl(logoUrl, origin);
  try {
    for (let hop = 0; url && hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "image/svg+xml,image/png,image/jpeg;q=0.9" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        url = location ? logoFetchUrl(new URL(location, url).href, origin) : null;
        continue;
      }
      if (!response.ok) return null;
      const type = drawableLogoType(response.headers.get("content-type"), url.href);
      if (!type) return null;
      const bytes = await readCapped(response);
      if (!bytes || bytes.byteLength === 0) return null;
      return {
        src: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
        aspect: imageAspect(bytes, type),
      };
    }
  } catch {
    // Slow, down, or not an image: the initial is a better icon than none.
  }
  return null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const size = iconSize(params.get("size"));
  const purpose = iconPurpose(params.get("purpose"));
  const identity = await resolveWorkspaceIdentityForCompany(params.get("c"));
  const loaded = await loadLogo(identity.logoUrl, request.nextUrl.origin);
  const logo = loaded && logoReadsAt(loaded.aspect, size) ? loaded.src : null;
  const font = logo ? null : await initialFont(identity.initial);
  const { radius, logoBox } = iconLayout(size, purpose);

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
          background: logo ? LOGO_TILE : identity.backgroundColor,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={logoBox}
            height={logoBox}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              color: identity.foregroundColor,
              fontSize: Math.round((purpose === "maskable" ? 0.34 : 0.46) * size),
              fontFamily: font ? "Initial" : "sans-serif",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {identity.initial}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: font ? [{ name: "Initial", data: font, weight: 800, style: "normal" }] : undefined,
    },
  );

  // The URL carries the branding's version: while it matches, this icon is
  // this icon for good. A stale version is answered, briefly, with today's.
  const current = params.get("v") === identity.version;
  image.headers.set(
    "Cache-Control",
    current
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, stale-while-revalidate=3600",
  );
  return image;
}
