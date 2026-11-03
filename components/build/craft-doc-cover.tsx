"use client";

import * as React from "react";
import type { BuildItem, BuildKind } from "@/lib/build/items";
import { cn } from "@/lib/utils";

type CoverVariant = "thumbnail" | "card";

const KIND_THEMES: Record<
  BuildKind,
  {
    accent: string;
    accentBg: string;
    accentBorder: string;
    iconText: string;
    tag: string;
  }
> = {
  form: {
    accent: "#6366f1", // indigo
    accentBg: "#e0e7ff",
    accentBorder: "#c7d2fe",
    iconText: "FORM",
    tag: "Form",
  },
  document: {
    accent: "#0d9488", // teal / books emerald
    accentBg: "#ccfbf1",
    accentBorder: "#99f6e4",
    iconText: "DOC",
    tag: "Document",
  },
  email: {
    accent: "#0284c7", // sky
    accentBg: "#e0f2fe",
    accentBorder: "#bae6fd",
    iconText: "MAIL",
    tag: "Email",
  },
  report: {
    accent: "#b45309", // amber
    accentBg: "#fef3c7",
    accentBorder: "#fde68a",
    iconText: "REP",
    tag: "Report",
  },
};

/**
 * Craft Docs-style tactile document illustration.
 *
 * In thumbnail mode: A crisp, miniature 42x54px paper sheet with top accent,
 * fold, and subtle skeleton text lines.
 *
 * In card mode: A generous 160px-high canvas with a floating paper document,
 * header band, realistic field/table skeletons, stamp, and type badge.
 */
