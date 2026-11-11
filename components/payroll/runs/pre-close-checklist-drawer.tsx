"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Amt, BkFinding, St } from "@/components/books/ui";
import { Button, Drawer, DrawerSection } from "@/components/core";
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
      title="Pre-close reconciliation checklist"
      sub="Verify disbursement accounts, statutory tax identifiers, and pay variances before submitting."
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
            {data?.canSubmit ? "Confirm & submit run" : "Resolve blockers to submit"}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--color-ink-muted)" }}>
          Running pre-flight verification checks...
        </div>
      ) : !data ? (
        <div style={{ padding: 24 }}>Failed to load pre-flight checklist.</div>
      ) : (
        <>
          {/* RUN METRICS SUMMARY */}
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: "var(--color-surface)",
              boxShadow: "var(--shadow-ring)",
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono bold" style={{ fontSize: 14 }}>
                Run #{run?.runNumber} • {run?.periodKey}
              </span>
              <St tone={run?.status === "DRAFT" ? "draft" : "info"}>
                {run?.status ?? "DRAFT"}
              </St>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">Coverage interval</span>
              <span className="mono">{run?.periodRange}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">Employees included</span>
              <span className="mono">{run?.lineCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-line-subtle)", paddingTop: 6 }}>
              <span className="bold">Total Net Pay</span>
              <Amt value={run?.netTotal ?? 0} currency="USD" />
            </div>
          </div>

          {/* OVERALL READINESS SCORE */}
          <div style={{ marginBottom: 16 }}>
            {data.blockers.length > 0 ? (
              <BkFinding
                fact={`${data.blockers.length} Blocker(s) Found`}
                rest={data.blockers.join(". ")}
              />
            ) : data.warnings.length > 0 ? (
              <BkFinding
                fact={`${data.passedCount} of ${data.totalChecks} checks clean (${data.warnings.length} warning)`}
                rest="Pre-flight passed. You may proceed with submission, but review flagged warnings below."
              />
            ) : (
              <BkFinding
                fact="All 6 pre-flight checks passed"
                rest="Disbursement details, statutory tax IDs, compensation contracts, and variance tolerances are completely verified."
              />
            )}
          </div>

          {/* SECTION 1: DISBURSEMENT ACCOUNTS */}
          <DrawerSection title="1. Disbursement Readiness">
            {details?.missingPaymentDetails && details.missingPaymentDetails.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-danger-ink)" }}>
                  {details.missingPaymentDetails.length} employee(s) missing both bank account and mobile money:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {details.missingPaymentDetails.map((emp) => (
                    <div
                      key={emp.employeeId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        background: "var(--color-danger-subtle)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span className="bold">
                        {emp.name} ({emp.code})
                      </span>
                      <Link
                        href={`/people/${emp.employeeId}`}
                        target="_blank"
                        style={{ color: "var(--color-brand)", textDecoration: "underline" }}
                      >
                        Edit account ↗
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                ✓ All {run?.lineCount} employees have valid bank or mobile money details.
              </div>
            )}
          </DrawerSection>

          {/* SECTION 2: STATUTORY COMPLIANCE */}
          <DrawerSection title="2. Statutory Tax & NSSA Identifiers">
            {details?.missingStatutory && details.missingStatutory.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-amber-ink)" }}>
                  {details.missingStatutory.length} employee(s) have unrecorded tax (BP) or NSSA numbers:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {details.missingStatutory.map((emp) => (
                    <div
                      key={emp.employeeId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        background: "var(--color-amber-subtle)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span>
                        <span className="bold">{emp.name}</span> • Missing:{" "}
                        {[emp.missingTax && "Tax BP", emp.missingNssa && "NSSA"]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                      <Link
                        href={`/people/${emp.employeeId}`}
                        target="_blank"
                        style={{ color: "var(--color-brand)", textDecoration: "underline" }}
                      >
                        Update profile ↗
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                ✓ Complete tax numbers and NSSA registrations present across all entries.
              </div>
            )}
          </DrawerSection>

          {/* SECTION 3: COMPENSATION INTEGRITY */}
          <DrawerSection title="3. Compensation Profile Integrity">
            {details?.unassignedProfiles && details.unassignedProfiles.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-amber-ink)" }}>
                  {details.unassignedProfiles.length} employee(s) have no compensation profile or zero base salary:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {details.unassignedProfiles.map((emp) => (
                    <div
                      key={emp.employeeId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        background: "var(--color-surface)",
                        boxShadow: "var(--shadow-ring)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span className="bold">{emp.name}</span>
                      <span className="mono muted">Base: ${emp.baseAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                ✓ Every line item is mapped to an active compensation contract or salary template.
              </div>
            )}
          </DrawerSection>

          {/* SECTION 4: PENDING LEAVE REQUESTS */}
          <DrawerSection title="4. Pending Leave Approvals">
            {details?.pendingLeaveList && details.pendingLeaveList.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-amber-ink)" }}>
                  {details.pendingLeaveList.length} leave application(s) awaiting approval in this period:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {details.pendingLeaveList.map((lr) => (
                    <div
                      key={lr.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        background: "var(--color-surface)",
                        boxShadow: "var(--shadow-ring)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span>
                        <span className="bold">{lr.name}</span> ({lr.leaveType}) • {lr.workingDays}d
                      </span>
                      <span className="mono muted">
                        {lr.startDate} to {lr.endDate}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <Link
                    href="/people/leave"
                    target="_blank"
                    style={{ color: "var(--color-brand)", textDecoration: "underline" }}
                  >
                    Open Leave Management to review & decide ↗
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                ✓ No pending leave requests overlap this cycle.
              </div>
            )}
          </DrawerSection>

          {/* SECTION 5: PAY VARIANCE OUTLIERS */}
          <DrawerSection title="5. Net Pay Outlier Detection">
            {details?.varianceOutliers && details.varianceOutliers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-amber-ink)" }}>
                  {details.varianceOutliers.length} employee(s) have net pay variance &gt;30% vs prior cycle:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {details.varianceOutliers.map((vo) => (
                    <div
                      key={vo.employeeId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        background: "var(--color-surface)",
                        boxShadow: "var(--shadow-ring)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <span className="bold">{vo.name}</span>
                        <div className="mono muted" style={{ fontSize: 11 }}>
                          Prior: ${vo.previousNet.toFixed(2)} → Current: ${vo.currentNet.toFixed(2)}
                        </div>
                      </div>
                      <span
                        className="mono bold"
                        style={{
                          color: vo.deltaPercent > 0 ? "var(--color-success-ink)" : "var(--color-danger-ink)",
                        }}
                      >
                        {vo.deltaPercent > 0 ? `+${vo.deltaPercent}%` : `${vo.deltaPercent}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                ✓ All employee net earnings are within standard variance tolerances.
              </div>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
