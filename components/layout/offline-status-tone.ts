import {
  CheckCircleSolid,
  CircleHalfDottedClock,
  CircleThreeQuartersSolid,
  ExclamationCircleSolid,
} from "@/lib/icons";
import type { ElementType } from "react";
import type { OfflineStatus } from "@/lib/offline/types";
import { DeployedCodeUpdate, SignalWifiOff } from "@/lib/icons";
import { OFFLINE_STATUS_WORD } from "@/lib/offline/status-words";

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
      text: OFFLINE_STATUS_WORD.OFFLINE,
    };
  }
  if (status === "ATTENTION") {
    return {
      colorVar: "--status-error-text",
      icon: ExclamationCircleSolid,
      text: OFFLINE_STATUS_WORD.ATTENTION,
    };
  }
  if (status === "PREPARING") {
    return {
      colorVar: "--action-primary-bg",
      icon: CircleHalfDottedClock,
      text: OFFLINE_STATUS_WORD.PREPARING,
    };
  }
  if (status === "UPDATE_READY") {
    return {
      colorVar: "--action-primary-bg",
      icon: DeployedCodeUpdate,
      text: OFFLINE_STATUS_WORD.UPDATE_READY,
    };
  }
  if (status === "SYNCING") {
    return {
      colorVar: "--action-primary-bg",
      icon: CircleThreeQuartersSolid,
      text: OFFLINE_STATUS_WORD.SYNCING,
    };
  }
  return {
    colorVar: "--status-success-text",
    icon: CheckCircleSolid,
    text: OFFLINE_STATUS_WORD.ONLINE,
  };
}
