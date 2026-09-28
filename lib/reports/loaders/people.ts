import { prisma } from "@/lib/prisma";
import { dateRange } from "@/lib/reports/params";
import { day, label, num, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams } from "@/lib/reports/types";

async function loadPay(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.payrollLineItem.findMany({
    where: {
      run: {
        companyId: ctx.companyId,
        // A rejected run paid nobody.
        status: { not: "REJECTED" },
        period: { startDate: dateRange(params) },
      },
    },
    select: {
      id: true,
      grossAmount: true,
      allowancesTotal: true,
      deductionsTotal: true,
      netAmount: true,
      employerCost: true,
      run: { select: { runNumber: true, status: true, period: { select: { periodKey: true } } } },
      employee: { select: { name: true, employeeId: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((line) => ({
      id: line.id,
      period: line.run.period.periodKey,
      employee: line.employee.name,
      employeeNo: line.employee.employeeId,
      department: line.employee.department?.name ?? null,
      run: `${label(line.run.status)} · run ${line.run.runNumber}`,
      gross: num(line.grossAmount),
      allowances: num(line.allowancesTotal),
      deductions: num(line.deductionsTotal),
      net: num(line.netAmount),
      employerCost: num(line.employerCost),
    })),
  );
}

async function loadPeople(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, ...(params.status === "all" ? {} : { isActive: true }) },
    select: {
      id: true,
      employeeId: true,
      name: true,
      jobTitle: true,
      position: true,
      phone: true,
      hireDate: true,
      isActive: true,
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: TAKE,
  });
  return result(
    found.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeId,
      name: employee.name,
      jobTitle: employee.jobTitle,
      department: employee.department?.name ?? null,
      position: label(employee.position),
      phone: employee.phone,
      hired: day(employee.hireDate),
      status: employee.isActive ? "Working" : "Left",
    })),
  );
}

async function loadLeave(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.leaveRequest.findMany({
    where: { companyId: ctx.companyId, startDate: dateRange(params), status: { not: "DRAFT" } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      workingDays: true,
      status: true,
      reason: true,
      employee: { select: { name: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
    take: TAKE,
  });
  return result(
    found.map((request) => ({
      id: request.id,
      employee: request.employee.name,
      type: request.leaveType.name,
      start: day(request.startDate),
      end: day(request.endDate),
      days: num(request.workingDays),
      status: label(request.status),
      reason: request.reason,
    })),
  );
}

export const PEOPLE_LOADERS: Record<string, ReportLoader> = {
  "payroll-pay": { load: loadPay },
  "people-register": { load: loadPeople },
  "people-leave": { load: loadLeave },
};
