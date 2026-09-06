"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PayrollShell } from "@/components/payroll/payroll-shell";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@corelithzw/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@corelithzw/ui/components/table";
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

function nameParts(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  // A one-word name gives the avatar the same letter twice rather than a blank.
  return { firstName: first, lastName: parts.slice(1).join(" ") || first };
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Reconciliation against the ledger
                  {!data.reconciliation.ledgerAvailable ? (
                    <Badge variant="outline">Not checked</Badge>
                  ) : data.reconciliation.reconciled ? (
                    <Badge variant="secondary">Agrees</Badge>
                  ) : (
                    <Badge variant="destructive">Does not agree</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {data.reconciliation.ledgerAvailable
                    ? "Each return is compared with the credit on its own payable account, in reporting currency."
                    : "This workspace has no accounting module, so there is no ledger to compare against. The returns are computed from the payroll runs themselves."}
                </CardDescription>
              </CardHeader>
              {data.reconciliation.ledgerAvailable ? (
                <CardContent>
                  <div className="overflow-x-auto">
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
                                <Badge variant="destructive">
                                  {money(line.difference)}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              ) : null}
            </Card>

            {/* One P2 per currency: USD PAYE is remitted in USD and ZWG in ZWG. */}
            {data.paye.map((p2) => (
              <Card key={`p2-${p2.currency}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>P2 — monthly PAYE ({p2.currency})</CardTitle>
                      <CardDescription>
                        {p2.boxes.employeesReported} employee
                        {p2.boxes.employeesReported === 1 ? "" : "s"} · remit{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {money(p2.boxes.totalRemittance)} {p2.currency}
                        </span>
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" disabled={!data.canFile}>
                      {data.canFile ? "Export" : "Cannot file yet"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
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
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {money(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Tax (BP) number</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">PAYE</TableHead>
                          <TableHead className="text-right">AIDS levy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p2.schedule.map((row) => {
                          const { firstName, lastName } = nameParts(row.name);
                          return (
                            <TableRow key={row.employeeId}>
                              <TableCell>
                                <span className="flex items-center gap-2">
                                  <PersonAvatar
                                    firstName={firstName}
                                    lastName={lastName}
                                    size="sm"
                                  />
                                  <span>
                                    <span className="block font-medium">{row.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {row.employeeNumber}
                                    </span>
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {row.taxNumber ?? (
                                  <Badge variant="destructive">Missing</Badge>
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
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}

            {data.nssa.map((nssa) => (
              <Card key={`nssa-${nssa.currency}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>NSSA schedule ({nssa.currency})</CardTitle>
                      <CardDescription>
                        {nssa.membersReported} member
                        {nssa.membersReported === 1 ? "" : "s"} · remit{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {money(nssa.totalRemittance)} {nssa.currency}
                        </span>
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" disabled={!data.canFile}>
                      {data.canFile ? "Export" : "Cannot file yet"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Insurable earnings are the capped figure, not the wage. A
                      schedule listing full salaries beside capped contributions
                      reads to NSSA as an under-payment. */}
                  <p className="mb-3 text-sm text-muted-foreground">
                    Insurable earnings are capped at the ceiling in force, so they are
                    lower than gross pay for anybody earning above it.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
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
                        {nssa.schedule.map((row) => {
                          const { firstName, lastName } = nameParts(row.name);
                          return (
                            <TableRow key={row.employeeId}>
                              <TableCell>
                                <span className="flex items-center gap-2">
                                  <PersonAvatar
                                    firstName={firstName}
                                    lastName={lastName}
                                    size="sm"
                                  />
                                  <span>
                                    <span className="block font-medium">{row.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {row.employeeNumber}
                                    </span>
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {row.nssaNumber ?? (
                                  <Badge variant="destructive">Missing</Badge>
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
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </PayrollShell>
  );
}
