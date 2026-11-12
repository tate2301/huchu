"use client";

import * as React from "react";
import { format } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  Amt,
  BkEmpty,
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
import { BooksLoading } from "@/components/books/books-state";
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

function HrSalariesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = (searchParams.get("tab") as SalaryTab) || "awaiting";
  const search = searchParams.get("q") || "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 20;

  const onQuery = React.useCallback(
    (next: { tab?: string; q?: string; page?: number }) => {
      const merged = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty =
          value === null ||
          value === undefined ||
          value === "" ||
          (key === "tab" && value === "awaiting") ||
          (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const setTab = (nextTab: SalaryTab) => onQuery({ tab: nextTab, page: 1 });
  const setSearch = (nextQ: string) => onQuery({ q: nextQ, page: 1 });
  const setPage = (nextPage: number) => onQuery({ page: nextPage });

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
          "Salary",
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
      head: "Run",
      cell: (r) => `Run ${r.runNumber}`,
    },
    {
      key: "date",
      head: "Created",
      className: "muted mono",
      cell: (r) => (r.createdAt ? format(new Date(r.createdAt), "d MMM yyyy") : <None />),
    },
    {
      key: "preparedBy",
      head: "Prepared by",
      cell: (r) =>
        r.createdBy?.name ? (
          <Person name={r.createdBy.name} />
        ) : (
          <None />
        ),
    },
    {
      key: "netTotal",
      head: "Net pay",
      right: true,
      cell: (r) => <Amt value={r.netTotal} currency="USD" />,
    },
    {
      key: "status",
      head: "Status",
      cell: () => <St tone="info">Approved</St>,
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
          Pay out
        </ButtonLink>
      ),
    },
  ];

  // Columns for Batches
  const batchColumns: Array<WsColumn<DisbursementBatchRecord>> = [
    {
      key: "code",
      head: "Batch",
      cell: (b) => b.code,
    },
    {
      key: "date",
      head: "Created",
      className: "muted mono",
      cell: (b) => (b.createdAt ? format(new Date(b.createdAt), "d MMM yyyy") : <None />),
    },
    {
      key: "count",
      head: "Recipients",
      className: "mono",
      cell: (b) => `${b.itemCount} ${b.itemCount === 1 ? "employee" : "employees"}`,
    },
    {
      key: "amount",
      head: "Total",
      right: true,
      cell: (b) => <Amt value={b.totalAmount} currency="USD" />,
    },
    {
      key: "status",
      head: "Status",
      cell: (b) => {
        const tone = b.status === "PAID" ? "done" : b.status === "REJECTED" ? "bad" : "warn";
        return <St tone={tone}>{b.status === "PAID" ? "Paid" : b.status === "REJECTED" ? "Rejected" : b.status === "APPROVED" ? "Approved" : b.status === "SUBMITTED" ? "Waiting for approval" : "Draft"}</St>;
      },
    },
  ];

  // Columns for Payment Lines
  const paymentColumns: Array<WsColumn<EmployeePayment>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (p) => (
        <Person name={p.employee.name} sub={p.employee.employeeId} />
      ),
    },
    {
      key: "type",
      head: "Type",
      className: "muted",
      cell: () => "Salary",
    },
    {
      key: "dueDate",
      head: "Due",
      className: "mono",
      cell: (p) => (p.dueDate ? format(new Date(p.dueDate), "d MMM yyyy") : <None />),
    },
    {
      key: "amount",
      head: "Due amount",
      right: true,
      cell: (p) => <Amt value={p.amount} currency="USD" />,
    },
    {
      key: "paid",
      head: "Paid",
      right: true,
      cell: (p) => <Amt value={p.paidAmount ?? 0} currency="USD" />,
    },
    {
      key: "status",
      head: "Status",
      cell: (p) => {
        const tone = p.status === "PAID" ? "done" : p.status === "PARTIAL" ? "info" : "warn";
        return <St tone={tone}>{p.status === "PAID" ? "Paid" : p.status === "PARTIAL" ? "Part paid" : "To pay"}</St>;
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
          <Amt key="tot" value={awaitingSum} currency="USD" />,
          null,
          null,
        ]
      : tab === "batches"
      ? [
          `${filteredBatches.length} batches`,
          null,
          null,
          <Amt key="tot" value={batchesSum} currency="USD" className="font-medium" />,
          null,
          null,
        ]
      : [`${filteredPayments.length} records`, null, null, null, null, null];

  return (
    <PayrollShell
      activeTab="salaries"
      title="Salary payments"
      primary={{
        label: "Disbursements",
        icon: "bank",
        href: "/payroll/disbursements",
      }}
      actions={
        <ButtonLink href="/payroll/salaries/outstanding" variant="quiet" icon="calendar">
          Outstanding
        </ButtonLink>
      }
    >
      <BkPage screen="payroll-salaries" scroll={false}>
        <BkFinding
          fact={
            tab === "awaiting"
              ? `${awaitingRuns.length} approved ${awaitingRuns.length === 1 ? "run" : "runs"} to pay out.`
              : tab === "batches"
              ? `${batches.length} ${batches.length === 1 ? "batch" : "batches"}.`
              : `${payments.length} salary ${payments.length === 1 ? "payment" : "payments"}.`
          }
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
            { value: "awaiting", label: "To pay out", count: awaitingRuns.length, icon: "clock" },
            { value: "batches", label: "Batches", count: batches.length, icon: "payments" },
            { value: "lines", label: "Payments", count: payments.length, icon: "list" },
          ]}
        />

        <BkTools
          find="Search"
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          end={<BkQuietTools onExport={handleExportCsv} />}
        />

        <BkScroll>
          {tab === "awaiting" ? (
            <Worksheet
              label="approved payroll runs"
              openHref={(r) => `/payroll/runs/${r.id}`}
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
                <BkEmpty>Nothing to pay out.</BkEmpty>
              }
            />
          ) : tab === "batches" ? (
            <Worksheet
              label="disbursement batches"
              openHref={(b) => `/payroll/disbursements/${b.id}`}
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
                <BkEmpty>No batches yet.</BkEmpty>
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
                <BkEmpty>No payments here.</BkEmpty>
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

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
        >
          <Button icon="export" onClick={handleExportCsv}>
            Export ({selection.selected.size})
          </Button>
        </BkSelectionBar>
      </BkPage>
    </PayrollShell>
  );
}

export default function HrSalariesPage() {
  return (
    <React.Suspense
      fallback={
        <PayrollShell activeTab="salaries">
          <BooksLoading />
        </PayrollShell>
      }
    >
      <HrSalariesContent />
    </React.Suspense>
  );
}
