"use client";

import * as React from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import {
  Amt,
  BkFilter,
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
import { fetchEmployeePayments, type EmployeePayment } from "@/lib/api";

type OutstandingTab = "overdue" | "all";

type RowView = EmployeePayment & {
  outstandingAmount: number;
  overdueDays: number;
  isOverdue: boolean;
};

export default function OutstandingSalariesPage() {
  const [tab, setTab] = React.useState<OutstandingTab>("overdue");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const { data } = useQuery({
    queryKey: ["employee-payments", "salary-outstanding-detail"],
    queryFn: () => fetchEmployeePayments({ type: "SALARY", limit: 1000 }),
  });

  const payments = React.useMemo(() => data?.data ?? [], [data]);
  const today = React.useMemo(() => new Date(), []);

  const outstandingRows = React.useMemo<RowView[]>(() => {
    return payments
      .map((payment) => {
        const paid = payment.paidAmount ?? 0;
        const outstandingAmount = Math.max(payment.amount - paid, 0);
        const dueDate = new Date(payment.dueDate);
        const overdueDays =
          outstandingAmount > 0 ? Math.max(differenceInCalendarDays(today, dueDate), 0) : 0;
        return {
          ...payment,
          outstandingAmount,
          overdueDays,
          isOverdue: overdueDays > 0,
        };
      })
      .filter((row) => row.outstandingAmount > 0.005);
  }, [payments, today]);

  const overdueCount = React.useMemo(() => outstandingRows.filter((r) => r.isOverdue).length, [outstandingRows]);

  // Filtering
  const filteredRows = React.useMemo(() => {
    let list = [...outstandingRows];
    if (tab === "overdue") {
      list = list.filter((r) => r.isOverdue);
    }
    if (statusFilter === "PARTIAL") {
      list = list.filter((r) => (r.paidAmount ?? 0) > 0);
    } else if (statusFilter === "UNPAID") {
      list = list.filter((r) => !r.paidAmount || r.paidAmount === 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.employee.name.toLowerCase().includes(q) ||
          r.employee.employeeId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [outstandingRows, tab, statusFilter, search]);

  const totalOutstanding = React.useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.outstandingAmount, 0);
  }, [filteredRows]);

  const totalRows = filteredRows.length;
  const pageRows = React.useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  const rowIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  const handleExportCsv = () => {
    downloadCsv(
      `outstanding-salaries-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Employee", "Employee ID", "Due Date", "Overdue Days", "Scheduled Amount", "Paid Amount", "Outstanding Amount", "Status"],
      filteredRows.map((r) => [
        r.employee.name,
        r.employee.employeeId,
        r.dueDate ? String(r.dueDate).slice(0, 10) : "",
        String(r.overdueDays),
        String(r.amount),
        String(r.paidAmount ?? 0),
        String(r.outstandingAmount),
        r.status,
      ])
    );
  };

  const columns: Array<WsColumn<RowView>> = [
    {
      key: "employee",
      head: "Employee",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Person name={r.employee.name} size={24} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>{r.employee.name}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{r.employee.employeeId}</span>
          </span>
        </span>
      ),
    },
    {
      key: "dueDate",
      head: "Due date",
      className: "mono",
      cell: (r) => (r.dueDate ? format(new Date(r.dueDate), "dd MMM yyyy") : <None />),
    },
    {
      key: "aging",
      head: "Aging / Overdue",
      cell: (r) => {
        if (!r.isOverdue) {
          return <span className="muted">Current</span>;
        }
        return (
          <span style={{ color: r.overdueDays > 30 ? "var(--color-danger)" : "var(--color-warning)", fontWeight: 500 }}>
            {r.overdueDays} days overdue
          </span>
        );
      },
    },
    {
      key: "amount",
      head: "Scheduled",
      right: true,
      cell: (r) => <Amt value={r.amount} currency="USD" />,
    },
    {
      key: "paid",
      head: "Paid",
      right: true,
      cell: (r) => <Amt value={r.paidAmount ?? 0} currency="USD" />,
    },
    {
      key: "outstanding",
      head: "Outstanding balance",
      right: true,
      cell: (r) => (
        <Amt
          value={r.outstandingAmount}
          currency="USD"
          weight={600}
          tone={r.isOverdue ? "bad" : undefined}
        />
      ),
    },
    {
      key: "status",
      head: "Status",
      cell: (r) => {
        const tone = r.status === "PAID" ? "done" : r.status === "PARTIAL" ? "info" : "warn";
        return <St tone={tone}>{r.status}</St>;
      },
    },
  ];

  const totals = [
    `${totalRows} balances`,
    null,
    null,
    null,
    null,
    <Amt key="tot" value={totalOutstanding} currency="USD" weight={600} />,
    null,
  ];

  return (
    <PayrollShell
      activeTab="salaries"
      title="Outstanding Salary Balances"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonLink href="/payroll/salaries" variant="default">
            Back to operations
          </ButtonLink>
          <ButtonLink href="/payroll/disbursements" variant="primary">
            Pay via disbursements
          </ButtonLink>
        </div>
      }
    >
      <BkPage screen="payroll-outstanding" scroll={false}>
        <BkFinding
          fact={`${overdueCount} salary payments are past their scheduled due date.`}
          rest="Review aging obligations and settle arrears through bulk disbursement batches."
        />

        <BkTabs
          label="Outstanding views"
          value={tab}
          onChange={(next) => {
            setTab(next as OutstandingTab);
            setPage(1);
            selection.clear();
          }}
          items={[
            { value: "overdue", label: "Overdue payments", count: overdueCount },
            { value: "all", label: "All outstanding balances", count: outstandingRows.length },
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
            find="Search outstanding payments by staff name or ID..."
            query={search}
            onFind={(q) => {
              setSearch(q);
              setPage(1);
            }}
            count={totalRows}
            filters={
              <BkFilter
                label="Payment status"
                value={statusFilter === "ALL" ? "All balances" : statusFilter === "PARTIAL" ? "Partially paid" : "Unpaid"}
                items={[
                  {
                    key: "all",
                    label: "All balances",
                    checked: statusFilter === "ALL",
                    onSelect: () => {
                      setStatusFilter("ALL");
                      setPage(1);
                    },
                  },
                  { separator: true },
                  {
                    key: "partial",
                    label: "Partially paid",
                    checked: statusFilter === "PARTIAL",
                    onSelect: () => {
                      setStatusFilter("PARTIAL");
                      setPage(1);
                    },
                  },
                  {
                    key: "unpaid",
                    label: "Unpaid (Zero payments)",
                    checked: statusFilter === "UNPAID",
                    onSelect: () => {
                      setStatusFilter("UNPAID");
                      setPage(1);
                    },
                  },
                ]}
              />
            }
            end={<BkQuietTools onExport={handleExportCsv} />}
          />
        )}

        <BkScroll>
          <Worksheet
            label="outstanding salary obligations"
            rows={pageRows}
            rowKey={(r) => r.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (r) => r.employee.name,
            }}
            totals={totals}
            empty={
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                  No outstanding salaries match the filters.
                </p>
                <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                  All salary obligations in this category are fully settled.
                </p>
              </div>
            }
          />
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
