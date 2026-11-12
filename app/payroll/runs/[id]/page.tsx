"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Amt, BkApproval, BkBlock, BkFacts, BkPage, BkRecord, BkRecordHead, None, St, Worksheet, type BkStep, type BkTone, type WsColumn } from "@/components/books/ui";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { Button, ButtonGroup, Field, Input, Person } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { PreCloseChecklistDrawer } from "@/components/payroll/runs/pre-close-checklist-drawer";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";

type Run = {
  id: string;
  runNumber: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
  notes: string | null;
  grossTotal: number | string;
  deductionsTotal: number | string;
  netTotal: number | string;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  period: { id: string; periodKey: string; startDate?: string; endDate?: string };
  createdBy: { name: string } | null;
  submittedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  lineItems: Array<{
    id: string;
    employee: { id: string; employeeId: string; name: string };
    baseAmount: number | string;
    variableAmount: number | string;
    allowancesTotal: number | string;
    deductionsTotal: number | string;
    netAmount: number | string;
  }>;
};

const STATUS: Record<Run["status"], { label: string; tone: BkTone }> = {
  DRAFT: { label: "Draft", tone: "draft" },
  SUBMITTED: { label: "Waiting for approval", tone: "warn" },
  APPROVED: { label: "Approved", tone: "info" },
  POSTED: { label: "Posted", tone: "done" },
  REJECTED: { label: "Rejected", tone: "bad" },
};

const num = (value: number | string) => Number(value);
const day = (value: string | null | undefined) => (value ? shortDay(value.slice(0, 10)) : undefined);

