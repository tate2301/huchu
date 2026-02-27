import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function companyLabelFromHost(host: string, fallback = "School"): string {
  const parts = host.split(".");
  if (parts.length > 2) {
    return parts[1]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return fallback;
}
