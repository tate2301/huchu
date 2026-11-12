"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Amt } from "@/components/books/ui";
import { BooksLoading } from "@/components/books/books-state";
import { Button, Drawer, DrawerRow, DrawerSection } from "@/components/core";
import { shortDay } from "@/lib/books/format";
import { fetchJson } from "@/lib/api-client";

type PreFlightResponse = {
  run: {
    id: string;
    runNumber: number;
    status: string;
    netTotal: number;
    grossTotal: number;
    lineCount: number;
    periodKey: string;
    periodRange: string;
  };
  canSubmit: boolean;
  blockers: string[];
  warnings: string[];
  passedCount: number;
  totalChecks: number;
  details: {
    missingPaymentDetails: Array<{ employeeId: string; code: string; name: string }>;
    missingStatutory: Array<{
      employeeId: string;
      code: string;
      name: string;
      missingTax: boolean;
      missingNssa: boolean;
    }>;
    unassignedProfiles: Array<{
      employeeId: string;
      code: string;
      name: string;
      baseAmount: number;
    }>;
    pendingLeaveList: Array<{
      id: string;
      employeeId: string;
      code: string;
      name: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      workingDays: number;
    }>;
    varianceOutliers: Array<{
      employeeId: string;
      code: string;
      name: string;
      currentNet: number;
      previousNet: number;
      deltaAmount: number;
      deltaPercent: number;
    }>;
    pendingAdjustments: number;
  };
};

type PreCloseChecklistDrawerProps = {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (runId: string) => void;
  isSubmitting?: boolean;
};

export function PreCloseChecklistDrawer({
  runId,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: PreCloseChecklistDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["payroll-pre-flight", runId],
    queryFn: () => fetchJson<PreFlightResponse>(`/api/payroll/runs/${runId}/pre-flight`),
    enabled: Boolean(runId && open),
  });

  const run = data?.run;
  const details = data?.details;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Check the run"
      sub={run ? `Run ${run.runNumber}, ${run.periodKey}, ${run.periodRange}` : undefined}
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            icon="check"
            disabled={!data?.canSubmit || isSubmitting}
            busy={isSubmitting}
            onClick={() => {
              if (runId) onSubmit(runId);
            }}
          >
            {data?.canSubmit ? "Submit the run" : "Fix the blockers first"}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <BooksLoading rows={6} />
      ) : !data ? (
        <p>The checks didn&rsquo;t load. Close this and try again.</p>
      ) : (
        <>
          <DrawerSection title="Run">
            <DrawerRow label="Employees">{run?.lineCount}</DrawerRow>
            <DrawerRow label="Net pay">
              <Amt value={run?.netTotal ?? 0} currency="USD" />
            </DrawerRow>
            <DrawerRow label="Checks">
              {data.passedCount} of {data.totalChecks} clean
            </DrawerRow>
          </DrawerSection>

          {data.blockers.length > 0 ? (
            <DrawerSection title="Blockers">
              {data.blockers.map((blocker) => (
                <p key={blocker}>{blocker}</p>
              ))}
            </DrawerSection>
          ) : null}

          <DrawerSection title="Payment details">
            {details?.missingPaymentDetails.length ? (
              details.missingPaymentDetails.map((emp) => (
                <DrawerRow key={emp.employeeId} label={`${emp.name} ${emp.code}`}>
                  No bank or mobile money. <Link href={`/people/${emp.employeeId}`} target="_blank">Add</Link>
                </DrawerRow>
              ))
            ) : (
              <p className="muted">Everyone can be paid.</p>
            )}
          </DrawerSection>

          <DrawerSection title="Tax and NSSA numbers">
            {details?.missingStatutory.length ? (
              details.missingStatutory.map((emp) => (
                <DrawerRow key={emp.employeeId} label={emp.name}>
                  Missing {[emp.missingTax && "tax BP", emp.missingNssa && "NSSA"].filter(Boolean).join(" and ")}.{" "}
                  <Link href={`/people/${emp.employeeId}`} target="_blank">Add</Link>
                </DrawerRow>
              ))
            ) : (
              <p className="muted">All numbers recorded.</p>
            )}
          </DrawerSection>

          <DrawerSection title="Salary">
            {details?.unassignedProfiles.length ? (
              details.unassignedProfiles.map((emp) => (
                <DrawerRow key={emp.employeeId} label={emp.name}>
                  No salary set. <Link href={`/people/${emp.employeeId}`} target="_blank">Set</Link>
                </DrawerRow>
              ))
            ) : (
              <p className="muted">Every line has a salary.</p>
            )}
          </DrawerSection>

          <DrawerSection title="Leave waiting">
            {details?.pendingLeaveList.length ? (
              <>
                {details.pendingLeaveList.map((leave) => (
                  <DrawerRow key={leave.id} label={leave.name}>
                    {leave.leaveType}, {leave.workingDays} {leave.workingDays === 1 ? "day" : "days"},{" "}
                    <span className="mono">
                      {shortDay(leave.startDate.slice(0, 10))} to {shortDay(leave.endDate.slice(0, 10))}
                    </span>
                  </DrawerRow>
                ))}
                <Link href="/people/leave" target="_blank">
                  Decide in Time off
                </Link>
              </>
            ) : (
              <p className="muted">None overlaps this period.</p>
            )}
          </DrawerSection>

          <DrawerSection title="Big changes in net pay">
            {details?.varianceOutliers.length ? (
              details.varianceOutliers.map((outlier) => (
                <DrawerRow key={outlier.employeeId} label={outlier.name}>
                  <Amt value={outlier.previousNet} currency="USD" /> to <Amt value={outlier.currentNet} currency="USD" />,{" "}
                  <span className="mono">
                    {outlier.deltaPercent > 0 ? "+" : "−"}
                    {Math.abs(outlier.deltaPercent)}%
                  </span>
                </DrawerRow>
              ))
            ) : (
              <p className="muted">Nobody moved more than 30%.</p>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
