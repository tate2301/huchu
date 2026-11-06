"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import {
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
import {
  fetchDisbursementBatches,
  fetchEmployeePayments,
  fetchPayrollRuns,
  type DisbursementBatchRecord,
  type EmployeePayment,
  type PayrollRunRecord,
} from "@/lib/api";
import { money } from "@/lib/books/format";

type SalaryTab = "awaiting" | "batches" | "lines";

export default function HrSalariesPage() {
  const [tab, setTab] = React.useState<SalaryTab>("awaiting");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

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
      list = list.filter((b) => b.batchNumber.toLowerCase().includes(q) || b.status.toLowerCase().includes(q));
    }
    return list;
  }, [batches, search]);

  const filteredPayments = React.useMemo(() => {
    let list = [...payments];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.employee.name.toLowerCase().includes(q) || p.employee.employeeId.toLowerCase().includes(q));
    }
    return list;
  }, [payments, search]);

  const activeItems =
    tab === "awaiting"
      ? filteredAwaiting
      : tab === "batches"
      ? filteredBatches
      : filteredPayments;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, activeItems.length);
  const pagedItems = React.useMemo(
    () => activeItems.slice((page - 1) * pageSize, page * pageSize),
    [activeItems, page, pageSize]
  );

  const ids = React.useMemo(() => pagedItems.map((item) => item.id), [pagedItems]);
  const selection = useSelection(ids);

  const handleExportCsv = () => {
    if (tab === "awaiting") {
      const csv = [
        ["Run #", "Date", "Status", "Net Total"],
        ...filteredAwaiting.map((r) => [String(r.runNumber), r.createdAt.slice(0, 10), r.status, String(r.netTotal)]),
      ];
      downloadCsv(`awaiting-payouts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } else if (tab === "batches") {
      const csv = [
        ["Batch Number", "Date", "Status", "Total Amount"],
        ...filteredBatches.map((b) => [b.batchNumber, b.createdAt.slice(0, 10), b.status, String(b.totalAmount)]),
      ];
      downloadCsv(`disbursement-batches-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } else {
      const csv = [
        ["Employee", "ID", "Amount", "Status", "Date"],
        ...filteredPayments.map((p) => [p.employee.name, p.employee.employeeId, String(p.netAmount), p.status, p.createdAt.slice(0, 10)]),
      ];
      downloadCsv(`employee-payout-lines-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    }
  };

  const totalSum = React.useMemo(() => {
    if (tab === "awaiting") return filteredAwaiting.reduce((s, r) => s + r.netTotal, 0);
    if (tab === "batches") return filteredBatches.reduce((s, b) => s + Number(b.totalAmount), 0);
    return filteredPayments.reduce((s, p) => s + Number(p.netAmount), 0);
  }, [tab, filteredAwaiting, filteredBatches, filteredPayments]);

  return (
    <PayrollShell
      activeTab="salaries"
      title="Salary Payments & Payout Operations"
      actions={
        <Button asChild variant="primary">
          <Link href="/payroll/disbursements">Go to disbursements</Link>
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Salary views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "awaiting", label: "Awaiting payout", count: awaitingRuns.length },
                { value: "batches", label: "Disbursement batches", count: batches.length },
                { value: "lines", label: "Employee lines", count: payments.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search payouts by batch, employee, run..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${activeItems.length} records`}
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Salaries"
              foot={
                <TableFoot
                  range={activeItems.length === 0 ? "None" : `${from} to ${to} of ${activeItems.length}`}
                  sums={[{ label: "Total Amount", value: money(totalSum, "USD") }]}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < activeItems.length ? () => setPage((p) => p + 1) : undefined,
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
              {activeItems.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No records match</b>
                  <p className="muted">Approved payroll runs will appear here for payout and bank batching.</p>
                </div>
              ) : tab === "awaiting" ? (
                /* AWAITING RUNS TABLE */
                <table className="table" aria-label="Awaiting payout">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all runs"
                      />
                      <th>Run #</th>
                      <th>Approved date</th>
                      <th className="num">Total Payout</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as PayrollRunRecord[]).map((run) => {
                      const isSelected = selection.isSelected(run.id);
                      return (
                        <tr key={run.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(run.id)}
                            label={`Select Run #${run.runNumber}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              Run #{run.runNumber}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {run.createdAt ? format(new Date(run.createdAt), "dd MMM yyyy HH:mm") : "—"}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(run.netTotal, "USD")}
                          </td>
                          <td>
                            <BkState tone="success">Ready to Disburse</BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Button asChild size="sm">
                              <Link href={`/payroll/disbursements?runId=${run.id}`}>
                                Disburse batch
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : tab === "batches" ? (
                /* BATCHES TABLE */
                <table className="table" aria-label="Disbursement batches">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all batches"
                      />
                      <th>Batch Number</th>
                      <th>Date</th>
                      <th>Payment method</th>
                      <th className="num">Total Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as DisbursementBatchRecord[]).map((batch) => {
                      const isSelected = selection.isSelected(batch.id);
                      return (
                        <tr key={batch.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(batch.id)}
                            label={`Select ${batch.batchNumber}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {batch.batchNumber}
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {format(new Date(batch.createdAt), "dd MMM yyyy")}
                          </td>
                          <td>
                            <span style={{ fontSize: 13 }}>{batch.payoutMethod || "Bank Transfer"}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(Number(batch.totalAmount), "USD")}
                          </td>
                          <td>
                            <BkState
                              tone={
                                batch.status === "COMPLETED"
                                  ? "success"
                                  : batch.status === "PROCESSING"
                                  ? "info"
                                  : "warning"
                              }
                            >
                              {batch.status}
                            </BkState>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* EMPLOYEE LINES TABLE */
                <table className="table" aria-label="Employee payout lines">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all employee lines"
                      />
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th className="num">Net Pay</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedItems as EmployeePayment[]).map((pmt) => {
                      const isSelected = selection.isSelected(pmt.id);
                      return (
                        <tr key={pmt.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(pmt.id)}
                            label={`Select payment for ${pmt.employee.name}`}
                          />
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Person name={pmt.employee.name} />
                              <div>
                                <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                                  {pmt.employee.name}
                                </span>
                                <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                  {pmt.employee.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 13 }}>
                            {format(new Date(pmt.createdAt), "dd MMM yyyy")}
                          </td>
                          <td>
                            <span style={{ fontSize: 13 }}>{pmt.payoutMethod || "Bank Payout"}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {money(Number(pmt.netAmount), "USD")}
                          </td>
                          <td>
                            <BkState
                              tone={
                                pmt.status === "PAID"
                                  ? "success"
                                  : pmt.status === "FAILED"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {pmt.status}
                            </BkState>
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
