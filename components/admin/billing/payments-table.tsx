"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListMeta,
  MobileListSubtitle,
  MobileListTitle,
} from "@corelithzw/react";

import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { PAYMENT_STATE, paymentMethod } from "@/lib/admin/payment-words";
import { formatMoney, formatWhen } from "@/lib/admin/format";
import type { ActionResult } from "@/lib/admin/workspace-context";
import { Buildings, Check, Clock, Coins, DotsThree, Flag, Payments, Receipt, X } from "@/lib/icons";

export type PaymentRow = {
  id: string;
  provider: string;
  providerReference: string;
  amount: string;
  status: string;
  periodMonths: number;
  failureReason: string | null;
  createdAt: Date;
  paidAt: Date | null;
  company: { slug: string; name: string };
  subscription: { plan: { name: string } } | null;
};

export type SettlePayment = (paymentId: string, verdict: "PAID" | "FAILED", reason: string) => Promise<ActionResult>;

const open = (row: PaymentRow) => row.status === "PENDING" || row.status === "INITIATED";

function forWhat(row: PaymentRow) {
  const months = `${row.periodMonths} ${row.periodMonths === 1 ? "month" : "months"}`;
  return row.subscription ? `${row.subscription.plan.name}, ${months}` : months;
}

/**
 * Payments, from the gateways and recorded by hand. A payment nobody heard
 * back about carries the one menu on its row: an operator who has checked the
 * statement says whether the money arrived.
 */
export function PaymentsTable({
  rows,
  withWorkspace,
  settle,
  emptyTitle,
}: {
  rows: PaymentRow[];
  withWorkspace: boolean;
  /** Absent when this operator's role cannot settle payments. */
  settle?: SettlePayment;
  emptyTitle: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<{ row: PaymentRow; verdict: "PAID" | "FAILED" } | null>(null);

  const menu = (row: PaymentRow) =>
    settle && open(row) ? (
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Settle ${row.providerReference}`}>
            <DotsThree weight="bold" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Check />} onSelect={() => setPending({ row, verdict: "PAID" })}>
            Confirm as paid…
          </MenuItem>
          <MenuItem danger icon={<X />} onSelect={() => setPending({ row, verdict: "FAILED" })}>
            Mark as failed…
          </MenuItem>
        </MenuContent>
      </Menu>
    ) : null;

  const columns: RecordTableColumn<PaymentRow>[] = [
    {
      id: "payment",
      label: "Payment",
      icon: Receipt,
      cell: (row) => <RecordTableName title={paymentMethod(row.provider)} subtitle={row.providerReference} />,
    },
    ...(withWorkspace
      ? [
          {
            id: "workspace",
            label: "Workspace",
            icon: Buildings,
            width: "13rem",
            cell: (row: PaymentRow) => <RecordCell kind="relation" value={row.company.name} href={`/admin/w/${row.company.slug}/billing`} />,
          },
        ]
      : []),
    { id: "for", label: "For", icon: Coins, width: "11rem", cell: (row) => <RecordCell value={forWhat(row)} /> },
    {
      id: "state",
      label: "State",
      icon: Flag,
      width: "12rem",
      cell: (row) => {
        const state = PAYMENT_STATE[row.status] ?? { label: row.status, tone: "neutral" as const };
        return <Badge tone={state.tone}>{state.label}</Badge>;
      },
    },
    { id: "when", label: "When", icon: Clock, width: "9rem", cell: (row) => <RecordCell kind="date" value={formatWhen(row.createdAt)} /> },
    {
      id: "amount",
      label: "Amount",
      icon: Payments,
      width: "8rem",
      align: "end",
      cell: (row) => <RecordCell kind="money" value={formatMoney(row.amount)} />,
    },
    ...(settle ? [{ id: "menu", label: "", width: "3rem", align: "end" as const, cell: menu }] : []),
  ];

  const row = pending?.row;
  return (
    <>
      <RecordTable
        rows={rows}
        columns={columns}
        emptyTitle={emptyTitle}
        mobile={
          <MobileList>
            {rows.map((payment) => {
              const state = PAYMENT_STATE[payment.status] ?? { label: payment.status, tone: "neutral" as const };
              return (
                <MobileListItem key={payment.id}>
                  <MobileListContent>
                    <MobileListTitle>
                      {withWorkspace ? payment.company.name : paymentMethod(payment.provider)} · {formatMoney(payment.amount)}
                    </MobileListTitle>
                    <MobileListSubtitle>
                      {[paymentMethod(payment.provider), payment.providerReference, formatWhen(payment.createdAt)].join(" · ")}
                    </MobileListSubtitle>
                  </MobileListContent>
                  <MobileListMeta>
                    <span className="flex items-center gap-1">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      {menu(payment)}
                    </span>
                  </MobileListMeta>
                </MobileListItem>
              );
            })}
          </MobileList>
        }
      />
      <ConfirmDialog
        open={pending?.verdict === "PAID"}
        onOpenChange={(next) => !next && setPending(null)}
        ask={{
          title: `Confirm ${row ? formatMoney(row.amount) : ""} from ${row?.company.name} as paid?`,
          body: `Only once the money shows on the ${row ? paymentMethod(row.provider) : ""} statement under ${row?.providerReference}. ${row?.company.name}'s subscription is extended by ${row?.periodMonths} ${row?.periodMonths === 1 ? "month" : "months"}.`,
          keep: "Not yet",
          go: "Confirm as paid",
          fill: "action",
        }}
        onConfirm={async () => {
          const outcome = await settle!(row!.id, "PAID", "");
          if (!outcome.ok) throw new Error(outcome.error);
          toast({ title: outcome.message, variant: "success" });
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={pending?.verdict === "FAILED"}
        onOpenChange={(next) => !next && setPending(null)}
        ask={{
          title: `Mark ${row?.providerReference} from ${row?.company.name} as failed?`,
          body: "Nothing is extended. The customer can pay again.",
          keep: "Keep it open",
          go: "Mark as failed",
          fill: "bad",
          field: { key: "reason", label: "Why", placeholder: "Not on the statement after 48 hours", min: 3, max: 300, needed: "Say why it failed." },
        }}
        onConfirm={async (reason) => {
          const outcome = await settle!(row!.id, "FAILED", reason ?? "");
          if (!outcome.ok) throw new Error(outcome.error);
          toast({ title: outcome.message, variant: "success" });
          router.refresh();
        }}
      />
    </>
  );
}

