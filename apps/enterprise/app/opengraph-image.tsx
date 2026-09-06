import { ImageResponse } from "next/og";

import { PLATFORM_BRAND_NAME, PLATFORM_MARKETING_DOMAIN } from "@corelithzw/platform/brand";
import {
  LAUNCH_SPRINT_DAYS,
  STARTING_MONTHLY_PRICE,
  formatUsd,
} from "@/lib/marketing/pricing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${PLATFORM_BRAND_NAME} - business software for formalising trade companies`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f8fa",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 12,
              border: "1px solid #d2d7e0",
              background: "#ffffff",
              color: "#16181d",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {PLATFORM_BRAND_NAME.slice(0, 1)}
          </div>
          <div
            style={{
              color: "#16181d",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 0,
            }}
          >
            {PLATFORM_BRAND_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              color: "#16181d",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: 0,
              maxWidth: 960,
            }}
          >
            Your business, finally connected.
          </div>
          <div style={{ color: "#565c69", fontSize: 32, maxWidth: 900 }}>
            Sales, stock, invoices, customers, finance and teams for formalising trade businesses in Zimbabwe.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[
            `From ${formatUsd(STARTING_MONTHLY_PRICE)}/month`,
            `${LAUNCH_SPRINT_DAYS}-day Launch Sprint`,
            PLATFORM_MARKETING_DOMAIN,
          ].map((chip, index) => (
            <div
              key={chip}
              style={{
                display: "flex",
                border: "1px solid #e5e8ee",
                borderRadius: 999,
                padding: "12px 26px",
                fontSize: 26,
                background: index === 0 ? "#0b5df0" : "#ffffff",
                color: index === 0 ? "#ffffff" : "#262a33",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
