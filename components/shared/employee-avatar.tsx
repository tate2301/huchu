"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function EmployeeAvatar({
  name,
  photoUrl,
  className,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [imageError, setImageError] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-[10px]"
      : size === "lg"
        ? "h-10 w-10 text-sm"
        : "h-8 w-8 text-xs";

  const showImage = Boolean(photoUrl && !imageError);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-semibold text-muted-foreground",
        sizeClass,
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        <img
          src={photoUrl ?? ""}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
