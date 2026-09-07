import {
  Bell,
  CalendarCheck,
  Checklist,
  Clock,
  FileText,
  Funnel,
  Payments,
  Pencil,
  Plus,
  Hexagon,
  UserRound,
  Zap,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import type { ActionType } from "../../automation";

/**
 * A mark for every trigger and every step.
 *
 * A sequence read as a column of identical dots is a sequence you have to read
 * word by word; different marks let somebody find the notification step by
 * shape before they have read anything.
 */
export const TRIGGER_ICON: Record<string, LucideIcon> = {
  LEAD_CREATED: Plus,
  LEAD_STAGE_CHANGED: Funnel,
  DEAL_CREATED: Plus,
  DEAL_STAGE_CHANGED: Funnel,
  TASK_OVERDUE: Clock,
  RECORD_IDLE: CalendarCheck,
  DOCUMENT_APPROVED: FileText,
  PAYMENT_RECEIVED: Payments,
};

export const ACTION_ICON: Record<ActionType, LucideIcon> = {
  CREATE_TASK: Checklist,
  ASSIGN_OWNER: UserRound,
  NOTIFY: Bell,
  ADD_TAG: Hexagon,
  SET_FIELD: Pencil,
};

export const WORKFLOW_ICON = Zap;