export function CraftDocCover({
  item,
  variant = "card",
  className,
}: {
  item: BuildItem;
  variant?: CoverVariant;
  className?: string;
}) {
  const theme = KIND_THEMES[item.kind] ?? KIND_THEMES.document;
  const isForm = item.kind === "form";
  const isEmail = item.kind === "email";

  if (variant === "thumbnail") {
    return (
      <div
        className={cn(
          "craft-doc-thumb relative shrink-0 overflow-hidden rounded-[3px] border border-black/10 bg-white shadow-sm transition-transform group-hover:scale-[1.03]",
          className,
        )}
        style={{ width: 40, height: 50 }}
        aria-hidden="true"
      >
        {/* Top colored accent stripe */}
        <div
          className="h-[4px] w-full"
          style={{ backgroundColor: theme.accent }}
        />

        {/* Folded paper corner effect */}
        <div
          className="absolute right-0 top-0 size-2.5 bg-black/[0.04]"
          style={{
            clipPath: "polygon(0 0, 100% 0, 100% 100%)",
            borderBottomLeftRadius: 1,
          }}
        />

        {/* Miniature skeleton lines */}
        <div className="flex flex-col gap-1 p-1.5 pt-2">
          {/* Header line */}
          <div
            className="h-1 rounded-[1px]"
            style={{ width: "65%", backgroundColor: theme.accent, opacity: 0.8 }}
          />

          {isForm ? (
            <>
              {/* Form input boxes */}
              <div className="mt-0.5 h-1.5 w-full rounded-[1px] border border-black/10 bg-black/[0.03]" />
              <div className="h-1.5 w-full rounded-[1px] border border-black/10 bg-black/[0.03]" />
              {/* Checkbox bullet */}
              <div className="flex items-center gap-1">
                <div
                  className="size-1 rounded-[0.5px]"
                  style={{ backgroundColor: theme.accent }}
                />
                <div className="h-0.5 w-4 rounded-[0.5px] bg-black/15" />
              </div>
            </>
          ) : isEmail ? (
            <>
              {/* Subject & body lines */}
              <div className="mt-0.5 h-0.5 w-[85%] rounded-[0.5px] bg-black/20" />
              <div className="h-0.5 w-[70%] rounded-[0.5px] bg-black/15" />
              <div className="h-0.5 w-[90%] rounded-[0.5px] bg-black/10" />
              <div
                className="mt-0.5 h-1.5 w-4 rounded-[1px]"
                style={{ backgroundColor: theme.accent, opacity: 0.7 }}
              />
            </>
          ) : (
            <>
              {/* Table rows */}
              <div className="mt-0.5 flex justify-between gap-1">
                <div className="h-0.5 w-4 rounded-[0.5px] bg-black/20" />
                <div className="h-0.5 w-2 rounded-[0.5px] bg-black/20" />
              </div>
              <div className="flex justify-between gap-1">
                <div className="h-0.5 w-3 rounded-[0.5px] bg-black/15" />
                <div className="h-0.5 w-2 rounded-[0.5px] bg-black/15" />
              </div>
              {/* Total row */}
              <div className="mt-0.5 flex justify-end">
                <div
                  className="h-1 w-3 rounded-[0.5px]"
                  style={{ backgroundColor: theme.accent }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Card cover illustration (Grid mode)
  return (
    <div
      className={cn(
        "craft-doc-cover relative flex h-[156px] w-full items-center justify-center overflow-hidden border-b border-[var(--color-line,#e8e6e1)] bg-[var(--color-ground,#fbfbfa)] px-5 py-4 select-none",
        className,
      )}
      aria-hidden="true"
    >
      {/* Background paper ambient dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />

      {/* Floating tactile paper sheet */}
      <div
        className="relative flex h-[122px] w-[184px] shrink-0 flex-col rounded-[4px] border border-black/10 bg-white px-3.5 py-2.5 transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-md"
        style={{
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
        }}
      >
        {/* Top colored accent header banner */}
        <div
          className="absolute left-0 top-0 h-[3px] w-full rounded-t-[3px]"
          style={{ backgroundColor: theme.accent }}
        />

        {/* Top header row: Logo badge + mini title line */}
        <div className="mt-1 flex items-center justify-between gap-2 border-b border-black/[0.06] pb-1.5">
          <div className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: theme.accentBg, border: `1px solid ${theme.accentBorder}` }}
            />
            <div
              className="h-1.5 w-14 rounded-[1px]"
              style={{ backgroundColor: theme.accent, opacity: 0.85 }}
            />
          </div>
          <div className="h-1 w-7 rounded-[1px] bg-black/15" />
        </div>

        {/* Document Body Skeletons */}
        <div className="mt-2 flex flex-1 flex-col gap-1.5 overflow-hidden">
          {isForm ? (
            <>
              {/* Form Input 1 */}
              <div className="space-y-0.5">
                <div className="h-1 w-10 rounded-[1px] bg-black/25" />
                <div className="h-3 w-full rounded-[2px] border border-black/10 bg-black/[0.02]" />
              </div>
              {/* Form Input 2 */}
              <div className="space-y-0.5">
                <div className="h-1 w-14 rounded-[1px] bg-black/25" />
                <div className="h-3 w-full rounded-[2px] border border-black/10 bg-black/[0.02]" />
              </div>
              {/* Submit button pill */}
              <div className="mt-auto flex justify-end">
                <div
                  className="h-2.5 w-10 rounded-[2px]"
                  style={{ backgroundColor: theme.accent, opacity: 0.85 }}
                />
              </div>
            </>
          ) : isEmail ? (
            <>
              {/* Email headers */}
              <div className="flex items-center gap-1">
                <div className="h-1 w-4 rounded-[1px] bg-black/20" />
                <div className="h-1 w-16 rounded-[1px] bg-black/10" />
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1 w-6 rounded-[1px] bg-black/20" />
                <div className="h-1 w-20 rounded-[1px] bg-black/10" />
              </div>
              {/* Email body paragraphs */}
              <div className="mt-1 space-y-1">
                <div className="h-1 w-full rounded-[1px] bg-black/15" />
                <div className="h-1 w-[85%] rounded-[1px] bg-black/15" />
                <div className="h-1 w-[60%] rounded-[1px] bg-black/15" />
              </div>
              {/* Action button */}
              <div className="mt-auto flex justify-start">
                <div
                  className="h-2.5 w-12 rounded-[2px]"
                  style={{ backgroundColor: theme.accent, opacity: 0.85 }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Invoice / Document Metadata */}
              <div className="flex justify-between">
                <div className="h-1 w-10 rounded-[1px] bg-black/25" />
                <div className="h-1 w-8 rounded-[1px] bg-black/20" />
              </div>
              {/* Table Header */}
              <div className="mt-0.5 flex justify-between border-b border-black/[0.06] pb-0.5">
                <div className="h-1 w-8 rounded-[1px] bg-black/30" />
                <div className="h-1 w-6 rounded-[1px] bg-black/30" />
              </div>
              {/* Table Rows */}
              <div className="flex justify-between">
                <div className="h-1 w-14 rounded-[1px] bg-black/15" />
                <div className="h-1 w-6 rounded-[1px] bg-black/15" />
              </div>
              <div className="flex justify-between">
                <div className="h-1 w-12 rounded-[1px] bg-black/15" />
                <div className="h-1 w-6 rounded-[1px] bg-black/15" />
              </div>
              {/* Total & Signature */}
              <div className="mt-auto flex items-end justify-between border-t border-black/[0.06] pt-1">
                <div className="h-1 w-8 rounded-[1px] bg-black/10" />
                <div
                  className="h-2 w-9 rounded-[1px]"
                  style={{ backgroundColor: theme.accent, opacity: 0.9 }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kind pill watermark badge placed neatly in the top right corner */}
      <span
        className="absolute right-3 top-3 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-sm font-medium tracking-tight shadow-xs backdrop-blur-xs"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderColor: theme.accentBorder,
          color: theme.accent,
        }}
      >
        {theme.tag}
      </span>
    </div>
  );
}
