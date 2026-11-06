"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PayrollShell } from "@/components/payroll/payroll-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BkState } from "@/components/books/bk-list";
import { Kit, KitScreen, TableShell } from "@/components/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              <div key={table.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-section-title text-foreground font-bold tracking-tight flex items-center gap-2">
                    PAYE — {table.currency}
                    {table.isSeeded ? (
                      <BkState tone="plain">Seeded</BkState>
                    ) : null}
                  </h2>
                  <span className="font-mono text-xs uppercase text-[var(--color-ink-3)]">{table.cycle.toLowerCase()}</span>
                </div>
                <TableShell label={`PAYE ${table.currency}`}>
                  <table className="table" aria-label={`PAYE bands ${table.currency}`}>
                    <thead>
                      <tr>
                        <th>Taxable gross</th>
                        <th className="num">Rate</th>
                        <th className="num">Deduct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.bands.map((row) => (
                        <tr key={row.lowerBound}>
                          <td style={{ fontWeight: 500, color: "var(--color-ink)" }}>{band(row)}</td>
                          <td className="num">
                            {Number(row.ratePercent).toFixed(2)}%
                          </td>
                          <td className="num">
                            {Number(row.deductAmount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
                {table.source ? (
                  <p className="text-sm text-muted-foreground">{table.source}</p>
                ) : null}
              </div>
            ))}

            <div className="space-y-3">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                Levies & contributions
              </h2>
              {data.rates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No rates cover this month. A payroll run will refuse.
                </p>
              ) : (
                <TableShell label="Levies & contributions">
                  <table className="table" aria-label="Levies and contributions">
                    <thead>
                      <tr>
                        <th>Levy</th>
                        <th>Currency</th>
                        <th className="num">Rate</th>
                        <th className="num">Ceiling</th>
                        <th>Charged on</th>
                        <th>From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rates.map((rate) => (
                        <tr key={rate.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                {RATE_LABELS[rate.key] ?? rate.key}
                              </span>
                              {rate.isSeeded ? (
                                <BkState tone="plain">Seeded</BkState>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            {rate.currency ?? (
                              <span className="muted">Any</span>
                            )}
                          </td>
                          <td className="num">
                            {Number(rate.ratePercent).toFixed(2)}%
                          </td>
                          <td className="num">
                            {rate.ceilingAmount
                              ? Number(rate.ceilingAmount).toLocaleString()
                              : "—"}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {RATE_BASIS[rate.key] ?? ""}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {day(rate.effectiveFrom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                Tax credits
              </h2>
              {data.credits.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No credits on file for this month.
                </p>
              ) : (
                <TableShell label="Tax credits">
                  <table className="table" aria-label="Tax credits">
                    <thead>
                      <tr>
                        <th>Credit</th>
                        <th>Currency</th>
                        <th className="num">Worth</th>
                        <th>From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.credits.map((credit) => (
                        <tr key={credit.id}>
                          <td style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                            {CREDIT_LABELS[credit.key] ?? credit.key}
                          </td>
                          <td>{credit.currency}</td>
                          <td className="num">
                            {credit.ratePercent
                              ? `${Number(credit.ratePercent).toFixed(2)}% of contributions`
                              : Number(credit.amount ?? 0).toFixed(2)}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {day(credit.effectiveFrom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                NEC agreement
              </h2>
              {data.necAgreements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No NEC agreement on file. If your industry has a council, add its
                  dues so they appear on payslips and in the returns.
                </p>
              ) : (
                <TableShell label="NEC agreement">
                  <table className="table" aria-label="NEC agreement">
                    <thead>
                      <tr>
                        <th>Council</th>
                        <th>Currency</th>
                        <th className="num">Employee</th>
                        <th className="num">Employer</th>
                        <th>From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.necAgreements.map((nec) => (
                        <tr key={nec.id}>
                          <td style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                            {nec.councilName}
                          </td>
                          <td>{nec.currency}</td>
                          <td className="num">
                            {nec.employeeRatePercent
                              ? `${Number(nec.employeeRatePercent).toFixed(2)}%`
                              : Number(nec.employeeFixedAmount ?? 0).toFixed(2)}
                          </td>
                          <td className="num">
                            {nec.employerRatePercent
                              ? `${Number(nec.employerRatePercent).toFixed(2)}%`
                              : Number(nec.employerFixedAmount ?? 0).toFixed(2)}
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {day(nec.effectiveFrom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              )}
            </div>
          </>
        )}
          </div>
        </KitScreen>
      </Kit>
    </PayrollShell>
  );
}
