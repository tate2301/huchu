"use client";

/**
 * The till's liquor moments and the money that rides on a sale (FLR-10):
 * the age check, the licence hours' banner, a case opened when singles run
 * out (the Liquor board's four panels), bottles back, gift and discount
 * vouchers, "Make it a bundle", and Adjust stock for those who may.
 *
 * The dialogs that the tests drive (`AgeCheckDialog`, `CaseDialog`) take
 * everything by props; the rest read the till's state.
 */

import * as React from "react";
import { useSession } from "next-auth/react";

import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowsCounterClockwise, Check, Gift, Minus, Moon, Package, Plus, Prohibit, Ticket, Trash, X } from "@/lib/icons";
import { emptiesCounted } from "@/lib/retail/deposits";
import type { SnapshotBundle } from "@/lib/retail/pricing/engine";
import { useApproval } from "./approval";
import { bottlesBackCredit } from "./cart-pricing";
import { emptiesRows, spreadEmpties } from "./empties-words";
import { firstName, qty, usd } from "./format";
import { AGE_CHECK_FOOTNOTE, ageCheckSentence, caseFootnote, noSinglesSentence } from "./moments";
import { ErrorLine, TillDialog, TillPopover } from "./parts";
import { useTill } from "./state";
import { giftValue, voucherProblem, VOUCHERS_OFFLINE, type VoucherAnswer } from "./vouchers";

/* ── 1. Age check ────────────────────────────────────────────────────── */

/**
 * "Check ID: 18 and over" (Liquor panel 1): the first age-restricted line of
 * a sale asks. "Remove it" takes the line out; "18 or over" keeps it and the
 * sale records the check with the cashier's name.
 */
export function AgeCheckDialog({
  open,
  eyebrow,
  product,
  category,
  onRemove,
  onConfirm,
}: {
  open: boolean;
  eyebrow: string;
  product: string;
  category: string | null;
  onRemove: () => void;
  onConfirm: () => void;
}) {
  return (
    <TillDialog
      open={open}
      // Closing without an answer is "Remove it": nothing restricted sells unchecked.
      onOpenChange={(next) => {
        if (!next) onRemove();
      }}
      eyebrow={eyebrow}
      title="Check ID: 18 and over"
      description={ageCheckSentence(product, category)}
      foot={
        <div className="side-by-side grow">
          <button type="button" className="btn btn-ink btn-touch" onClick={onRemove}>
            <Prohibit className="ic" />
            Remove it
          </button>
          <button type="button" className="btn btn-primary btn-touch" onClick={onConfirm}>
            <Check className="ic" />
            18 or over
          </button>
        </div>
      }
    >
      <p className="footnote">{AGE_CHECK_FOOTNOTE}</p>
    </TillDialog>
  );
}

/* ── 2. Licence hours ────────────────────────────────────────────────── */

/** The banner over the shelf while alcohol does not sell (Liquor panel 2). No manager can override it. */
export function LicenceBanner({ eyebrow, sentence }: { eyebrow: string; sentence: string }) {
  return (
    <div className="banner banner-licence" role="status">
      <span className="eyebrow">
        <Moon className="ic" /> {eyebrow}
      </span>
      <span>{sentence}</span>
    </div>
  );
}

/* ── 4. Cases and singles ────────────────────────────────────────────── */

/** "No singles left" (Liquor panel 4): "Not now" adds nothing; "Open 1 case" breaks one, then adds the single. */
export function CaseDialog({
  open,
  eyebrow,
  single,
  casesOnHand,
  unitsPerCase,
  busy,
  offline,
  onNotNow,
  onOpen,
}: {
  open: boolean;
  eyebrow: string;
  single: string;
  casesOnHand: number;
  unitsPerCase: number;
  busy: boolean;
  offline: boolean;
  onNotNow: () => void;
  onOpen: () => void;
}) {
  return (
    <TillDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onNotNow();
      }}
      eyebrow={eyebrow}
      title="No singles left"
      description={noSinglesSentence(single, casesOnHand)}
      foot={
        <div className="side-by-side grow">
          <button type="button" className="btn btn-ink btn-touch" onClick={onNotNow}>
            <X className="ic" />
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={busy || offline}
            aria-busy={busy || undefined}
            title={offline ? "Opening a case needs the line: no connection now." : undefined}
            onClick={onOpen}
          >
            <Package className="ic" />
            Open 1 case
          </button>
        </div>
      }
    >
      <p className="footnote">{caseFootnote(unitsPerCase)}</p>
    </TillDialog>
  );
}

/* ── 3. Bottles back ─────────────────────────────────────────────────── */

