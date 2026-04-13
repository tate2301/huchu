import {
  ArrowPath,
  CloudArrowDown,
  ExclamationCircleSolid,
  ShieldCheck,
  Spinner,
} from "@medusajs/icons";
import type { ElementType } from "react";
import type { OfflineStatus } from "@/lib/offline/types";

type StatusTone = {
  colorVar: string;
  icon: ElementType<{ className?: string }>;
  text: string;
  iconClassName?: string;
};

export function getOfflineStatusTone(status: OfflineStatus): StatusTone {
  if (status === "OFFLINE") {
    return {
      colorVar: "--status-warning-text",
      icon: ExclamationCircleSolid,
      text: "Offline",
    };
  }
  if (status === "ATTENTION") {
    return {
      colorVar: "--status-error-text",
      icon: ExclamationCircleSolid,
      text: "Needs attention",
    };
  }
  if (status === "PREPARING") {
    return {
      colorVar: "--action-primary-bg",
      icon: Spinner,
      text: "Preparing",
      iconClassName: "motion-safe:animate-spin",
    };
  }
  if (status === "UPDATE_READY") {
    return {
      colorVar: "--action-primary-bg",
      icon: CloudArrowDown,
      text: "Update available",
    };
  }
  if (status === "RECONNECTING") {
    return {
      colorVar: "--action-primary-bg",
      icon: ArrowPath,
      text: "Reconnecting",
      iconClassName: "motion-safe:animate-spin",
    };
  }
  if (status === "SYNCING") {
    return {
      colorVar: "--action-primary-bg",
      icon: ArrowPath,
      text: "Syncing",
      iconClassName: "motion-safe:animate-spin",
    };
  }
  return {
    colorVar: "--status-success-text",
    icon: ShieldCheck,
    text: "Ready",
  };
}
