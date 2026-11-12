"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Amt, BkApproval, BkBlock, BkFacts, BkPage, BkRecord, BkRecordHead, None, St, Worksheet, type BkStep, type BkTone, type WsColumn } from "@/components/books/ui";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { Button, Check, Field, Input } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";

type Batch = {
  id: string;
  code: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  totalAmount: number;
  itemCount: number;
  notes: string | null;
  cashCustodian: string | null;
  cashIssuedAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  payrollRun: { id: string; runNumber: number; period: { periodKey: string } } | null;
  createdBy: { name: string } | null;
  submittedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  items: Array<{ id: string; amount: number; employee: { id: string; name: string; employeeId: string } }>;
};

const STATUS: Record<Batch["status"], { label: string; tone: BkTone }> = {
  DRAFT: { label: "Draft", tone: "draft" },
  SUBMITTED: { label: "Waiting for approval", tone: "warn" },
  APPROVED: { label: "Approved", tone: "info" },
  PAID: { label: "Paid", tone: "done" },
  REJECTED: { label: "Rejected", tone: "bad" },
};

const day = (value: string | null) => (value ? shortDay(value.slice(0, 10)) : undefined);

/** One payout batch: its recipients, who approved it, and, once approved, the cash sign-off. */
export default function BatchRecordPage() {
  const id = useParams<{ id: string }>()?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [custodian, setCustodian] = React.useState("");
  const [voucher, setVoucher] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [counted, setCounted] = React.useState(false);

  const query = useQuery({ queryKey: ["disbursement-batch", id], queryFn: () => fetchJson<Batch>(`/api/disbursements/batches/${id}`), enabled: Boolean(id) });
  const batch = query.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["disbursement-batch", id] });
    void queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
  };
  const failed = (error: unknown) => toast({ title: getApiErrorMessage(error), variant: "destructive" });

  const step = useMutation({
    mutationFn: (action: "submit" | "approve") => fetchJson(`/api/disbursements/batches/${id}/${action}`, { method: "POST" }),
    onSuccess: (_, action) => {
      toast({ title: action === "submit" ? "Sent for approval" : "Approved" });
      refresh();
    },
    onError: failed,
  });

  const pay = useMutation({
    mutationFn: () =>
      fetchJson(`/api/disbursements/batches/${id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          cashCustodian: custodian.trim(),
          items: (batch?.items ?? []).map((item) => ({
            id: item.id,
            paidAmount: item.amount,
            receiptReference: voucher.trim() || undefined,
            notes: notes.trim() || undefined,
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Marked paid" });
      refresh();
    },
    onError: failed,
  });

  if (query.isLoading) return <BooksLoading />;
  if (query.error || !batch) return <BooksError what="The batch" error={query.error} onRetry={() => void query.refetch()} />;

  const status = STATUS[batch.status];
  const steps: BkStep[] = [
    { role: "Created", name: batch.createdBy?.name ?? "System", note: day(batch.createdAt), state: "done" },
    batch.submittedAt
      ? { role: "Sent", name: batch.submittedBy?.name ?? "Someone", note: day(batch.submittedAt), state: "done" }
      : { role: "Sends", name: "Not sent yet", state: "now" },
    batch.approvedAt
      ? { role: "Approved", name: batch.approvedBy?.name ?? "Someone", note: day(batch.approvedAt), state: "done" }
      : { role: "Approves", name: batch.status === "REJECTED" ? "Rejected" : "Waiting", state: batch.status === "REJECTED" ? "refused" : batch.submittedAt ? "now" : "todo" },
    batch.status === "PAID"
      ? { role: "Paid", name: batch.cashCustodian ?? "Custodian", note: day(batch.cashIssuedAt), state: "done" }
      : { role: "Pays", name: "Not paid yet", state: batch.status === "APPROVED" ? "now" : "todo" },
  ];

  const primary =
    batch.status === "DRAFT" || batch.status === "REJECTED"
      ? { label: "Send for approval", icon: "send" as const, onClick: () => step.mutate("submit") }
      : batch.status === "SUBMITTED"
      ? { label: "Approve", icon: "check" as const, onClick: () => step.mutate("approve") }
      : undefined;

  const columns: Array<WsColumn<Batch["items"][number]>> = [
    { key: "name", head: "Recipient", cell: (item) => item.employee.name },
    { key: "id", head: "Employee ID", className: "muted mono", cell: (item) => item.employee.employeeId || <None /> },
    { key: "amount", head: "Amount", right: true, cell: (item) => <Amt value={item.amount} currency="USD" /> },
  ];

  return (
    <>
      <PageChrome title={batch.code} backHref="/payroll/disbursements" backLabel="Disbursements" primary={primary} />

      <BkPage screen="batch-record" scroll={false}>
        <BkRecord
          side={
            <BkBlock icon="done" title="Approval">
              <BkApproval steps={steps} />
            </BkBlock>
          }
        >
          <BkRecordHead
            title={batch.code}
            meta={[
              <St key="s" tone={status.tone}>
                {status.label}
              </St>,
              batch.payrollRun ? `Run ${batch.payrollRun.runNumber}, ${batch.payrollRun.period.periodKey}` : "No run",
              day(batch.createdAt) ?? "",
            ]}
            big={<Amt value={batch.totalAmount} currency="USD" />}
            bigNote={`${batch.itemCount} ${batch.itemCount === 1 ? "recipient" : "recipients"}`}
          />

          <BkFacts
            items={[
              { label: "Created by", value: batch.createdBy?.name ?? "System" },
              { label: "Custodian", value: batch.cashCustodian ?? <None /> },
              { label: "Paid", value: day(batch.cashIssuedAt) ?? <None />, mono: true },
              { label: "Notes", value: batch.notes ?? <None /> },
            ]}
          />

          <Worksheet label="recipients" rows={batch.items} rowKey={(item) => item.id} columns={columns} empty="No recipients." />

          {batch.status === "APPROVED" ? (
            <BkBlock icon="signature" title="Sign off the cash payout">
              <Field label="Cash custodian" htmlFor="custodian">
                <Input id="custodian" value={custodian} onChange={(e) => setCustodian(e.target.value)} />
              </Field>
              <Field label="Handover voucher" htmlFor="voucher" optional>
                <Input id="voucher" value={voucher} onChange={(e) => setVoucher(e.target.value)} />
              </Field>
              <Field label="Notes" htmlFor="signoff-notes" optional>
                <Input id="signoff-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Check checked={counted} onCheckedChange={setCounted} label={`The ${money(batch.totalAmount, "USD")} was counted with the custodian and paid out.`} />
              <Button variant="primary" icon="check" busy={pay.isPending} disabled={!custodian.trim() || !counted} onClick={() => pay.mutate()}>
                Mark paid
              </Button>
            </BkBlock>
          ) : null}
        </BkRecord>
      </BkPage>
    </>
  );
}