/**
 * "Bottles back" beside Pay (Liquor panel 3, W-29). On a sale, the empties
 * come off the lines that sell those bottles, up to what each sells. With
 * nothing to sell, "Bottles back · Pay" counts bottles and crates and pays
 * their deposit out of this shift's drawer.
 */
export function BottlesBackButton({ emptyCart }: { emptyCart: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-touch bottles-key" onClick={() => setOpen(true)}>
        <ArrowsCounterClockwise className="ic" />
        {emptyCart ? "Bottles back · Pay" : "Bottles back"}
      </button>
      {open ? emptyCart ? <PayOutDialog onClose={() => setOpen(false)} /> : <OffTheSaleDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Counter({ label, value, most, onChange }: { label: string; value: number; most?: number; onChange: (value: number) => void }) {
  return (
    <div className="row is-split is-inset">
      <span className="grow truncate">{label}</span>
      <span className="qty" role="group" aria-label={label}>
        <button type="button" aria-label={`One fewer, ${label}`} disabled={value === 0} onClick={() => onChange(Math.max(0, value - 1))}>
          <Minus className="ic" />
        </button>
        <span>{value}</span>
        <button type="button" aria-label={`One more, ${label}`} disabled={most !== undefined && value >= most} onClick={() => onChange(value + 1)}>
          <Plus className="ic" />
        </button>
      </span>
    </div>
  );
}

/** 0.10 → "10c", 1.50 → "US$1.50": a deposit as the shelf says it. */
const depositWord = (value: number) => (value < 1 ? `${Math.round(value * 100)}c` : usd(value));

function OffTheSaleDialog({ onClose }: { onClose: () => void }) {
  const { cart, lineStopped, setEmptiesBack } = useTill();
  const lines = cart.filter((item) => item.returnable && item.depositAmount && !lineStopped(item));
  const rows = emptiesRows(lines.map((item) => ({ ...item, catalogItemId: item.id })));
  const [draft, setDraft] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, row.lines.reduce((sum, item) => sum + emptiesCounted(item), 0)])),
  );
  const perLine = new Map(rows.flatMap((row) => spreadEmpties(row, draft[row.key] ?? 0)));
  const counted = lines.map((item) => ({ ...item, emptiesBack: perLine.get(item.id) ?? 0 }));
  const total = counted.reduce((sum, item) => sum + emptiesCounted(item), 0);
  const credit = bottlesBackCredit(counted);
  return (
    <TillDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Bottles back"
      description={rows.length ? "Off this sale, up to what it sells of each." : "Ring up the bottles first. Empties come off a line that sells them, up to its count."}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!rows.length}
            onClick={() => {
              for (const item of lines) setEmptiesBack(item.id, perLine.get(item.id) ?? 0);
              onClose();
            }}
          >
            <Check className="ic" />
            {total ? `Take ${total} back, ${usd(-credit)}` : "None back"}
          </button>
        </>
      }
    >
      {rows.length ? (
        <div className="list is-framed">
          {rows.map((row) => (
            <Counter
              key={row.key}
              label={`${row.label} ${depositWord(row.each)}`}
              value={draft[row.key] ?? 0}
              most={row.most}
              onChange={(value) => setDraft({ ...draft, [row.key]: Math.min(row.most, value) })}
            />
          ))}
        </div>
      ) : null}
    </TillDialog>
  );
}

function PayOutDialog({ onClose }: { onClose: () => void }) {
  const { payBottlesBack, payBottlesBackPending, isOffline } = useTill();
  const [bottles, setBottles] = React.useState(0);
  const [crates, setCrates] = React.useState(0);
  const [problem, setProblem] = React.useState<string | null>(null);
  const pay = () => {
    setProblem(null);
    payBottlesBack({ bottles, crates }).then(onClose, (error: unknown) => setProblem(getApiErrorMessage(error)));
  };
  return (
    <TillDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Bottles back · Pay"
      description="Their deposit comes out of this drawer. Count what they brought."
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={(!bottles && !crates) || payBottlesBackPending || isOffline}
            aria-busy={payBottlesBackPending || undefined}
            title={isOffline ? "Paying out needs the line: no connection now." : undefined}
            onClick={pay}
          >
            <Check className="ic" />
            Pay
          </button>
        </>
      }
    >
      <div className="list is-framed">
        <Counter label="Bottles" value={bottles} onChange={setBottles} />
        <Counter label="Crates" value={crates} onChange={setCrates} />
      </div>
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
  );
}

/* ── Gift vouchers sold, discount vouchers (PRD-10) ──────────────────── */

