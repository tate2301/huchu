import {
  CheckCircleSolid,
  CircleDottedLine,
  CircleHalfDottedClock,
  CircleThreeQuartersSolid,
  ExclamationCircleSolid,
} from "@/lib/icons";
import type { ElementType } from "react";
import type { OfflineStatus } from "@/lib/offline/types";
import { DeployedCodeUpdate, SignalWifiOff } from "@/lib/icons";

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
      icon: SignalWifiOff,
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
      icon: CircleHalfDottedClock,
      text: "Preparing",
    };
  }
  if (status === "UPDATE_READY") {
    return {
      colorVar: "--action-primary-bg",
      icon: DeployedCodeUpdate,
      text: "Update available",
    };
  }
  if (status === "RECONNECTING") {
    return {
      colorVar: "--action-primary-bg",
      icon: CircleDottedLine,
      text: "Reconnecting",
    };
  }
  if (status === "SYNCING") {
    return {
      colorVar: "--action-primary-bg",
      icon: CircleThreeQuartersSolid,
      text: "Syncing",
    };
  }
  return {
    colorVar: "--status-success-text",
    icon: CheckCircleSolid,
    text: "Ready",
  };
}
