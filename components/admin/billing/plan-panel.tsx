"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { Switch } from "@/components/workspace/switch";
import { formatMoney } from "@/lib/admin/format";
import { MANUAL_METHODS } from "@/lib/admin/payment-words";
import type { ActionResult } from "@/lib/admin/workspace-context";
import { CalendarPlus, ChevronDown, Coins, Receipt } from "@/lib/icons";

export type PlanActions = {
  extendTrial: (days: number) => Promise<ActionResult>;
  changePlan: (tierCode: string) => Promise<ActionResult>;
  turnAddOn: (bundleCode: string, on: boolean) => Promise<ActionResult>;
  recordPayment: (input: { method: string; reference: string; amount: number; periodMonths: number }) => Promise<ActionResult>;
};

type AddOn = { code: string; name: string; description: string; monthlyPrice: number; state: "Included" | "On" | "Off" };

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
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

function AddOnList({
  addOns,
  canManage,
  busy,
  onTurn,
}: {
  addOns: AddOn[];
  canManage: boolean;
  busy: boolean;
  onTurn: (code: string, on: boolean) => void;
}) {
  if (addOns.length === 0) return <p className="t-body-sm text-[var(--text-muted)]">None.</p>;
  return (
    <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
      {addOns.map((addOn) => (
        <li key={addOn.code} className="flex min-h-12 items-center gap-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--ink)]">{addOn.name}</p>
            <p className="truncate text-[13px] text-[var(--text-muted)]">{addOn.description}</p>
          </div>
          <span className="whitespace-nowrap text-sm text-[var(--text-muted)]">
            {addOn.state === "Included" ? (
              "In the plan"
            ) : (
              <>
                <span className="font-mono tabular-nums">{formatMoney(addOn.monthlyPrice)}</span> a month
              </>
            )}
          </span>
          {addOn.state === "Included" || !canManage ? (
            <Badge tone={addOn.state === "Off" ? "neutral" : "success"}>{addOn.state}</Badge>
          ) : (
            <Switch
              checked={addOn.state === "On"}
              disabled={busy}
              aria-label={`${addOn.name}, ${addOn.state === "On" ? "on" : "off"}`}
              onCheckedChange={(on) => onTurn(addOn.code, on)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A workspace's plan, the things it pays for, and the three changes billing
 * makes to them. Every dialog names the workspace, and every change lands in
 * its audit log.
 */
export function PlanPanel({
  workspaceName,
  plan,
  facts,
  onTrial,
  tiers,
  addOns,
  canManage,
  actions,
}: {
  workspaceName: string;
  plan: { code: string; name: string } | null;
  facts: Array<[string, ReactNode]>;
  onTrial: boolean;
  tiers: Array<{ code: string; name: string; monthlyPrice: number }>;
  addOns: AddOn[];
  canManage: boolean;
  actions: PlanActions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, startBusy] = useTransition();
  const [dialog, setDialog] = useState<"plan" | "payment" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
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

  // What the workspace has first; what it could have, folded away.
  const inUse = addOns.filter((addOn) => addOn.state !== "Off");
  const available = addOns.filter((addOn) => addOn.state === "Off");

  const close = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
    setTier(null);
  };

  return (
    <section aria-label="Plan" className="space-y-5">
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          <Facts rows={facts} />
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {onTrial ? (
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
            <Button startIcon={<Coins />} onClick={() => setDialog("plan")}>
              Change plan
            </Button>
            <Button variant="primary" startIcon={<Receipt />} onClick={() => setDialog("payment")}>
              Record a payment
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="t-section text-[var(--ink)]">Add-ons</h2>
        <AddOnList addOns={inUse} canManage={canManage} busy={busy} onTurn={(code, on) => run(() => actions.turnAddOn(code, on))} />
        {available.length > 0 ? (
          <details className="group">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">
              <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
              More add-ons <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{available.length}</span>
            </summary>
            <AddOnList addOns={available} canManage={canManage} busy={busy} onTurn={(code, on) => run(() => actions.turnAddOn(code, on))} />
          </details>
        ) : null}
      </div>

      <Dialog open={dialog === "plan"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {workspaceName}&apos;s plan</DialogTitle>
            <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
              The plan&apos;s features apply at once. The price is recalculated now and charged from the next payment.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1" aria-label="Plan">
            {tiers.map((option) => (
              <label
                key={option.code}
                className="flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
              >
                <input type="radio" name="tier" checked={(tier ?? plan?.code) === option.code} onChange={() => setTier(option.code)} />
                <span className="flex-1 text-sm">{option.name}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{formatMoney(option.monthlyPrice)} a month</span>
                {plan?.code === option.code ? <span className="text-xs text-[var(--text-muted)]">Now</span> : null}
              </label>
            ))}
          </fieldset>
          {error ? <p role="alert" className="text-sm text-[var(--bad)]">{error}</p> : null}
          <DialogFooter>
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!tier || tier === plan?.code}
              onClick={() => run(() => actions.changePlan(tier!), close)}
            >
              {tier && tier !== plan?.code ? `Move to ${tiers.find((option) => option.code === tier)?.name}` : "Choose a plan"}
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
              <select
                value={payment.method}
                onChange={(event) => setPayment({ ...payment, method: event.target.value })}
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-sm"
              >
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
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-sm"
                >
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="12">12 months</option>
                </select>
              </label>
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--bad)]">{error}</p> : null}
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