/** One payroll run: its totals, every employee's line, who approved it, and what comes next. */
export default function RunRecordPage() {
  const id = useParams<{ id: string }>()?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkOpen, setCheckOpen] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");

  const query = useQuery({ queryKey: ["payroll-run", id], queryFn: () => fetchJson<Run>(`/api/payroll/runs/${id}`), enabled: Boolean(id) });
  const run = query.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["payroll-run", id] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
  };
  const failed = (error: unknown) => toast({ title: getApiErrorMessage(error), variant: "destructive" });

  const submit = useMutation({
    mutationFn: () => fetchJson(`/api/payroll/runs/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Run submitted" });
      setCheckOpen(false);
      refresh();
    },
    onError: failed,
  });
  const approve = useMutation({
    mutationFn: () => fetchJson(`/api/payroll/runs/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Run approved" });
      refresh();
    },
    onError: failed,
  });
  const reject = useMutation({
    mutationFn: () => fetchJson(`/api/payroll/runs/${id}/reject`, { method: "POST", body: JSON.stringify({ note: rejectNote.trim() }) }),
    onSuccess: () => {
      toast({ title: "Run rejected" });
      setRejecting(false);
      setRejectNote("");
      refresh();
    },
    onError: failed,
  });

  if (query.isLoading) return <BooksLoading />;
  if (query.error || !run) return <BooksError what="The run" error={query.error} onRetry={() => void query.refetch()} />;

  const status = STATUS[run.status];
  const steps: BkStep[] = [
    { role: "Prepared", name: run.createdBy?.name ?? "System", note: day(run.createdAt), state: "done" },
    run.submittedAt
      ? { role: "Submitted", name: run.submittedBy?.name ?? "Someone", note: day(run.submittedAt), state: "done" }
      : { role: "Submits", name: "Not submitted", state: "now" },
    run.approvedAt
      ? { role: "Approved", name: run.approvedBy?.name ?? "Someone", note: day(run.approvedAt), state: "done" }
      : { role: "Approves", name: run.status === "REJECTED" ? "Rejected" : "Waiting", state: run.status === "REJECTED" ? "refused" : run.submittedAt ? "now" : "todo" },
  ];

  const primary =
    run.status === "DRAFT" || run.status === "REJECTED"
      ? { label: "Check and submit", icon: "check" as const, onClick: () => setCheckOpen(true) }
      : run.status === "SUBMITTED"
      ? { label: "Approve", icon: "check" as const, onClick: () => approve.mutate() }
      : undefined;

  const columns: Array<WsColumn<Run["lineItems"][number]>> = [
    { key: "name", head: "Employee", cell: (l) => <Person name={l.employee.name} sub={l.employee.employeeId}><Link href={`/people/${l.employee.id}`}>{l.employee.name}</Link></Person> },
    { key: "base", head: "Basic", right: true, cell: (l) => <Amt value={num(l.baseAmount)} currency={null} /> },
    { key: "extra", head: "Extras", right: true, cell: (l) => (num(l.variableAmount) + num(l.allowancesTotal) > 0 ? <Amt value={num(l.variableAmount) + num(l.allowancesTotal)} currency={null} /> : <None />) },
    { key: "ded", head: "Deductions", right: true, cell: (l) => <Amt value={-num(l.deductionsTotal)} currency={null} /> },
    { key: "net", head: "Net", right: true, cell: (l) => <Amt value={num(l.netAmount)} currency="USD" /> },
    {
      key: "slip",
      head: "",
      right: true,
      cell: (l) => (
        <a href={`/api/payroll/payslips/${l.id}/pdf`} target="_blank" rel="noopener noreferrer">
          Payslip
        </a>
      ),
    },
  ];

  return (
    <>
      <PageChrome title={`Run ${run.runNumber}, ${run.period.periodKey}`} backHref="/payroll/runs" backLabel="Payroll" primary={primary} />

      <BkPage screen="run-record" scroll={false}>
        <BkRecord
          side={
            <>
              <BkBlock icon="done" title="Approval">
                <BkApproval steps={steps} />
                {run.status === "SUBMITTED" ? (
                  rejecting ? (
                    <Field label="Why is it rejected?">
                      <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
                      <ButtonGroup>
                        <Button variant="quiet" onClick={() => setRejecting(false)}>
                          Cancel
                        </Button>
                        <Button variant="danger" busy={reject.isPending} disabled={!rejectNote.trim()} onClick={() => reject.mutate()}>
                          Reject
                        </Button>
                      </ButtonGroup>
                    </Field>
                  ) : (
                    <Button variant="quiet" onClick={() => setRejecting(true)}>
                      Reject the run
                    </Button>
                  )
                ) : null}
                {run.status === "APPROVED" ? (
                  <Link href={`/payroll/disbursements?runId=${run.id}`}>Pay it out</Link>
                ) : null}
              </BkBlock>
              {run.notes ? (
                <BkBlock icon="docs" title="Notes">
                  <p>{run.notes}</p>
                </BkBlock>
              ) : null}
            </>
          }
        >
          <BkRecordHead
            title={`Run ${run.runNumber}`}
            meta={[
              <St key="s" tone={status.tone}>
                {status.label}
              </St>,
              run.period.periodKey,
              run.period.startDate && run.period.endDate ? `${day(run.period.startDate)} to ${day(run.period.endDate)}` : "",
            ]}
            big={<Amt value={num(run.netTotal)} currency="USD" />}
            bigNote="net pay"
          />

          <BkFacts
            items={[
              { label: "Employees", value: run.lineItems.length, mono: true },
              { label: "Gross", value: <Amt value={num(run.grossTotal)} currency="USD" /> },
              { label: "Deductions", value: <Amt value={-num(run.deductionsTotal)} currency="USD" /> },
              { label: "Prepared by", value: run.createdBy?.name ?? "System" },
            ]}
          />

          <Worksheet label="pay lines" rows={run.lineItems} rowKey={(l) => l.id} columns={columns} empty="No lines in this run." />
        </BkRecord>
      </BkPage>

      <PreCloseChecklistDrawer runId={run.id} open={checkOpen} onOpenChange={setCheckOpen} onSubmit={() => submit.mutate()} isSubmitting={submit.isPending} />
    </>
  );
}
