"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import {
  Amt,
  BkEmpty,
  BkFilter,
  BkNote,
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
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import { fetchJson } from "@/lib/api-client";

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
  effectiveTo: string | null;
  source: string | null;
};

type StatutoryResponse = {
  asOf: string;
  seededCount: number;
  payeTables: PayeTable[];
  rates: StatutoryRate[];
  credits: TaxCredit[];
  necAgreements: NecAgreement[];
};

const RATE_LABELS: Record<string, string> = {
  AIDS_LEVY: "National AIDS Trust Fund (AIDS Levy)",
  NSSA_POBS_EMPLOYEE: "NSSA Pension — employee share",
  NSSA_POBS_EMPLOYER: "NSSA Pension — employer share",
  NSSA_APWCS: "NSSA Accident Prevention & Workers' Compensation",
  SDF: "Standards Development Fund (SDF)",
  ZIMDEF: "ZIMDEF training levy",
};

const RATE_BASIS: Record<string, string> = {
  AIDS_LEVY: "PAYE after tax credits",
  NSSA_POBS_EMPLOYEE: "Insurable earnings, capped monthly",
  NSSA_POBS_EMPLOYER: "Insurable earnings, capped monthly",
  NSSA_APWCS: "Insurable earnings (employer only)",
  SDF: "Gross payroll (employer only)",
  ZIMDEF: "Gross payroll (employer only)",
};

const CREDIT_LABELS: Record<string, string> = {
  BLIND_PERSON: "Blind person credit",
  DISABLED_PERSON: "Disabled person credit",
  ELDERLY_PERSON: "Elderly person credit (age 55+)",
  MEDICAL_EXPENSES: "Medical aid & expenses credit",
};

function monthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let offset = -2; offset < 10; offset += 1) {
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

function band(row: Band) {
  const lower = Number(row.lowerBound).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const upper = row.upperBound
    ? Number(row.upperBound).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "and above";
  return row.upperBound ? `${lower} – ${upper}` : `${lower} ${upper}`;
}

type TabView = "paye" | "rates" | "credits" | "nec";

type FlattenedBand = Band & {
  currency: string;
  cycle: string;
  source: string | null;
  isSeeded: boolean;
};

export function StatutoryTablesContent() {
  const months = useMemo(() => monthOptions(), []);
  const [asOf, setAsOf] = useState(months[2]?.value ?? months[0].value);
  const [tab, setTab] = useState<TabView>("paye");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["hr", "statutory", asOf],
    queryFn: () =>
      fetchJson<StatutoryResponse>(`/api/payroll/statutory?asOf=${asOf}`),
  });

  const data = query.data;

  const selectedMonthLabel = useMemo(
    () => months.find((m) => m.value === asOf)?.label ?? asOf,
    [months, asOf]
  );

  // Flattened PAYE bands
  const flattenedBands = useMemo<FlattenedBand[]>(() => {
    return (
      data?.payeTables.flatMap((table) =>
        table.bands.map((b) => ({
          ...b,
          currency: table.currency,
          cycle: table.cycle,
          source: table.source,
          isSeeded: table.isSeeded,
        }))
      ) ?? []
    );
  }, [data]);

  const filteredBands = useMemo(() => {
    let list = flattenedBands;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.currency.toLowerCase().includes(q) || b.cycle.toLowerCase().includes(q));
    }
    return list;
  }, [flattenedBands, search]);

  const filteredRates = useMemo(() => {
    let list = data?.rates ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          (RATE_LABELS[r.key] ?? r.key).toLowerCase().includes(q) ||
          (r.currency && r.currency.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, search]);

  const filteredCredits = useMemo(() => {
    let list = data?.credits ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => (CREDIT_LABELS[c.key] ?? c.key).toLowerCase().includes(q));
    }
    return list;
  }, [data, search]);

  const filteredNec = useMemo(() => {
    let list = data?.necAgreements ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((n) => n.councilName.toLowerCase().includes(q));
    }
    return list;
  }, [data, search]);

  const handleExportCsv = () => {
    if (tab === "paye") {
      downloadCsv(
        `paye-tax-bands-${asOf}.csv`,
        ["Currency", "Cycle", "Taxable Gross Range", "Rate %", "Deduction Amount", "Seeded"],
        filteredBands.map((b) => [
          b.currency,
          b.cycle,
          band(b),
          `${Number(b.ratePercent).toFixed(2)}%`,
          b.deductAmount,
          b.isSeeded ? "Yes" : "No",
        ])
      );
    } else if (tab === "rates") {
      downloadCsv(
        `statutory-rates-${asOf}.csv`,
        ["Levy/Contribution", "Currency", "Rate %", "Ceiling", "Charged On", "Effective From"],
        filteredRates.map((r) => [
          RATE_LABELS[r.key] ?? r.key,
          r.currency || "Any",
          `${Number(r.ratePercent).toFixed(2)}%`,
          r.ceilingAmount || "None",
          RATE_BASIS[r.key] || "",
          r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : "",
        ])
      );
    } else if (tab === "credits") {
      downloadCsv(
        `tax-credits-${asOf}.csv`,
        ["Credit Name", "Currency", "Worth", "Effective From"],
        filteredCredits.map((c) => [
          CREDIT_LABELS[c.key] ?? c.key,
          c.currency,
          c.ratePercent ? `${Number(c.ratePercent).toFixed(2)}%` : String(c.amount ?? 0),
          c.effectiveFrom ? String(c.effectiveFrom).slice(0, 10) : "",
        ])
      );
    } else {
      downloadCsv(
        `nec-agreements-${asOf}.csv`,
        ["Council Name", "Currency", "Employee Share", "Employer Share", "Effective From"],
        filteredNec.map((n) => [
          n.councilName,
          n.currency,
          n.employeeRatePercent ? `${n.employeeRatePercent}%` : String(n.employeeFixedAmount ?? 0),
          n.employerRatePercent ? `${n.employerRatePercent}%` : String(n.employerFixedAmount ?? 0),
          n.effectiveFrom ? String(n.effectiveFrom).slice(0, 10) : "",
        ])
      );
    }
  };

  // Columns for PAYE
  const payeColumns: Array<WsColumn<FlattenedBand>> = [
    {
      key: "currency",
      head: "Currency",
      cell: (b) => `${b.currency} ${b.cycle.toLowerCase()}`,
    },
    {
      key: "range",
      head: "Taxable gross",
      cell: (b) => <span className="mono">{band(b)}</span>,
    },
    {
      key: "rate",
      head: "Rate",
      right: true,
      cell: (b) => `${Number(b.ratePercent).toFixed(2)}%`,
    },
    {
      key: "deduct",
      head: "Deduct",
      right: true,
      cell: (b) => <Amt value={parseFloat(b.deductAmount)} currency={b.currency} />,
    },
    {
      key: "seeded",
      head: "Source",
      cell: (b) => (b.isSeeded ? <St tone="draft">Starting value</St> : <St tone="done">In force</St>),
    },
  ];

  // Columns for Rates
  const rateColumns: Array<WsColumn<StatutoryRate>> = [
    {
      key: "name",
      head: "Levy",
      cell: (r) => (
        <>
          {RATE_LABELS[r.key] ?? r.key}
          {RATE_BASIS[r.key] ? <span className="muted"> {RATE_BASIS[r.key]}</span> : null}
        </>
      ),
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (r) => r.currency || "Any",
    },
    {
      key: "rate",
      head: "Rate",
      right: true,
      className: "mono",
      cell: (r) => `${Number(r.ratePercent).toFixed(2)}%`,
    },
    {
      key: "ceiling",
      head: "Monthly cap",
      right: true,
      cell: (r) =>
        r.ceilingAmount ? (
          <Amt value={parseFloat(r.ceilingAmount)} currency={r.currency || "USD"} />
        ) : (
          <None />
        ),
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => (r.isSeeded ? <St tone="draft">Starting value</St> : <St tone="done">In force</St>),
    },
  ];

  // Columns for Credits
  const creditColumns: Array<WsColumn<TaxCredit>> = [
    {
      key: "name",
      head: "Credit",
      cell: (c) => CREDIT_LABELS[c.key] ?? c.key,
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (c) => c.currency,
    },
    {
      key: "worth",
      head: "Allowance",
      right: true,
      cell: (c) =>
        c.ratePercent ? (
          <span className="mono">{Number(c.ratePercent).toFixed(2)}% of cost</span>
        ) : (
          <Amt value={parseFloat(c.amount ?? "0")} currency={c.currency} />
        ),
    },
    {
      key: "status",
      head: "Status",
      cell: (c) => (c.isSeeded ? <St tone="draft">Starting value</St> : <St tone="done">In force</St>),
    },
  ];

  // Columns for NEC
  const necColumns: Array<WsColumn<NecAgreement>> = [
    {
      key: "council",
      head: "Council",
      cell: (n) => n.councilName,
    },
    {
      key: "currency",
      head: "Currency",
      className: "muted mono",
      cell: (n) => n.currency,
    },
    {
      key: "employee",
      head: "Employee share",
      right: true,
      cell: (n) =>
        n.employeeRatePercent ? (
          <span className="mono">{Number(n.employeeRatePercent).toFixed(2)}%</span>
        ) : (
          <Amt value={parseFloat(n.employeeFixedAmount ?? "0")} currency={n.currency} />
        ),
    },
    {
      key: "employer",
      head: "Employer share",
      right: true,
      cell: (n) =>
        n.employerRatePercent ? (
          <span className="mono">{Number(n.employerRatePercent).toFixed(2)}%</span>
        ) : (
          <Amt value={parseFloat(n.employerFixedAmount ?? "0")} currency={n.currency} />
        ),
    },
  ];

  return (
    <PayrollShell
      activeTab="statutory-tables"
      title="Tax tables"
      primary={{
        label: "Export",
        icon: "export",
        shortcut: "E",
        onClick: handleExportCsv,
      }}
    >
      <BkPage screen="statutory-tables" scroll={false}>
        <BkFinding
          fact={
            data?.seededCount
              ? `${data.seededCount} ${data.seededCount === 1 ? "table uses" : "tables use"} starting values.`
              : `Rates for ${selectedMonthLabel}.`
          }
        />

        {data && data.seededCount > 0 ? (
          <BkNote tone="warn" icon="warn">
            <b>Starting values.</b> Check them against the current gazette for {selectedMonthLabel}.
          </BkNote>
        ) : null}

        <BkTabs
          label="Statutory views"
          value={tab}
          onChange={(next) => setTab(next as TabView)}
          items={[
            { value: "paye", label: "PAYE", count: flattenedBands.length, icon: "docs" },
            { value: "rates", label: "Levies", count: data?.rates.length ?? 0, icon: "figure" },
            { value: "credits", label: "Tax credits", count: data?.credits.length ?? 0, icon: "payments" },
            { value: "nec", label: "NEC", count: data?.necAgreements.length ?? 0, icon: "users" },
          ]}
        />

        <BkTools
          find="Search rates"
          query={search}
          onFind={setSearch}
          count={
            tab === "paye"
              ? filteredBands.length
              : tab === "rates"
              ? filteredRates.length
              : tab === "credits"
              ? filteredCredits.length
              : filteredNec.length
          }
          filters={
            <BkFilter
              label="Month"
              value={selectedMonthLabel}
              items={months.map((m) => ({
                key: m.value,
                label: m.label,
                checked: asOf === m.value,
                onSelect: () => setAsOf(m.value),
              }))}
            />
          }
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

        <BkScroll>
          {query.isLoading ? (
            <BooksLoading />
          ) : query.isError ? (
            <BooksError what="The tax tables" error={query.error} onRetry={() => void query.refetch()} />
          ) : tab === "paye" ? (
            <Worksheet
              label="PAYE progressive bands"
              rows={filteredBands}
              rowKey={(b) => `${b.currency}-${b.cycle}-${b.lowerBound}`}
              columns={payeColumns}
              empty={
                <BkEmpty>No PAYE bands this month.</BkEmpty>
              }
            />
          ) : tab === "rates" ? (
            <Worksheet
              label="statutory levies"
              rows={filteredRates}
              rowKey={(r) => r.id}
              columns={rateColumns}
              empty={
                <BkEmpty>No levies this month.</BkEmpty>
              }
            />
          ) : tab === "credits" ? (
            <Worksheet
              label="tax credits"
              rows={filteredCredits}
              rowKey={(c) => c.id}
              columns={creditColumns}
              empty={
                <BkEmpty>No credits this month.</BkEmpty>
              }
            />
          ) : (
            <Worksheet
              label="NEC council agreements"
              rows={filteredNec}
              rowKey={(n) => n.id}
              columns={necColumns}
              empty={
                <BkEmpty>No NEC agreements.</BkEmpty>
              }
            />
          )}
        </BkScroll>
      </BkPage>
    </PayrollShell>
  );
}
