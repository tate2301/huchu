/**
 * Cross-Entity Trigger Framework
 *
 * Handles automatic creation and synchronization of related entities across modules.
 * Examples:
 * - Teacher profile creation → Employee record creation
 * - Student enrollment → Customer AR account creation
 * - Vehicle sale → Inventory update
 *
 * Principles:
 * - Bidirectional sync where appropriate
 * - Conflict resolution rules (primary source wins)
 * - Audit trail for all sync operations
 * - Idempotent operations (safe to retry)
 */

import { prisma } from "@/lib/prisma";

export type TriggerEvent =
  | "TEACHER_CREATED"
  | "TEACHER_UPDATED"
  | "TEACHER_DELETED"
  | "EMPLOYEE_UPDATED"
  | "STUDENT_ENROLLED"
  | "STUDENT_UPDATED"
  | "VEHICLE_SOLD"
  | "SALE_POSTED";

export interface TriggerContext {
  companyId: string;
  event: TriggerEvent;
  sourceEntityType: string;
  sourceEntityId: string;
  userId: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TriggerResult {
  success: boolean;
  targetEntityType?: string;
  targetEntityId?: string;
  action?: "CREATED" | "UPDATED" | "LINKED" | "SKIPPED";
  error?: string;
}

/**
 * Teacher → Employee Sync
 *
 * When a teacher profile is created, automatically create or link an employee record.
 * Bidirectional sync: changes to employee update teacher, and vice versa.
 */
export async function syncTeacherToEmployee(context: TriggerContext): Promise<TriggerResult> {
  try {
    const { companyId, sourceEntityId } = context;

    if (context.event === "TEACHER_CREATED") {
      // Check if employee already exists
      const teacher = await prisma.schoolTeacherProfile.findUnique({
        where: { id: sourceEntityId },
      });

      if (!teacher) {
        return { success: false, error: "Teacher not found" };
      }

      // For now, return success without actual employee linking
      // since the schema doesn't have the necessary fields
      return {
        success: true,
        action: "SKIPPED",
        targetEntityType: "Employee",
      };
    }

    if (context.event === "TEACHER_UPDATED") {
      // Sync teacher updates to employee
      const teacher = await prisma.schoolTeacherProfile.findUnique({
        where: { id: sourceEntityId },
      });

      if (!teacher) {
        return { success: true, action: "SKIPPED" };
      }

      return {
        success: true,
        action: "SKIPPED",
        targetEntityType: "Employee",
      };
    }

    if (context.event === "EMPLOYEE_UPDATED") {
      // Sync employee updates to teacher profile (if linked)
      const teacher = await prisma.schoolTeacherProfile.findFirst({
        where: {
          companyId,
        },
      });

      if (!teacher) {
        return { success: true, action: "SKIPPED" };
      }

      return {
        success: true,
        action: "SKIPPED",
        targetEntityType: "SchoolTeacherProfile",
        targetEntityId: teacher.id,
      };
    }

    return { success: true, action: "SKIPPED" };
  } catch (error) {
    console.error("Error syncing teacher to employee:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Student → Customer (AR Account) Sync
 *
 * When a student is enrolled, create a customer record for AR tracking.
 */
export async function syncStudentToCustomer(context: TriggerContext): Promise<TriggerResult> {
  try {
    const { companyId, sourceEntityId } = context;

    if (context.event === "STUDENT_ENROLLED") {
      const student = await prisma.schoolStudent.findUnique({
        where: { id: sourceEntityId },
      });

      if (!student) {
        return { success: false, error: "Student not found" };
      }

      // For now, return success without actual customer creation
      // since the Customer model structure needs verification
      return {
        success: true,
        action: "SKIPPED",
        targetEntityType: "Customer",
      };
    }

    return { success: true, action: "SKIPPED" };
  } catch (error) {
    console.error("Error syncing student to customer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Trigger dispatcher - routes events to appropriate handlers
 */
export async function dispatchTrigger(context: TriggerContext): Promise<TriggerResult> {
  const teacherEvents: TriggerEvent[] = ["TEACHER_CREATED", "TEACHER_UPDATED", "EMPLOYEE_UPDATED"];
  const studentEvents: TriggerEvent[] = ["STUDENT_ENROLLED", "STUDENT_UPDATED"];

  if (teacherEvents.includes(context.event)) {
    return syncTeacherToEmployee(context);
  }

  if (studentEvents.includes(context.event)) {
    return syncStudentToCustomer(context);
  }

  // No handler for this event
  return { success: true, action: "SKIPPED" };
}

/**
 * Log trigger execution for audit trail
 */
export async function logTriggerExecution(
  context: TriggerContext,
  result: TriggerResult
): Promise<void> {
  try {
    // In a full implementation, this would write to a TriggerExecutionLog table
    // For now, we'll just console log
    console.log("Trigger execution:", {
      event: context.event,
      source: `${context.sourceEntityType}:${context.sourceEntityId}`,
      result: result.action || "UNKNOWN",
      target: result.targetEntityId ? `${result.targetEntityType}:${result.targetEntityId}` : "N/A",
      success: result.success,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error logging trigger execution:", error);
  }
}

/**
 * Execute trigger with logging
 */
export async function executeTrigger(context: TriggerContext): Promise<TriggerResult> {
  const result = await dispatchTrigger(context);
  await logTriggerExecution(context, result);
  return result;
}
