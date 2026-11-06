"use client";

import * as React from "react";
import Link from "next/link";
import { differenceInCalendarDays, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import {
  BkChip,
  BkQuietTools,
  BkState,
  BkTabs,
  BkTools,
  downloadCsv,
} from "@/components/books/bk-list";
import {
  Button,
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { PayrollShell } from "@/components/payroll/payroll-shell";
import { fetchEmployeePayments, type EmployeePayment } from "@/lib/api";
import { money } from "@/lib/books/format";

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

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredRows.length);
  const pagedRows = React.useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  const ids = React.useMemo(() => pagedRows.map((r) => r.id), [pagedRows]);
  const selection = useSelection(ids);

  const totalOutstandingSum = React.useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.outstandingAmount, 0);
  }, [filteredRows]);

  const handleExportCsv = () => {
    const csv = [
      ["Employee ID", "Employee Name", "Due Date", "Overdue Days", "Total Amount", "Paid Amount", "Outstanding Balance", "Status"],
      ...filteredRows.map((r) => [
        r.employee.employeeId,
        r.employee.name,
        r.dueDate.slice(0, 10),
        String(r.overdueDays),
        String(r.amount),
        String(r.paidAmount ?? 0),
        String(r.outstandingAmount),
        r.status,
      ]),
    ];
    downloadCsv(`outstanding-salaries-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <PayrollShell
      activeTab="salaries"
      title="Outstanding Staff Salaries"
      actions={
        <Button asChild variant="primary">
          <Link href="/payroll/disbursements">Create disbursement</Link>
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Outstanding views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "overdue", label: "Overdue payments", count: overdueCount },
                { value: "all", label: "All outstanding balances", count: outstandingRows.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search outstanding salaries by employee..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredRows.length} of ${outstandingRows.length}`}
              chips={
                <BkChip
                  label="Status"
                  value={statusFilter === "ALL" ? "All balances" : statusFilter === "PARTIAL" ? "Partially paid" : statusFilter}
                  set={statusFilter !== "ALL"}
                  items={[
                    { key: "ALL", label: "All balances", checked: statusFilter === "ALL", onSelect: () => setStatusFilter("ALL") },
                    { separator: true },
                    { key: "PARTIAL", label: "Partially paid", checked: statusFilter === "PARTIAL", onSelect: () => setStatusFilter("PARTIAL") },
                  ]}
                />
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Outstanding salaries"
              foot={
                <TableFoot
                  range={filteredRows.length === 0 ? "None" : `${from} to ${to} of ${filteredRows.length}`}
                  sums={[{ label: "Total Outstanding", value: money(totalOutstandingSum, "USD") }]}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredRows.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selection.selected.size,
                    onClear: selection.clear,
                    actions: (
                      <Button icon="export" onClick={handleExportCsv}>
                        Export selected
                      </Button>
                    ),
                  }}
                />
              }
            >
              {filteredRows.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No outstanding salaries</b>
                  <p className="muted">All staff compensation is settled and up to date.</p>
                </div>
              ) : (
                <table className="table" aria-label="Outstanding salaries">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 110 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all rows"
                      />
                      <th>Employee</th>
                      <th>Due date</th>
                      <th className="num">Overdue</th>
                      <th className="num">Total Due</th>
                      <th className="num">Paid</th>
                      <th className="num">Outstanding</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => {
                      const isSelected = selection.isSelected(row.id);
                      return (
                        <tr key={row.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(row.id)}
                            label={`Select ${row.employee.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={row.employee.name} />
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                  {row.employee.name}
                                </span>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {row.employee.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {format(new Date(row.dueDate), "dd MMM yyyy")}
                          </td>
                          <td className="num">
                            {row.overdueDays > 0 ? (
                              <span style={{ fontWeight: 600, color: "var(--color-danger)" }}>
                                {row.overdueDays}d late
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="num">{money(row.amount, row.currency || "USD")}</td>
                          <td className="num muted">
                            {money(row.paidAmount ?? 0, row.currency || "USD")}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(row.outstandingAmount, row.currency || "USD")}
                          </td>
                          <td>
                            <BkState tone={row.isOverdue ? "danger" : "warning"}>
                              {row.isOverdue ? "Overdue" : "Pending"}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Button asChild size="sm">
                              <Link href={`/payroll/disbursements?employeeId=${row.employeeId}`}>
                                Pay now
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>
          </div>
        </KitScreen>
      </Kit>
    </PayrollShell>
  );
}
