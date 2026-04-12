import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  type LucideIcon,
} from "@/lib/icons";
import type { OfflineStatus } from "@/lib/offline/types";

type StatusTone = {
  colorVar: string;
  icon: LucideIcon;
  text: string;
  iconClassName?: string;
};

export function getOfflineStatusTone(status: OfflineStatus): StatusTone {
  if (status === "OFFLINE") {
    return {
      colorVar: "--status-warning-text",
      icon: AlertTriangle,
      text: "Offline",
    };
  }
  if (status === "ATTENTION") {
    return {
      colorVar: "--status-error-text",
      icon: AlertTriangle,
      text: "Needs attention",
    };
  }
  if (status === "PREPARING") {
    return {
      colorVar: "--action-primary-bg",
      icon: Loader2,
      text: "Preparing",
      iconClassName: "motion-safe:animate-spin",
    };
  }
  if (status === "UPDATE_READY") {
    return {
      colorVar: "--action-primary-bg",
      icon: Download,
      text: "Update ready",
    };
  }
  if (status === "RECONNECTING") {
    return {
      colorVar: "--action-primary-bg",
      icon: RefreshCcw,
      text: "Reconnecting",
      iconClassName: "motion-safe:animate-spin",
    };
  }
  if (status === "SYNCING") {
    return {
      colorVar: "--action-primary-bg",
      icon: RefreshCcw,
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
