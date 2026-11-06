"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PayrollShell } from "@/components/payroll/payroll-shell";
import { RecordMark } from "@/components/records/record-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BkState } from "@/components/books/bk-list";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/components/books/bk-list";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * The monthly returns, and whether they can be filed.
 *
 * Three things on the page and the order is the point.
 *
 * First, **can this be filed at all** — an employee with no BP number is not a
 * gap in the return, it is a return ZIMRA cannot match to a taxpayer. That has to
 * be the first thing seen, not a footnote under the figures.
 *
 * Second, **does it agree with the ledger**. A return that does not equal the
 * credit on its payable account means one of them is wrong, and the operator
 * would rather find out here than when ZIMRA does.
 *
 * Only then the figures. A screen that leads with a confident total and buries
 * the blockers is a screen that gets a return filed wrong.
 */

type P2Boxes = {
  employeesReported: number;
  grossEmoluments: number;
  taxableEmoluments: number;
  payeBeforeCredits: number;
  taxCredits: number;
  payeDeducted: number;
  aidsLevy: number;
  totalRemittance: number;
};

type P2Row = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  taxNumber: string | null;
  grossEmoluments: number;
  taxableEmoluments: number;
  payeDeducted: number;
  aidsLevy: number;
};

type NssaRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  nssaNumber: string | null;
  insurableEarnings: number;
  employeeContribution: number;
  employerContribution: number;
  total: number;
};

type ReconciliationLine = {
  label: string;
  accountCode: string;
  returnAmountBase: number;
  ledgerAmountBase: number;
  difference: number;
  reconciled: boolean;
};

