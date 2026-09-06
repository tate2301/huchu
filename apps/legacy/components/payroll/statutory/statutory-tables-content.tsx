"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PayrollShell } from "@/components/payroll/payroll-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
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
 * The tables a Zimbabwean payroll is computed on.
 *
 * The screen's job is not data entry — it is letting somebody *check* what their
 * payroll will use before it runs. So the layout answers three questions in
 * order: what is in force for this month, where did it come from, and is any of
 * it still the seeded starting set.
 *
 * The seeded-set warning is prominent and not dismissible. Every rate here ships
 * as a plausible starting figure, and the failure mode of a stale table is a
 * payslip that looks right and is quietly wrong for everybody — so the one thing
 * this screen must not do is let an operator forget that.
 */

type Band = {
  lowerBound: string;
  upperBound: string | null;
  ratePercent: string;
  deductAmount: string;
};

type PayeTable = {
  id: string;
  currency: string;
  cycle: string;
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  isSeeded: boolean;
  bands: Band[];
};

type StatutoryRate = {
  id: string;
  key: string;
  currency: string | null;
  ratePercent: string;
  ceilingAmount: string | null;
  floorAmount: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  isSeeded: boolean;
};

type TaxCredit = {
  id: string;
  key: string;
  currency: string;
  amount: string | null;
  ratePercent: string | null;
  effectiveFrom: string;
  isSeeded: boolean;
};

type NecAgreement = {
  id: string;
  councilName: string;
  currency: string;
  employeeRatePercent: string | null;
  employeeFixedAmount: string | null;
  employerRatePercent: string | null;
  employerFixedAmount: string | null;
  effectiveFrom: string;
};

type StatutoryResponse = {
  asOf: string;
  payeTables: PayeTable[];
  rates: StatutoryRate[];
  credits: TaxCredit[];
  necAgreements: NecAgreement[];
  seededCount: number;
};

/** Human labels, because `NSSA_POBS_EMPLOYEE` is not a thing to show a person. */
const RATE_LABELS: Record<string, string> = {
  AIDS_LEVY: "AIDS levy",
  NSSA_POBS_EMPLOYEE: "NSSA pension — employee",
  NSSA_POBS_EMPLOYER: "NSSA pension — employer",
  NSSA_APWCS: "NSSA accident prevention (APWCS)",
  ZIMDEF: "ZIMDEF",
  STANDARDS_DEVELOPMENT_LEVY: "Standards Development Levy",
  BONUS_EXEMPTION: "Bonus exemption",
};

const CREDIT_LABELS: Record<string, string> = {
  MEDICAL_AID: "Medical aid",
  ELDERLY: "Elderly persons",
  DISABILITY: "Disabled persons",
};

/** What each rate is charged on — the question the table cannot answer itself. */
const RATE_BASIS: Record<string, string> = {
  AIDS_LEVY: "of the PAYE figure",
  NSSA_POBS_EMPLOYEE: "of insurable earnings, capped",
  NSSA_POBS_EMPLOYER: "of insurable earnings, capped",
  NSSA_APWCS: "of gross — varies by industry risk class",
  ZIMDEF: "of gross",
  STANDARDS_DEVELOPMENT_LEVY: "of gross",
  BONUS_EXEMPTION: "exempt slice of an annual bonus",
};

function monthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let offset = 2; offset >= -12; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    options.push({
      value,
      label: date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return options;
}

function day(value: string | null) {
  if (!value) return "—";
  return value.slice(0, 10);
}

function band(row: Band) {
  const upper = row.upperBound ? Number(row.upperBound).toLocaleString() : "and above";
  const lower = Number(row.lowerBound).toLocaleString();
  return row.upperBound ? `${lower} – ${upper}` : `${lower} ${upper}`;
}

export function StatutoryTablesContent() {
  const months = useMemo(() => monthOptions(), []);
  const [asOf, setAsOf] = useState(months[2]?.value ?? months[0].value);

  const query = useQuery({
    queryKey: ["hr", "statutory", asOf],
    queryFn: () =>
      fetchJson<StatutoryResponse>(`/api/payroll/statutory?asOf=${asOf}`),
  });

  const data = query.data;

  return (
    <PayrollShell
      activeTab="statutory-tables"
      title="Statutory tables & rates"
      actions={
        <Select value={asOf} onValueChange={setAsOf}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="flex flex-col gap-4">
        {query.isPending ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>The statutory tables could not be loaded</AlertTitle>
            <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : !data ? null : (
          <>
            {data.seededCount > 0 ? (
              // Not dismissible. A stale table produces a payslip that looks
              // right and is wrong the same way for everybody, which nobody
              // notices until ZIMRA reconciles the return.
              <Alert>
                <AlertTitle>
                  {data.seededCount} of these were seeded as a starting set
                </AlertTitle>
                <AlertDescription>
                  Check them against the current ZIMRA and NSSA schedules before you
                  pay anyone from them. To correct one, add a new row with a later
                  effective date — the old figures stay in force for the months they
                  covered, so a past payroll does not change.
                </AlertDescription>
              </Alert>
            ) : null}

            {data.payeTables.length === 0 ? (
              <Alert variant="destructive">
                <AlertTitle>No PAYE table covers this month</AlertTitle>
                <AlertDescription>
                  A payroll run for this period will refuse rather than use another
                  month&apos;s bands.
                </AlertDescription>
              </Alert>
            ) : null}

            {data.payeTables.map((table) => (
              <Card key={table.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        PAYE — {table.currency}
                        {table.isSeeded ? (
                          <Badge variant="outline">Seeded</Badge>
                        ) : null}
                      </CardTitle>
                      <CardDescription>
                        {table.label} · in force from {day(table.effectiveFrom)}
                        {table.effectiveTo ? ` to ${day(table.effectiveTo)}` : ""}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">{table.cycle.toLowerCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* The published subtract form: tax = gross × rate − deduction.
                      Shown as ZIMRA prints it so an accountant can check a
                      payslip against the circular line by line. */}
                  <p className="mb-3 text-sm text-muted-foreground">
                    Tax = taxable gross × rate − deduction.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Taxable gross</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Deduct</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {table.bands.map((row) => (
                          <TableRow key={row.lowerBound}>
                            <TableCell className="font-medium">{band(row)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(row.ratePercent).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(row.deductAmount).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {table.source ? (
                    <p className="mt-3 text-xs text-muted-foreground">{table.source}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle>Levies & contributions</CardTitle>
                <CardDescription>
                  What each is charged on matters as much as the rate — the AIDS levy
                  is a percentage of the tax, not of the wage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.rates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No rates cover this month. A payroll run will refuse.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Levy</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Ceiling</TableHead>
                          <TableHead>Charged on</TableHead>
                          <TableHead>From</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rates.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                {RATE_LABELS[rate.key] ?? rate.key}
                                {rate.isSeeded ? (
                                  <Badge variant="outline">Seeded</Badge>
                                ) : null}
                              </span>
                            </TableCell>
                            <TableCell>
                              {rate.currency ?? (
                                <span className="text-muted-foreground">Any</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Number(rate.ratePercent).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {rate.ceilingAmount
                                ? Number(rate.ceilingAmount).toLocaleString()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {RATE_BASIS[rate.key] ?? ""}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {day(rate.effectiveFrom)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tax credits</CardTitle>
                <CardDescription>
                  Applied to the tax after it is computed and before the AIDS levy is
                  struck.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.credits.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No credits on file for this month.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Credit</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead className="text-right">Worth</TableHead>
                          <TableHead>From</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.credits.map((credit) => (
                          <TableRow key={credit.id}>
                            <TableCell className="font-medium">
                              {CREDIT_LABELS[credit.key] ?? credit.key}
                            </TableCell>
                            <TableCell>{credit.currency}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {credit.ratePercent
                                ? `${Number(credit.ratePercent).toFixed(2)}% of contributions`
                                : Number(credit.amount ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {day(credit.effectiveFrom)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>NEC agreement</CardTitle>
                <CardDescription>
                  Never seeded — dues are set per National Employment Council, and a
                  wrong council on a remittance is a wrong remittance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.necAgreements.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No NEC agreement on file. If your industry has a council, add its
                    dues so they appear on payslips and in the returns.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Council</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead className="text-right">Employee</TableHead>
                          <TableHead className="text-right">Employer</TableHead>
                          <TableHead>From</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.necAgreements.map((nec) => (
                          <TableRow key={nec.id}>
                            <TableCell className="font-medium">
                              {nec.councilName}
                            </TableCell>
                            <TableCell>{nec.currency}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {nec.employeeRatePercent
                                ? `${Number(nec.employeeRatePercent).toFixed(2)}%`
                                : Number(nec.employeeFixedAmount ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {nec.employerRatePercent
                                ? `${Number(nec.employerRatePercent).toFixed(2)}%`
                                : Number(nec.employerFixedAmount ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {day(nec.effectiveFrom)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PayrollShell>
  );
}
