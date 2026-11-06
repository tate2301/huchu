"use client";

import * as React from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import {
  Amt,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkSelectionBar,
  BkTabs,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import {
  Button,
  ButtonLink,
  Person,
  useSelection,
} from "@/components/core";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import {
  fetchDisbursementBatches,
  fetchEmployeePayments,
  fetchPayrollRuns,
  type DisbursementBatchRecord,
  type EmployeePayment,
  type PayrollRunRecord,
} from "@/lib/api";

type SalaryTab = "awaiting" | "batches" | "lines";

export default function HrSalariesPage() {
  const [tab, setTab] = React.useState<SalaryTab>("awaiting");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const { data: runsData } = useQuery({
    queryKey: ["payroll-runs", "salary-ops"],
    queryFn: () => fetchPayrollRuns({ limit: 200 }),
  });
  const runs = React.useMemo(() => runsData?.data ?? [], [runsData]);

  const awaitingRuns = React.useMemo(
    () => runs.filter((r) => r.status === "APPROVED"),
    [runs]
  );

  const { data: batchesData } = useQuery({
    queryKey: ["disbursement-batches", "salary-ops"],
    queryFn: () => fetchDisbursementBatches({ limit: 100 }),
  });
  const batches = React.useMemo(() => batchesData?.data ?? [], [batchesData]);

  const { data: paymentsData } = useQuery({
    queryKey: ["employee-payments", "salary-ops"],
    queryFn: () => fetchEmployeePayments({ limit: 250 }),
  });
  const payments = React.useMemo(() => paymentsData?.data ?? [], [paymentsData]);

  // Filtering
  const filteredAwaiting = React.useMemo(() => {
    let list = [...awaitingRuns];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => String(r.runNumber).includes(q) || r.status.toLowerCase().includes(q));
    }
    return list;
  }, [awaitingRuns, search]);

  const filteredBatches = React.useMemo(() => {
    let list = [...batches];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.code.toLowerCase().includes(q) || b.status.toLowerCase().includes(q));
    }
    return list;
  }, [batches, search]);

  const filteredPayments = React.useMemo(() => {
    let list = [...payments];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.employee.name.toLowerCase().includes(q) ||
          p.employee.employeeId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, search]);

  const activeItems =
    tab === "awaiting"
      ? filteredAwaiting
      : tab === "batches"
      ? filteredBatches
      : filteredPayments;

  const totalRows = activeItems.length;
  const pageRows = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const handleExportCsv = () => {
    if (tab === "awaiting") {
      downloadCsv(
        `awaiting-disbursement-runs-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Run #", "Created Date", "Status", "Net Payout"],
        filteredAwaiting.map((r) => [
          String(r.runNumber),
          r.createdAt ? String(r.createdAt).slice(0, 10) : "",
          r.status,
          String(r.netTotal),
        ])
      );
    } else if (tab === "batches") {
      downloadCsv(
        `disbursement-batches-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Batch Code", "Created Date", "Items", "Status", "Total Amount"],
        filteredBatches.map((b) => [
          b.code,
          b.createdAt ? String(b.createdAt).slice(0, 10) : "",
          String(b.itemCount),
          b.status,
          String(b.totalAmount),
        ])
      );
    } else {
      downloadCsv(
        `payment-lines-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Employee", "Employee ID", "Type", "Due Date", "Amount", "Paid Amount", "Status"],
        filteredPayments.map((p) => [
          p.employee.name,
          p.employee.employeeId,
          p.type,
          p.dueDate ? String(p.dueDate).slice(0, 10) : "",
          String(p.amount),
          String(p.paidAmount ?? 0),
          p.status,
        ])
      );
    }
  };

  // Columns for Awaiting Runs
  const awaitingColumns: Array<WsColumn<PayrollRunRecord>> = [
    {
      key: "runNumber",
      head: "Run #",
      cell: (r) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
          Run #{r.runNumber}
        </span>
      ),
    },
    {
      key: "date",
      head: "Approval date",
      className: "muted mono",
      cell: (r) => (r.createdAt ? format(new Date(r.createdAt), "dd MMM yyyy") : <None />),
    },
    {
      key: "preparedBy",
      head: "Prepared by",
      cell: (r) =>
        r.createdBy?.name ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Person name={r.createdBy.name} size={24} />
            <span>{r.createdBy.name}</span>
          </span>
        ) : (
          <None />
        ),
    },
    {
      key: "netTotal",
      head: "Net Payout",
      right: true,
      cell: (r) => <Amt value={r.netTotal} currency="USD" weight={600} />,
    },
    {
      key: "status",
      head: "Status",
      cell: () => <St tone="done">APPROVED</St>,
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: (r) => (
        <ButtonLink
          href={`/payroll/disbursements?runId=${r.id}`}
          size="sm"
          variant="primary"
          onClick={(e) => e.stopPropagation()}
        >
          Create disbursement
        </ButtonLink>
      ),
    },
  ];

  // Columns for Batches
  const batchColumns: Array<WsColumn<DisbursementBatchRecord>> = [
    {
      key: "code",
      head: "Batch code",
      cell: (b) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
          {b.code}
        </span>
      ),
    },
    {
      key: "date",
      head: "Created date",
      className: "muted mono",
      cell: (b) => (b.createdAt ? format(new Date(b.createdAt), "dd MMM yyyy") : <None />),
    },
    {
      key: "count",
      head: "Recipients",
      className: "mono",
      cell: (b) => `${b.itemCount} employees`,
    },
    {
      key: "amount",
      head: "Total Amount",
      right: true,
      cell: (b) => <Amt value={b.totalAmount} currency="USD" weight={600} />,
    },
    {
      key: "status",
      head: "Status",
      cell: (b) => {
        const tone = b.status === "PAID" ? "done" : b.status === "REJECTED" ? "bad" : "warn";
        return <St tone={tone}>{b.status}</St>;
      },
    },
    {
      key: "actions",
      head: "",
      right: true,
      cell: () => (
        <ButtonLink href="/payroll/disbursements" size="sm" onClick={(e) => e.stopPropagation()}>
          View in batches
        </ButtonLink>
      ),
    },
  ];

  // Columns for Payment Lines
  const paymentColumns: Array<WsColumn<EmployeePayment>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={p.employee.name} size={24} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>{p.employee.name}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{p.employee.employeeId}</span>
          </span>
        </span>
      ),
    },
    {
      key: "type",
      head: "Payment type",
      className: "muted",
      cell: (p) => p.type,
    },
    {
      key: "dueDate",
      head: "Due date",
      className: "mono",
      cell: (p) => (p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : <None />),
    },
    {
      key: "amount",
      head: "Scheduled",
      right: true,
      cell: (p) => <Amt value={p.amount} currency="USD" />,
    },
    {
      key: "paid",
      head: "Disbursed",
      right: true,
      cell: (p) => <Amt value={p.paidAmount ?? 0} currency="USD" />,
    },
    {
      key: "status",
      head: "Status",
      cell: (p) => {
        const tone = p.status === "PAID" ? "done" : p.status === "PARTIAL" ? "info" : "warn";
        return <St tone={tone}>{p.status}</St>;
      },
    },
  ];

  const awaitingSum = React.useMemo(
    () => filteredAwaiting.reduce((sum, r) => sum + r.netTotal, 0),
    [filteredAwaiting]
  );
  const batchesSum = React.useMemo(
    () => filteredBatches.reduce((sum, b) => sum + b.totalAmount, 0),
    [filteredBatches]
  );

  const totals =
    tab === "awaiting"
      ? [
          `${filteredAwaiting.length} runs`,
          null,
          null,
          <Amt key="tot" value={awaitingSum} currency="USD" weight={600} />,
          null,
          null,
        ]
      : tab === "batches"
      ? [
          `${filteredBatches.length} batches`,
          null,
          null,
          <Amt key="tot" value={batchesSum} currency="USD" weight={600} />,
          null,
          null,
        ]
      : [`${filteredPayments.length} records`, null, null, null, null, null];

  return (
    <PayrollShell
      activeTab="salaries"
      title="Salary Payments & Operations"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonLink href="/payroll/salaries/outstanding" variant="default" icon="calendar">
            Outstanding aging
          </ButtonLink>
          <ButtonLink href="/payroll/disbursements" variant="primary" icon="plus">
            Open disbursements
          </ButtonLink>
        </div>
      }
    >
      <BkPage screen="payroll-salaries" scroll={false}>
        <BkFinding
          fact={
            tab === "awaiting"
              ? `${awaitingRuns.length} approved runs ready for banking disbursement.`
              : tab === "batches"
              ? `${batches.length} payout batches created across all periods.`
              : `${payments.length} individual employee salary payment records.`
          }
          rest="Select any row to view operational statuses or prepare transfer batches."
        />

        <BkTabs
          label="Salary views"
          value={tab}
          onChange={(next) => {
            setTab(next as SalaryTab);
            setPage(1);
            selection.clear();
          }}
          items={[
            { value: "awaiting", label: "Awaiting disbursement", count: awaitingRuns.length },
            { value: "batches", label: "Disbursement batches", count: batches.length },
            { value: "lines", label: "All payment lines", count: payments.length },
          ]}
        />

        {selection.selected.size > 0 ? (
          <BkSelectionBar
            selection={{
              count: selection.selected.size,
              clear: selection.clear,
            }}
            actions={
              <Button variant="quiet" icon="export" onClick={handleExportCsv}>
                Export selected ({selection.selected.size})
              </Button>
            }
          />
        ) : (
          <BkTools
            find={
              tab === "awaiting"
                ? "Search approved runs..."
                : tab === "batches"
                ? "Search batches by code or status..."
                : "Search payments by staff name or ID..."
            }
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            end={<BkQuietTools onExport={handleExportCsv} />}
          />
        )}

        <BkScroll>
          {tab === "awaiting" ? (
            <Worksheet
              label="approved payroll runs"
              rows={pageRows as PayrollRunRecord[]}
              rowKey={(r) => r.id}
              columns={awaitingColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (r) => `Run #${r.runNumber}`,
              }}
              totals={totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No runs awaiting disbursement.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    All approved payroll runs have been queued or processed.
                  </p>
                </div>
              }
            />
          ) : tab === "batches" ? (
            <Worksheet
              label="disbursement batches"
              rows={pageRows as DisbursementBatchRecord[]}
              rowKey={(b) => b.id}
              columns={batchColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (b) => b.code,
              }}
              totals={totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No disbursement batches found.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Create a disbursement batch from an approved run.
                  </p>
                </div>
              }
            />
          ) : (
            <Worksheet
              label="payment lines"
              rows={pageRows as EmployeePayment[]}
              rowKey={(p) => p.id}
              columns={paymentColumns}
              selection={{
                selected: selection.selected,
                toggle: selection.toggle,
                toggleAll: selection.toggleAll,
                all: selection.all,
                some: selection.some,
                labelOf: (p) => p.employee.name,
              }}
              totals={totals}
              empty={
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No salary payment lines match the search.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Check back after approving your next payroll cycle.
                  </p>
                </div>
              }
            />
          )}
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />
      </BkPage>
    </PayrollShell>
  );
}