/** "Sell a gift voucher" on the sale: its value, for the sale's customer if one is on it. Outside the goods total. */
export function GiftVoucherPopover() {
  const { addVoucherSold, selectedCustomer, isOffline } = useTill();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  const value = giftValue(typed);
  return (
    <TillPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTyped("");
      }}
      label="Sell a gift voucher"
      align="start"
      side="top"
      trigger={
        <button type="button" className="btn btn-quiet is-hang" disabled={isOffline} title={isOffline ? VOUCHERS_OFFLINE : undefined}>
          <Gift className="ic" />
          Sell a gift voucher
        </button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!value) return;
          addVoucherSold({
            value,
            ...(selectedCustomer ? { customerId: selectedCustomer.id, customerName: selectedCustomer.name } : {}),
          });
          setOpen(false);
        }}
      >
        <div className="pop-body">
          <div className="field">
            <label htmlFor={id}>Value</label>
            <label className="input-wrap input-lg">
              <span className="muted">US$</span>
              <input
                id={id}
                className="num text-left"
                inputMode="decimal"
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value.replace(/[^\d.]/g, ""))}
              />
            </label>
            <span className="help">
              {selectedCustomer ? `For ${selectedCustomer.name}. ` : "Put a customer on the sale first to make it theirs. "}
              The receipt prints its code and secret.
            </span>
          </div>
        </div>
        <div className="pop-foot">
          <span className="kbd push-left">Esc</span>
          <button type="submit" className="btn btn-ink" disabled={!value}>
            <Plus className="ic" />
            {value ? `Add a US$${value} voucher` : "Add"}
          </button>
        </div>
      </form>
    </TillPopover>
  );
}

/** The gift vouchers bought in this sale, as lines under the goods. */
export function VoucherSoldLines() {
  const { vouchersSold, removeVoucherSold } = useTill();
  return (
    <>
      {vouchersSold.map((voucher) => (
        <div key={voucher.key} className="line">
          <span className="text-stack">
            <span className="truncate">Gift voucher</span>
            <span className="meta truncate">{voucher.customerName ? `For ${voucher.customerName}` : "Its code prints on the receipt"}</span>
          </span>
          <button type="button" className="btn btn-quiet btn-icon" aria-label="Take the gift voucher off" onClick={() => removeVoucherSold(voucher.key)}>
            <Trash className="ic" />
          </button>
          <span className="num">{usd(Number(voucher.value))}</span>
        </div>
      ))}
    </>
  );
}

