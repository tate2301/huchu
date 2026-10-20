"use client";

import { Avatar, type AvatarSize } from "@/components/core";

const SIZES: Record<"sm" | "md" | "lg", AvatarSize> = { sm: 28, md: 32, lg: 40 };

/** An employee's face: the kit's `Avatar` (components/core/avatar.tsx), at this component's old sizes. */
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
  return <Avatar name={name} src={photoUrl} size={SIZES[size]} className={className} />;
}
