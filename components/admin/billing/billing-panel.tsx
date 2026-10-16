"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionStatus } from "@prisma/client";
import { Button, Input } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { SUBSCRIPTION_STATUS_EFFECT, SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUSES } from "@/lib/admin/billing-words";
import { formatMoney } from "@/lib/admin/format";
import { MANUAL_METHODS } from "@/lib/admin/payment-words";
import type { ActionResult } from "@/lib/admin/workspace-context";
import { CalendarPlus, ChevronDown, Flag, Receipt } from "@/lib/icons";

export type BillingActions = {
  extendTrial: (days: number) => Promise<ActionResult>;
  setStatus: (status: SubscriptionStatus, reason: string) => Promise<ActionResult>;
  recordPayment: (input: { method: string; reference: string; amount: number; periodMonths: number }) => Promise<ActionResult>;
};

const selectClass = "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-sm";

export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 t-body">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-[var(--text-muted)]">{term}</dt>
          <dd className="text-[var(--text-body)]">{value ?? <span className="text-[var(--text-faint)]">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A workspace's subscription and the three changes billing makes to it: a
 * longer trial, a status set by hand, and money recorded as paid. Every
 * dialog names the workspace, and every change lands in its audit log.
 */
export function SubscriptionPanel({
  workspaceName,
  status,
  facts,
  canManage,
  actions,
}: {
  workspaceName: string;
  status: SubscriptionStatus | null;
  facts: Array<[string, ReactNode]>;
  canManage: boolean;
  actions: BillingActions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, startBusy] = useTransition();
  const [dialog, setDialog] = useState<"status" | "payment" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<SubscriptionStatus | null>(null);
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState({ method: "EcoCash", reference: "", amount: "", periodMonths: "1" });

  const run = (work: () => Promise<ActionResult>, done?: () => void) =>
    startBusy(async () => {
      setError(null);
      const outcome = await work();
      if (!outcome.ok) {
        if (dialog) setError(outcome.error);
        else toast({ title: outcome.error, variant: "destructive" });
        return;
      }
      toast({ title: outcome.message, variant: "success" });
      done?.();
      router.refresh();
    });

  const close = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
    setNextStatus(null);
    setReason("");
  };

  return (
    <section aria-labelledby="subscription-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="subscription-heading" className="t-section mr-auto text-[var(--ink)]">
          Subscription
        </h2>
        {canManage && status ? (
          <>
            {status === "TRIALING" ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button startIcon={<CalendarPlus />} endIcon={<ChevronDown />} loading={busy && !dialog}>
                    Extend trial
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {[7, 14, 30].map((days) => (
                    <MenuItem key={days} onSelect={() => run(() => actions.extendTrial(days))}>
                      By {days} days
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : null}
            <Button startIcon={<Flag />} onClick={() => setDialog("status")}>
              Set status
            </Button>
            <Button variant="primary" startIcon={<Receipt />} onClick={() => setDialog("payment")}>
              Record a payment
            </Button>
          </>
        ) : null}
      </div>
      <Facts rows={facts} />

      <Dialog open={dialog === "status"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set {workspaceName}&apos;s subscription status</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              For what was agreed outside the product. Payments set it on their own; this is for the rest.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1">
            <legend className="sr-only">Status</legend>
            {SUBSCRIPTION_STATUSES.map((option) => (
              <label
                key={option}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-1.5 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
              >
                <input
                  type="radio"
                  name="status"
                  checked={(nextStatus ?? status) === option}
                  onChange={() => setNextStatus(option)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--ink)]">{SUBSCRIPTION_STATUS_LABEL[option]}</span>
                  <span className="block text-[13px] text-[var(--text-muted)]">{SUBSCRIPTION_STATUS_EFFECT[option]}</span>
                </span>
                {status === option ? <span className="text-xs text-[var(--text-muted)]">Now</span> : null}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1.5">
            <span className="t-label text-[var(--ink)]">Why</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={300}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            />
            <span className="block text-[13px] text-[var(--text-muted)]">Kept in the workspace&apos;s audit log.</span>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-[var(--bad)]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!nextStatus || nextStatus === status}
              onClick={() => run(() => actions.setStatus(nextStatus!, reason), close)}
            >
              {nextStatus && nextStatus !== status ? `Set to ${SUBSCRIPTION_STATUS_LABEL[nextStatus].toLowerCase()}` : "Choose a status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "payment"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record a payment from {workspaceName}</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              Money that reached us outside the pay page: a transfer they sent proof of, or cash. It extends their subscription
              at once, and each reference counts once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="t-label text-[var(--ink)]">How they paid</span>
              <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className={selectClass}>
                {MANUAL_METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <Input
              label="Reference"
              hint="The transaction number on their proof or the statement"
              value={payment.reference}
              onChange={(event) => setPayment({ ...payment, reference: event.target.value })}
              className="font-mono"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount, US dollars"
                inputMode="decimal"
                value={payment.amount}
                onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
                className="font-mono tabular-nums"
              />
              <label className="block space-y-1.5">
                <span className="t-label text-[var(--ink)]">For</span>
                <select
                  value={payment.periodMonths}
                  onChange={(event) => setPayment({ ...payment, periodMonths: event.target.value })}
                  className={selectClass}
                >
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="12">12 months</option>
                </select>
              </label>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[var(--bad)]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                run(
                  () =>
                    actions.recordPayment({
                      method: payment.method,
                      reference: payment.reference,
                      amount: Number(payment.amount),
                      periodMonths: Number(payment.periodMonths),
                    }),
                  () => {
                    close();
                    setPayment({ method: "EcoCash", reference: "", amount: "", periodMonths: "1" });
                  },
                )
              }
            >
              {Number(payment.amount) > 0 ? `Record ${formatMoney(Number(payment.amount))} as paid` : "Record as paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
