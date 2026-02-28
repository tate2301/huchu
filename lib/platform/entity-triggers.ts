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
    const { companyId, sourceEntityId, data, userId } = context;

    if (context.event === "TEACHER_CREATED") {
      // Check if employee already exists
      const teacher = await prisma.schoolTeacherProfile.findUnique({
        where: { id: sourceEntityId },
        include: { employee: true },
      });

      if (!teacher) {
        return { success: false, error: "Teacher not found" };
      }

      // If already linked, skip
      if (teacher.employeeId) {
        return {
          success: true,
          action: "SKIPPED",
          targetEntityType: "Employee",
          targetEntityId: teacher.employeeId,
        };
      }

      // Check if employee exists by matching criteria (name, national ID, etc.)
      let employee = await prisma.employee.findFirst({
        where: {
          companyId,
          OR: [
            { nationalId: teacher.nationalId },
            {
              AND: [
                { firstName: teacher.firstName },
                { lastName: teacher.lastName },
              ],
            },
          ],
        },
      });

      if (employee) {
        // Link existing employee
        await prisma.schoolTeacherProfile.update({
          where: { id: sourceEntityId },
          data: { employeeId: employee.id },
        });

        return {
          success: true,
          action: "LINKED",
          targetEntityType: "Employee",
          targetEntityId: employee.id,
        };
      }

      // Create new employee
      employee = await prisma.employee.create({
        data: {
          companyId,
          employeeNumber: `TCH-${teacher.teacherNumber}`,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          nationalId: teacher.nationalId ?? undefined,
          phone: teacher.phone ?? undefined,
          email: teacher.email ?? undefined,
          employmentStatus: "ACTIVE",
          employmentType: "FULL_TIME",
          hireDate: teacher.hireDate ?? new Date(),
          createdById: userId,
        },
      });

      // Link teacher to employee
      await prisma.schoolTeacherProfile.update({
        where: { id: sourceEntityId },
        data: { employeeId: employee.id },
      });

      return {
        success: true,
        action: "CREATED",
        targetEntityType: "Employee",
        targetEntityId: employee.id,
      };
    }

    if (context.event === "TEACHER_UPDATED") {
      // Sync teacher updates to employee
      const teacher = await prisma.schoolTeacherProfile.findUnique({
        where: { id: sourceEntityId },
        include: { employee: true },
      });

      if (!teacher || !teacher.employeeId) {
        return { success: true, action: "SKIPPED" };
      }

      // Update employee with teacher data (teacher profile is primary source)
      await prisma.employee.update({
        where: { id: teacher.employeeId },
        data: {
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          phone: teacher.phone ?? undefined,
          email: teacher.email ?? undefined,
          nationalId: teacher.nationalId ?? undefined,
        },
      });

      return {
        success: true,
        action: "UPDATED",
        targetEntityType: "Employee",
        targetEntityId: teacher.employeeId,
      };
    }

    if (context.event === "EMPLOYEE_UPDATED") {
      // Sync employee updates to teacher profile (if linked)
      const teacher = await prisma.schoolTeacherProfile.findFirst({
        where: {
          companyId,
          employeeId: sourceEntityId,
        },
      });

      if (!teacher) {
        return { success: true, action: "SKIPPED" };
      }

      const employee = await prisma.employee.findUnique({
        where: { id: sourceEntityId },
      });

      if (!employee) {
        return { success: false, error: "Employee not found" };
      }

      // Update teacher with employee data (only if employee data is more recent)
      // For simplicity, we'll update contact info but not core identity fields
      await prisma.schoolTeacherProfile.update({
        where: { id: teacher.id },
        data: {
          phone: employee.phone ?? teacher.phone,
          email: employee.email ?? teacher.email,
        },
      });

      return {
        success: true,
        action: "UPDATED",
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
    const { companyId, sourceEntityId, userId } = context;

    if (context.event === "STUDENT_ENROLLED") {
      const student = await prisma.schoolStudent.findUnique({
        where: { id: sourceEntityId },
        include: {
          guardians: {
            include: { guardian: true },
          },
        },
      });

      if (!student) {
        return { success: false, error: "Student not found" };
      }

      // Check if customer already exists for this student
      let customer = await prisma.customer.findFirst({
        where: {
          companyId,
          referenceType: "SCHOOL_STUDENT",
          referenceId: sourceEntityId,
        },
      });

      if (customer) {
        return {
          success: true,
          action: "SKIPPED",
          targetEntityType: "Customer",
          targetEntityId: customer.id,
        };
      }

      // Get primary guardian for contact info
      const primaryGuardian = student.guardians.find((sg) => sg.isPrimary)?.guardian || student.guardians[0]?.guardian;

      // Create customer record
      customer = await prisma.customer.create({
        data: {
          companyId,
          customerNumber: `STU-${student.admissionNumber}`,
          customerName: `${student.firstName} ${student.lastName}`,
          contactPerson: primaryGuardian ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}` : undefined,
          phone: primaryGuardian?.phone ?? student.phone ?? undefined,
          email: primaryGuardian?.email ?? student.email ?? undefined,
          referenceType: "SCHOOL_STUDENT",
          referenceId: sourceEntityId,
          status: "ACTIVE",
          createdById: userId,
        },
      });

      return {
        success: true,
        action: "CREATED",
        targetEntityType: "Customer",
        targetEntityId: customer.id,
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
