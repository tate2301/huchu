"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PayrollShell } from "@/components/payroll/payroll-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Amt,
  BkFilter,
  BkFinding,
  BkPage,
  BkScroll,
  BkTabs,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { Button, Person } from "@/components/core";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

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

type TabKey = "reconciliation" | "p2" | "nssa";

export function StatutoryReturnsContent() {
  const periods = useMemo(() => periodOptions(), []);
  const [periodKey, setPeriodKey] = useState(periods[1]?.value ?? periods[0].value);
  const [tab, setTab] = useState<TabKey>("p2");
  const [search, setSearch] = useState("");

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

  const selectedPeriodLabel = useMemo(
    () => periods.find((p) => p.value === periodKey)?.label ?? periodKey,
    [periods, periodKey]
  );

  // Flattened schedules
  const p2Schedules = useMemo(() => {
    return data?.paye.flatMap((p) => p.schedule.map((s) => ({ ...s, currency: p.currency }))) ?? [];
  }, [data]);

  const nssaSchedules = useMemo(() => {
    return data?.nssa.flatMap((n) => n.schedule.map((s) => ({ ...s, currency: n.currency }))) ?? [];
  }, [data]);

  const filteredP2 = useMemo(() => {
    let list = p2Schedules;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.employeeNumber.toLowerCase().includes(q));
    }
    return list;
  }, [p2Schedules, search]);

  const filteredNssa = useMemo(() => {
    let list = nssaSchedules;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.employeeNumber.toLowerCase().includes(q));
    }
    return list;
  }, [nssaSchedules, search]);

  const handleExportCsv = () => {
    if (tab === "p2") {
      downloadCsv(
        `p2-paye-return-${periodKey}.csv`,
        ["Employee ID", "Employee", "Currency", "Tax (BP) number", "Gross", "Taxable", "PAYE", "AIDS levy"],
        filteredP2.map((r) => [
          r.employeeNumber,
          r.name,
          r.currency,
          r.taxNumber || "",
          String(r.grossEmoluments),
          String(r.taxableEmoluments),
          String(r.payeDeducted),
          String(r.aidsLevy),
        ])
      );
    } else if (tab === "nssa") {
      downloadCsv(
        `nssa-schedule-return-${periodKey}.csv`,
        ["Employee ID", "Member", "Currency", "NSSA number", "Insurable earnings", "Employee", "Employer", "Total"],
        filteredNssa.map((r) => [
          r.employeeNumber,
          r.name,
          r.currency,
          r.nssaNumber || "",
          String(r.insurableEarnings),
          String(r.employeeContribution),
          String(r.employerContribution),
          String(r.total),
        ])
      );
    } else if (data?.reconciliation.lines) {
      downloadCsv(
        `ledger-reconciliation-${periodKey}.csv`,
        ["Liability", "Account Code", "Return Amount", "Ledger Amount", "Difference", "Reconciled"],
        data.reconciliation.lines.map((l) => [
          l.label,
          l.accountCode,
          String(l.returnAmountBase),
          String(l.ledgerAmountBase),
          String(l.difference),
          l.reconciled ? "Yes" : "No",
        ])
      );
    }
  };

  // Columns for P2
  const p2Columns: Array<WsColumn<typeof filteredP2[number]>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={r.name} size={24} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>{r.name}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{r.employeeNumber}</span>
          </span>
        </span>
      ),
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (r) => r.currency,
    },
    {
      key: "taxNumber",
      head: "Tax (BP) number",
      cell: (r) =>
        r.taxNumber ? (
          <span className="mono">{r.taxNumber}</span>
        ) : (
          <St tone="bad">Missing</St>
        ),
    },
    {
      key: "gross",
      head: "Gross Emoluments",
      right: true,
      cell: (r) => <Amt value={r.grossEmoluments} currency={r.currency} />,
    },
    {
      key: "taxable",
      head: "Taxable",
      right: true,
      cell: (r) => <Amt value={r.taxableEmoluments} currency={r.currency} />,
    },
    {
      key: "paye",
      head: "PAYE Deducted",
      right: true,
      cell: (r) => <Amt value={r.payeDeducted} currency={r.currency} weight={600} />,
    },
    {
      key: "aids",
      head: "AIDS Levy (3%)",
      right: true,
      cell: (r) => <Amt value={r.aidsLevy} currency={r.currency} />,
    },
  ];

  // Columns for NSSA
  const nssaColumns: Array<WsColumn<typeof filteredNssa[number]>> = [
    {
      key: "member",
      head: "Member",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={r.name} size={24} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>{r.name}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{r.employeeNumber}</span>
          </span>
        </span>
      ),
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (r) => r.currency,
    },
    {
      key: "nssaNumber",
      head: "NSSA number",
      cell: (r) =>
        r.nssaNumber ? (
          <span className="mono">{r.nssaNumber}</span>
        ) : (
          <St tone="bad">Missing</St>
        ),
    },
    {
      key: "insurable",
      head: "Insurable earnings",
      right: true,
      cell: (r) => <Amt value={r.insurableEarnings} currency={r.currency} />,
    },
    {
      key: "emp",
      head: "Employee (4.5%)",
      right: true,
      cell: (r) => <Amt value={r.employeeContribution} currency={r.currency} />,
    },
    {
      key: "empr",
      head: "Employer (4.5%)",
      right: true,
      cell: (r) => <Amt value={r.employerContribution} currency={r.currency} />,
    },
    {
      key: "total",
      head: "Total Contribution",
      right: true,
      cell: (r) => <Amt value={r.total} currency={r.currency} weight={600} />,
    },
  ];

  // Columns for Reconciliation
  const reconColumns: Array<WsColumn<ReconciliationLine>> = [
    {
      key: "label",
      head: "Liability description",
      cell: (l) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>{l.label}</span>
      ),
    },
    {
      key: "account",
      head: "General Ledger Account",
      className: "muted mono",
      cell: (l) => l.accountCode,
    },
    {
      key: "returnAmt",
      head: "Calculated Return",
      right: true,
      cell: (l) => <Amt value={l.returnAmountBase} currency="USD" />,
    },
    {
      key: "ledgerAmt",
      head: "Ledger Balance",
      right: true,
      cell: (l) => <Amt value={l.ledgerAmountBase} currency="USD" />,
    },
    {
      key: "diff",
      head: "Variance / Diff",
      right: true,
      cell: (l) =>
        l.reconciled ? (
          <None />
        ) : (
          <Amt value={l.difference} currency="USD" weight={600} tone="bad" />
        ),
    },
    {
      key: "status",
      head: "Status",
      cell: (l) => <St tone={l.reconciled ? "done" : "bad"}>{l.reconciled ? "Agrees" : "Mismatch"}</St>,
    },
  ];

  const totalPaye = useMemo(() => filteredP2.reduce((s, r) => s + r.payeDeducted, 0), [filteredP2]);
  const totalNssa = useMemo(() => filteredNssa.reduce((s, r) => s + r.total, 0), [filteredNssa]);

  const p2Totals = [
    `${filteredP2.length} staff`,
    null,
    null,
    null,
    null,
    <Amt key="tot" value={totalPaye} currency="USD" weight={600} />,
    null,
  ];

  const nssaTotals = [
    `${filteredNssa.length} members`,
    null,
    null,
    null,
    null,
    null,
    <Amt key="tot" value={totalNssa} currency="USD" weight={600} />,
  ];

  return (
    <PayrollShell
      activeTab="statutory-returns"
      title="Statutory Tax Returns"
      actions={
        <Button variant="default" icon="export" onClick={handleExportCsv}>
          Export current return
        </Button>
      }
    >
      <BkPage screen="statutory-returns" scroll={false}>
        <BkFinding
          fact={
            blockers.length > 0
              ? `${blockers.length} validation blocker${blockers.length === 1 ? "" : "s"} prevent filing this return.`
              : data?.reconciliation.reconciled
              ? `All figures reconciled cleanly against general ledger accounts for ${selectedPeriodLabel}.`
              : `Monthly statutory return for ${selectedPeriodLabel} ready for review.`
          }
          rest={
            blockers.length > 0
              ? "Missing tax or NSSA registration numbers must be entered before filing with ZIMRA/NSSA."
              : "Check return schedules against banking disbursements prior to submitting P2 remittance."
          }
        />

        {blockers.length > 0 ? (
          <div style={{ padding: "0 16px 8px" }}>
            <Alert variant="destructive">
              <AlertTitle>Filing blocked — {blockers.length} issues identified</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <BkTabs
          label="Return views"
          value={tab}
          onChange={(next) => setTab(next as TabKey)}
          items={[
            { value: "p2", label: "ZIMRA P2 PAYE return", count: p2Schedules.length },
            { value: "nssa", label: "NSSA schedule return", count: nssaSchedules.length },
            {
              value: "reconciliation",
              label: "General ledger reconciliation",
              count: data?.reconciliation.lines.length ?? 0,
            },
          ]}
        />

        <BkTools
          find="Search return schedules by employee name or ID..."
          query={search}
          onFind={setSearch}
          count={
            tab === "p2"
              ? filteredP2.length
              : tab === "nssa"
              ? filteredNssa.length
              : data?.reconciliation.lines.length ?? 0
          }
          filters={
            <BkFilter
              label="Payroll Period"
              value={selectedPeriodLabel}
              items={periods.map((p) => ({
                key: p.value,
                label: p.label,
                checked: periodKey === p.value,
                onSelect: () => setPeriodKey(p.value),
              }))}
            />
          }
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

        <BkScroll>
          {query.isLoading ? (
            <div style={{ padding: 48, textAlign: "center" }} className="muted">
              Calculating statutory returns for {selectedPeriodLabel}...
            </div>
          ) : query.isError ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--color-danger)" }}>
              {getApiErrorMessage(query.error)}
            </div>
          ) : tab === "p2" ? (
            <Worksheet
              label="P2 PAYE schedule"
              rows={filteredP2}
              rowKey={(r) => `${r.currency}-${r.employeeId}`}
              columns={p2Columns}
              totals={p2Totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No P2 return figures for this period.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Statutory returns require at least one approved salary run in this calendar month.
                  </p>
                </div>
              }
            />
          ) : tab === "nssa" ? (
            <Worksheet
              label="NSSA return schedule"
              rows={filteredNssa}
              rowKey={(r) => `${r.currency}-${r.employeeId}`}
              columns={nssaColumns}
              totals={nssaTotals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No NSSA schedule figures for this period.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Approve a payroll run to generate NSSA social security contributions.
                  </p>
                </div>
              }
            />
          ) : (
            <Worksheet
              label="ledger reconciliation"
              rows={data?.reconciliation.lines ?? []}
              rowKey={(l) => `${l.accountCode}-${l.label}`}
              columns={reconColumns}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No general ledger reconciliation lines.
                  </p>
                </div>
              }
            />
          )}
        </BkScroll>
      </BkPage>
    </PayrollShell>
  );
}