type ReturnsResponse = {
  periodKey: string;
  canFile: boolean;
  paye: Array<{
    currency: string;
    boxes: P2Boxes;
    schedule: P2Row[];
    blockers: string[];
  }>;
  nssa: Array<{
    currency: string;
    membersReported: number;
    totalInsurableEarnings: number;
    totalEmployeeContribution: number;
    totalEmployerContribution: number;
    totalRemittance: number;
    schedule: NssaRow[];
    blockers: string[];
  }>;
  reconciliation: {
    ledgerAvailable: boolean;
    reconciled: boolean;
    lines: ReconciliationLine[];
  };
};

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function periodOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let offset = 0; offset < 15; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    options.push({
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return options;
}

export function StatutoryReturnsContent() {
  const periods = useMemo(() => periodOptions(), []);
  const [periodKey, setPeriodKey] = useState(periods[1]?.value ?? periods[0].value);

  const query = useQuery({
    queryKey: ["hr", "returns", periodKey],
    queryFn: () =>
      fetchJson<ReturnsResponse>(`/api/payroll/returns?periodKey=${periodKey}`),
  });

  const data = query.data;
  const blockers = useMemo(
    () => [
      ...(data?.paye.flatMap((row) => row.blockers) ?? []),
      ...(data?.nssa.flatMap((row) => row.blockers) ?? []),
    ],
    [data],
  );

  return (
    <PayrollShell
      activeTab="statutory-returns"
      title="Statutory returns"
      actions={
        <Select value={periodKey} onValueChange={setPeriodKey}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="flex flex-col gap-4">
        {query.isPending ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>The returns could not be computed</AlertTitle>
            <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : !data ? null : data.paye.length === 0 && data.nssa.length === 0 ? (
          <Alert>
            <AlertTitle>Nothing to report for this month</AlertTitle>
            <AlertDescription>
              A return is built from approved payroll runs. Approve a run for this
              period and it will appear here — draft runs are deliberately excluded,
              since their figures still change.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Whether it can be filed, first. */}
            {blockers.length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>
                  These returns cannot be filed yet — {blockers.length} employee
                  {blockers.length === 1 ? "" : "s"} cannot be reported
                </AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>Every employee can be reported</AlertTitle>
                <AlertDescription>
                  All the tax and NSSA numbers these returns need are on file.
                </AlertDescription>
              </Alert>
            )}

            {/* Then whether it agrees with the books. */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Reconciliation against the ledger
                </h2>
                {!data.reconciliation.ledgerAvailable ? (
                  <BkState tone="plain">Not checked</BkState>
                ) : data.reconciliation.reconciled ? (
                  <BkState tone="success">Agrees</BkState>
                ) : (
                  <BkState tone="danger">Does not agree</BkState>
                )}
              </div>
              {data.reconciliation.ledgerAvailable ? (
                <div className="overflow-x-auto border-y border-[var(--color-line)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Liability</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Return</TableHead>
                        <TableHead className="text-right">Ledger</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.reconciliation.lines.map((line) => (
                        <TableRow key={line.accountCode + line.label}>
                          <TableCell className="font-medium">{line.label}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {line.accountCode}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(line.returnAmountBase)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(line.ledgerAmountBase)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.reconciled ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="font-mono text-sm font-medium text-[var(--color-danger)]">
                                {money(line.difference)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>

            {/* One P2 per currency: USD PAYE is remitted in USD and ZWG in ZWG. */}
            {data.paye.map((p2) => (
              <div key={`p2-${p2.currency}`} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-section-title text-foreground font-bold tracking-tight">
                    P2 — monthly PAYE ({p2.currency})
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.canFile}
                    onClick={() => {
                      const head = [
                        "Employee ID",
                        "Employee",
                        "Tax (BP) number",
                        "Gross",
                        "Taxable",
                        "PAYE",
                        "AIDS levy",
                      ];
                      const rows = p2.schedule.map((row) => [
                        row.employeeNumber,
                        row.name,
                        row.taxNumber ?? "",
                        row.grossEmoluments.toFixed(2),
                        row.taxableEmoluments.toFixed(2),
                        row.payeDeducted.toFixed(2),
                        row.aidsLevy.toFixed(2),
                      ]);
                      downloadCsv(`p2-paye-${p2.currency.toLowerCase()}-${periodKey || "period"}.csv`, head, rows);
                    }}
                  >
                    {data.canFile ? "Export" : "Cannot file yet"}
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    ["Gross emoluments", p2.boxes.grossEmoluments],
                    ["Taxable emoluments", p2.boxes.taxableEmoluments],
                    ["PAYE before credits", p2.boxes.payeBeforeCredits],
                    ["Tax credits", p2.boxes.taxCredits],
                    ["PAYE deducted", p2.boxes.payeDeducted],
                    ["AIDS levy", p2.boxes.aidsLevy],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border p-3">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-medium tabular-nums">
                        {money(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="overflow-x-auto border-y border-[var(--color-line)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Tax (BP) number</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Taxable</TableHead>
                        <TableHead className="text-right">PAYE</TableHead>
                        <TableHead className="text-right">AIDS levy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p2.schedule.map((row) => (
                        <TableRow key={row.employeeId}>
                          <TableCell className="font-mono text-sm text-[var(--color-ink-2)]">
                            {row.employeeNumber}
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <RecordMark kind="person" name={row.name} size="sm" />
                              <span className="truncate font-medium text-[var(--color-ink)]">
                                {row.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row.taxNumber ?? (
                              <BkState tone="danger">Missing</BkState>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.grossEmoluments)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.taxableEmoluments)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.payeDeducted)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.aidsLevy)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            {data.nssa.map((nssa) => (
              <div key={`nssa-${nssa.currency}`} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-section-title text-foreground font-bold tracking-tight">
                    NSSA schedule ({nssa.currency})
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.canFile}
                    onClick={() => {
                      const head = [
                        "Employee ID",
                        "Member",
                        "NSSA number",
                        "Insurable earnings",
                        "Employee",
                        "Employer",
                        "Total",
                      ];
                      const rows = nssa.schedule.map((row) => [
                        row.employeeNumber,
                        row.name,
                        row.nssaNumber ?? "",
                        row.insurableEarnings.toFixed(2),
                        row.employeeContribution.toFixed(2),
                        row.employerContribution.toFixed(2),
                        row.total.toFixed(2),
                      ]);
                      downloadCsv(`nssa-schedule-${nssa.currency.toLowerCase()}-${periodKey || "period"}.csv`, head, rows);
                    }}
                  >
                    {data.canFile ? "Export" : "Cannot file yet"}
                  </Button>
                </div>
                <div className="overflow-x-auto border-y border-[var(--color-line)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>NSSA number</TableHead>
                        <TableHead className="text-right">
                          Insurable earnings
                        </TableHead>
                        <TableHead className="text-right">Employee</TableHead>
                        <TableHead className="text-right">Employer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nssa.schedule.map((row) => (
                        <TableRow key={row.employeeId}>
                          <TableCell className="font-mono text-sm text-[var(--color-ink-2)]">
                            {row.employeeNumber}
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <RecordMark kind="person" name={row.name} size="sm" />
                              <span className="truncate font-medium text-[var(--color-ink)]">
                                {row.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row.nssaNumber ?? (
                              <BkState tone="danger">Missing</BkState>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.insurableEarnings)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.employeeContribution)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(row.employerContribution)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {money(row.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </PayrollShell>
  );
}