/** Ask the server about a voucher's code and secret: the one check for a tender and a discount voucher. */
export function useVoucherCheck(basket: number) {
  const [answer, setAnswer] = React.useState<VoucherAnswer | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const check = async (code: string, secret: string) => {
    setBusy(true);
    setFailed(null);
    try {
      const params = new URLSearchParams({ code: code.trim(), secret: secret.trim(), basket: basket.toFixed(2) });
      const result = await fetchJson<VoucherAnswer>(`/api/v2/retail/pos/vouchers/check?${params.toString()}`);
      setAnswer(result);
      return result;
    } catch (error) {
      setFailed(getApiErrorMessage(error));
      setAnswer(null);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { answer, busy, failed, check, reset: () => setAnswer(null) };
}

/** A discount voucher on the sale: code and secret, checked online, then taken off after the promotions. */
export function DiscountVoucherField() {
  const { discountVoucher, setDiscountVoucher, isOffline, goodsTotal } = useTill();
  const [code, setCode] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const voucher = useVoucherCheck(goodsTotal);
  const ids = React.useId();
  const problem = voucher.failed ?? voucherProblem(voucher.answer, "DISCOUNT");
  if (discountVoucher) {
    return (
      <div className="row is-split">
        <span className="grow">
          <Ticket className="ic" /> {discountVoucher.label}
        </span>
        <button type="button" className="btn btn-quiet" onClick={() => setDiscountVoucher(null)}>
          <X className="ic" />
          Take it off
        </button>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={`${ids}c`}>Discount voucher</label>
      {isOffline ? (
        <p className="help is-flush">{VOUCHERS_OFFLINE}</p>
      ) : (
        <div className="voucher-check">
          <input id={`${ids}c`} className="input num text-left" placeholder="DV-0007" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          <input aria-label="Secret" className="input num text-left" placeholder="Secret" value={secret} onChange={(event) => setSecret(event.target.value.toUpperCase())} />
          <button
            type="button"
            className="btn"
            disabled={!code.trim() || !secret.trim() || voucher.busy}
            aria-busy={voucher.busy || undefined}
            onClick={() =>
              void voucher.check(code, secret).then((answer) => {
                const data = answer?.data;
                if (!answer || voucherProblem(answer, "DISCOUNT") || !data) return;
                const off = data.percentOff !== null ? `${data.percentOff}% off` : `${usd(data.amountOff ?? 0)} off`;
                setDiscountVoucher({ code: data.code, secret: secret.trim(), percentOff: data.percentOff, amountOff: data.amountOff, label: `${data.code}, ${off}` });
              })
            }
          >
            Check
          </button>
        </div>
      )}
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </div>
  );
}

/* ── Bundles (PRD-08) ────────────────────────────────────────────────── */

/** "Make it a bundle: Braai pack for US$11.00": every item of a fixed set is on the sale; one tap regroups them. */
export function BundleOffers() {
  const { bundleOffers, makeBundleOf, bundleProblem, ringOnTheirOwn } = useTill();
  return (
    <>
      {bundleProblem ? (
        <div className="banner is-in-list wrap">
          <Package className="ic" />
          <span>{bundleProblem}</span>
          <div className="end">
            <button type="button" className="btn btn-ink" onClick={ringOnTheirOwn}>
              Ring them on their own
            </button>
          </div>
        </div>
      ) : null}
      {bundleOffers.map((bundle) => (
        <div key={bundle.id} className="banner is-in-list wrap">
          <Package className="ic" />
          <span>
            Make it a bundle: {bundle.name} for {usd(bundle.price)}
          </span>
          <div className="end">
            <button type="button" className="btn btn-ink" onClick={() => makeBundleOf(bundle)}>
              <Check className="ic" />
              Make it a bundle
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

/** A bundle's button under its category: one tap rings its components as one. */
export function BundleTile({ bundle, onAdd }: { bundle: SnapshotBundle; onAdd: (bundle: SnapshotBundle) => void }) {
  const recipe = bundle.items.map((item) => `${qty(item.quantity)} × ${item.name}`).join(", ");
  return (
    <button type="button" className="tile is-bundle" aria-label={`${bundle.name}, ${usd(bundle.price)}, ${recipe}`} onClick={() => onAdd(bundle)}>
      <span className="pic" aria-hidden="true">
        <Package className="ic" />
      </span>
      <span className="p">{usd(bundle.price)}</span>
      <span className="n">{bundle.name}</span>
      <span className="s truncate">{recipe}</span>
    </button>
  );
}

/* ── Adjust stock from the till (STK-04, W-23) ───────────────────────── */

const WHYS = [
  { value: "BROKEN", label: "Broken or spoilt" },
  { value: "OWN_USE", label: "Own use or gift" },
  { value: "FOUND", label: "Found more" },
  { value: "CORRECTION", label: "Fix a mistake" },
] as const;
type Why = (typeof WHYS)[number]["value"];

/**
 * "Adjust stock", from a product's long press: why, how many, what happened.
 * Drawn only for someone holding `retail.adjustments:create`; over the
 * shop's limit a manager approves with their PIN in the till's dialog.
 */
export function AdjustStockDialog({ product, onClose }: { product: { id: string; name: string; onHand: number }; onClose: () => void }) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const { siteId, approvers, isOffline } = useTill();
  const approval = useApproval({ approvers: approvers.adjust });
  const [why, setWhy] = React.useState<Why>("BROKEN");
  const [n, setN] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ids = React.useId();

  const save = () => {
    if (!n.trim()) return setProblem("Say how many.");
    if (!note.trim()) return setProblem("Say what happened.");
    setProblem(null);
    setBusy(true);
    approval
      .run((approver) =>
        fetchJson<{ message?: string }>("/api/v2/retail/stock/adjustments", {
          method: "POST",
          body: JSON.stringify({ productId: product.id, siteId, why, n: n.trim(), note: note.trim(), ...(approver ? { approver } : {}) }),
        }),
      )
      .then((done) => {
        if (!done) return;
        toast({ title: done.message ?? "Saved.", variant: "success" });
        onClose();
      })
      .catch((error: unknown) => setProblem(getApiErrorMessage(error)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <TillDialog
        open
        onOpenChange={(next) => !next && onClose()}
        large
        compact
        title="Adjust stock"
        meta={`${product.name} · ${qty(product.onHand)} on hand · ${firstName(session?.user?.name)}`}
        foot={
          <>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || isOffline} aria-busy={busy || undefined} onClick={save}>
              <Check className="ic" />
              Save
            </button>
          </>
        }
      >
        <div className="choice-chips" role="radiogroup" aria-label="Why">
          {WHYS.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={option.value === why} className="btn btn-lg" onClick={() => setWhy(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`${ids}n`}>{why === "CORRECTION" ? "On hand now" : "How many"}</label>
          <input id={`${ids}n`} className="input input-lg num text-left" inputMode="decimal" value={n} onChange={(event) => setN(event.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div className="field">
          <label htmlFor={`${ids}w`}>What happened</label>
          <textarea id={`${ids}w`} className="input" rows={2} placeholder="What happened, and for own use who took it" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        {problem ? <ErrorLine>{problem}</ErrorLine> : <p className="help">Every adjustment shows in Activity.</p>}
      </TillDialog>
      {approval.dialog}
    </>
  );
}
