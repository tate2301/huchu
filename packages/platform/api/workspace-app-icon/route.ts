import { NextRequest, NextResponse } from "next/server";

function clampSize(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 512;
  }
  return Math.min(1024, Math.max(96, Math.round(parsed)));
}

function sanitizeColor(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeInitial(value: string | null) {
  const match = value?.trim().match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "C").toUpperCase();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const size = clampSize(searchParams.get("size"));
  const background = sanitizeColor(searchParams.get("bg"), "#0f8f86");
  const foreground = sanitizeColor(searchParams.get("fg"), "#ffffff");
  const initial = sanitizeInitial(searchParams.get("initial"));
  const name = (searchParams.get("name") ?? "Workspace").trim() || "Workspace";
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.44);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(name)}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="${background}" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${Math.round(size * 0.27)}" fill="rgba(255,255,255,0.12)" />
      <text
        x="50%"
        y="54%"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="${foreground}"
        font-family="Inter, Segoe UI, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
      >${escapeXml(initial)}</text>
    </svg>
  `.trim();

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
