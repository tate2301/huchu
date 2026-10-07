"use client";

/**
 * The sale column's parts. Each change is made where the thing is: a line's
 * price on the line, the customer on the customer, bottles back on their tile
 * (counted against the lines that sell them). Only an approval (a reason, and
 * a manager's PIN when the till rules ask for one) and the ID check stop the
 * till with a dialog.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Check,
  IdentificationCard,
  MagnifyingGlass,
  Minus,
  Package,
  PauseCircle,
  Percent,
  Plus,
  Prohibit,
  Trash,
  UserPlus,
  X,
} from "@/lib/icons";
import { depositsDue, emptiesCounted } from "@/lib/retail/deposits";
import { clockLabel } from "@/lib/retail/licence-hours";
import { LOYALTY_MAX_REDEEM_SHARE, LOYALTY_REDEEM_POINTS_PER_USD } from "@/lib/retail/loyalty-rules";
import { createOfflineRetailCustomer } from "@/lib/retail/offline-runtime";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { discountPinSentence } from "@/lib/retail/till-rule-words";
import { enumLabel } from "@/lib/retail/words";
import { count, firstName, MEASURES, qty, usd, whole } from "./format";
import { Avatar, ErrorLine, TillDialog, TillPopover } from "./parts";
import { discountApprovalReason } from "./sale-rules";
import { lineIsChanged, useTill } from "./state";
import type { Approval, CartItem } from "./types";

/** 0.10 → "10c", 1.50 → "US$1.50": a deposit as the shelf says it. */
const depositWord = (value: number) => (value < 1 ? `${Math.round(value * 100)}c` : usd(value));

/** The lines on the sale that take empties back: returnable bottles that sell now. */
function useReturnables() {
  const { cart, lineStopped } = useTill();
  return cart.filter((item) => item.returnable && item.depositAmount && !lineStopped(item));
}

/**
 * What the empties back take off the sale: each line's deposit before them,
 * less after them. The sale's deposit (`depositTotal`) is already net of it.
 */
export function bottlesBackCredit(lines: readonly CartItem[]) {
  return Number((depositsDue(lines.map((item) => ({ ...item, emptiesBack: 0 }))) - depositsDue(lines)).toFixed(2));
}

const amountOf = (text: string) => {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) ? value : null;
};

function MoneyField({
  id,
  label,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <label className={invalid ? "input-wrap input-lg is-invalid" : "input-wrap input-lg"}>
        <span className="muted">US$</span>
        <input
          id={id}
          className="num text-left"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
    </div>
  );
}

/* ─── A line ─────────────────────────────────────────────────────────── */

export function SaleLine({ item }: { item: CartItem }) {
  const { updateQty, updateLine, removeFromCart, lineStopped, alcohol, canApprove, rules } = useTill();
  const [open, setOpen] = React.useState(false);
  const [price, setPrice] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const ids = React.useId();
  const stopped = lineStopped(item);

  const shelf = item.shelfPrice;
  const priceValue = amountOf(price) ?? item.unitPrice;
  const discountValue = amountOf(discount) ?? 0;
  const ceiling = item.maxDiscountPercent === null ? null : Number(((shelf * item.quantity * item.maxDiscountPercent) / 100).toFixed(2));
  const off = Number(((shelf - priceValue) * item.quantity + discountValue).toFixed(2));
  const overCeiling = ceiling !== null && off > ceiling + 0.004;
  const lineAmount = Math.max(item.unitPrice * item.quantity - item.lineDiscountAmount, 0);
  // The deposit before any empties: the bottles back come off on their own line.
  const bottles = Math.floor(item.quantity);
  const deposit = item.returnable && item.depositAmount ? Number((item.depositAmount * bottles).toFixed(2)) : 0;
  const back = emptiesCounted(item);
  // Sold by weight or length: the line says the rate and keeps three places.
  const unit = item.unit?.trim().toLowerCase();
  const measured = Boolean(unit && MEASURES.has(unit));
  const discounted = item.lineDiscountAmount > 0;
  // This line alone over the cashier's limit: a manager's PIN at Take (the sale as a whole is asked there).
  const managerAtTake =
    !canApprove && rules !== null && discountApprovalReason(rules.maxCashierDiscountPercent, { lines: [item], orderDiscount: 0 }) !== null;

  const meta = stopped
    ? alcohol.sellable
      ? null
      : `Taken off at ${clockLabel(alcohol.stoppedAt)}`
    : [
        measured ? `${unit} at ${usd(item.unitPrice)} a ${unit}` : null,
        discounted ? `${usd(item.lineDiscountAmount)} off${managerAtTake ? ", a manager approves at Take" : ""}` : null,
        Math.abs(item.unitPrice - shelf) > 0.009 ? `at ${usd(item.unitPrice)}, shelf ${usd(shelf)}` : null,
        deposit ? `+ deposit, ${count(bottles, "bottle")}, ${usd(deposit)}${back ? `, ${whole(back)} back` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

  return (
    <div className={`line${stopped ? " is-stopped" : ""}`} aria-current={open ? "true" : undefined}>
      <TillPopover
        arrow
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setPrice(item.unitPrice.toFixed(2));
            setDiscount(item.lineDiscountAmount > 0 ? item.lineDiscountAmount.toFixed(2) : "");
          }
        }}
        label={item.name}
        size="lg"
        trigger={
          <button
            type="button"
            className="text-stack text-left"
            aria-label={`Change ${item.name}`}
          >
            <span className="truncate">{item.name}</span>
            {meta ? <span className={`meta truncate${!stopped && discounted ? " is-off" : ""}`}>{meta}</span> : null}
          </button>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (overCeiling) return;
            updateLine(item.catalogItemId, { unitPrice: priceValue, lineDiscountAmount: discountValue });
            setOpen(false);
          }}
        >
          <div className="pop-body">
            <div className="line-split">
              <b className="strong">{item.name}</b>
              <span className="note nowrap">
                {usd(shelf)} on the shelf
                {item.stock !== undefined ? ` · ${qty(item.stock)} left` : ""}
              </span>
            </div>
            <div className="field-row">
              <MoneyField id={`${ids}p`} label="Price" value={price} onChange={setPrice} />
              <MoneyField
                id={`${ids}d`}
                label="Discount"
                value={discount}
                onChange={setDiscount}
                invalid={overCeiling}
                describedBy={overCeiling ? `${ids}e` : undefined}
                autoFocus
              />
            </div>
            {overCeiling && ceiling !== null ? (
              <span id={`${ids}e`}>
                <ErrorLine>
                  Discounts on this product stop at {item.maxDiscountPercent}%, {usd(ceiling)}. Not even a manager can go
                  past it.
                </ErrorLine>
              </span>
            ) : (
              <span className="help">
                {canApprove || !rules
                  ? "You say why when you take the money."
                  : `${discountPinSentence(rules.maxCashierDiscountPercent)} You say why when you take the money.`}
              </span>
            )}
          </div>
          <div className="pop-foot">
            <button
              type="button"
              className="btn btn-quiet btn-danger push-left"
              onClick={() => {
                removeFromCart(item.catalogItemId);
                setOpen(false);
              }}
            >
              <Trash className="ic" />
              Remove the line
            </button>
            {overCeiling && ceiling !== null ? (
              <button
                type="button"
                className="btn btn-ink"
                onClick={() => {
                  setPrice(shelf.toFixed(2));
                  setDiscount(ceiling.toFixed(2));
                }}
              >
                <Check className="ic" />
                Use {usd(ceiling)}
              </button>
            ) : (
              <button type="submit" className="btn btn-ink">
                <Check className="ic" />
                Save the line
              </button>
            )}
          </div>
        </form>
      </TillPopover>
      <span className="qty" role="group" aria-label={`Quantity of ${item.name}`}>
        <button type="button" aria-label={`One fewer ${item.name}`} onClick={() => updateQty(item.catalogItemId, item.quantity - 1)}>
          <Minus className="ic" />
        </button>
        <span>{measured ? item.quantity.toFixed(3) : qty(item.quantity)}</span>
        <button type="button" aria-label={`One more ${item.name}`} onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}>
          <Plus className="ic" />
        </button>
      </span>
      <span className="num">{stopped ? "—" : usd(lineAmount)}</span>
    </div>
  );
}

/* ─── Bottles back ───────────────────────────────────────────────────── */

/**
 * The empties on this sale, as one line: how many, and what they take off.
 * Each is counted against a line that sells that bottle, so more go on the
 * first line with room at the same deposit and come off the last one counted.
 */
export function BottlesBackLine() {
  const { setEmptiesBack, emptiesBackCount } = useTill();
  const lines = useReturnables();
  if (!emptiesBackCount) return null;
  const values = [...new Set(lines.filter((item) => emptiesCounted(item) > 0).map((item) => item.depositAmount ?? 0))];
  const per = values.length === 1 ? values[0] : null;
  const fewer = [...lines].reverse().find((item) => emptiesCounted(item) > 0);
  const more = per === null ? undefined : lines.find((item) => item.depositAmount === per && emptiesCounted(item) < Math.floor(item.quantity));
  return (
    <div className="line">
      <span className="text-stack">
        <span className="truncate">Bottles back</span>
        <span className="meta truncate is-off">{per !== null ? `${depositWord(per)} a bottle, off this sale` : "Off this sale"}</span>
      </span>
      <span className="qty" role="group" aria-label="Bottles back">
        <button
          type="button"
          aria-label="One fewer bottle back"
          disabled={!fewer}
          onClick={() => fewer && setEmptiesBack(fewer.catalogItemId, emptiesCounted(fewer) - 1)}
        >
          <Minus className="ic" />
        </button>
        <span>{emptiesBackCount}</span>
        <button
          type="button"
          aria-label="One more bottle back"
          disabled={!more}
          onClick={() => more && setEmptiesBack(more.catalogItemId, emptiesCounted(more) + 1)}
        >
          <Plus className="ic" />
        </button>
      </span>
      <span className="num">{usd(-bottlesBackCredit(lines))}</span>
    </div>
  );
}

/** The count of empties, on the Bottles back tile: a row for each returnable line on the sale, never more than it sells. */
export function BottlesBackPopover({ trigger }: { trigger: React.ReactElement }) {
  const { setEmptiesBack } = useTill();
  const lines = useReturnables();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const counted = lines.map((item) => ({ ...item, emptiesBack: draft[item.catalogItemId] ?? 0 }));
  const total = counted.reduce((sum, item) => sum + emptiesCounted(item), 0);
  const credit = bottlesBackCredit(counted);

  return (
    <TillPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(Object.fromEntries(lines.map((item) => [item.catalogItemId, emptiesCounted(item)])));
      }}
      label="Bottles back"
      size="lg"
      trigger={trigger}
    >
      <div className="pop-body">
        <b className="strong">Bottles back</b>
        {lines.length ? (
          <div className="list is-framed">
            {lines.map((item) => {
              const n = draft[item.catalogItemId] ?? 0;
              const most = Math.floor(item.quantity);
              const name = item.name.split(",")[0];
              const each = depositWord(item.depositAmount ?? 0);
              return (
                <div key={item.catalogItemId} className="row is-split is-inset">
                  <span className="grow truncate">
                    {name} <span className="muted">{each}</span>
                  </span>
                  <span className="qty" role="group" aria-label={`Empties back for ${name}`}>
                    <button
                      type="button"
                      aria-label={`One fewer ${name} back`}
                      disabled={n === 0}
                      onClick={() => setDraft({ ...draft, [item.catalogItemId]: Math.max(0, n - 1) })}
                    >
                      <Minus className="ic" />
                    </button>
                    <span>{n}</span>
                    <button
                      type="button"
                      aria-label={`One more ${name} back`}
                      disabled={n >= most}
                      onClick={() => setDraft({ ...draft, [item.catalogItemId]: Math.min(most, n + 1) })}
                    >
                      <Plus className="ic" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="help is-flush">Ring up the bottles first. Empties come off a line that sells them, up to its count.</p>
        )}
      </div>
      <div className="pop-foot">
        <span className="kbd push-left">
          Esc
        </span>
        <button
          type="button"
          className="btn btn-ink"
          onClick={() => {
            for (const item of lines) setEmptiesBack(item.catalogItemId, draft[item.catalogItemId] ?? 0);
            setOpen(false);
          }}
        >
          <Check className="ic" />
          {total ? `Take ${total} back, ${usd(-credit)}` : "None back"}
        </button>
      </div>
    </TillPopover>
  );
}

/* ─── Opening a case where the line is ───────────────────────────────── */

export function CaseBanners() {
  const { cart } = useTill();
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  // Short of singles, and the cases in this branch cover what is missing.
  const short = cart.filter(
    (item) =>
      item.openableCase &&
      item.stock !== undefined &&
      item.quantity > item.stock &&
      item.openableCase.casesOnHand * item.openableCase.unitsPerCase >= item.quantity - Math.max(0, item.stock) &&
      !dismissed.includes(item.catalogItemId),
  );
  return (
    <>
      {short.map((item) => (
        <CaseBanner key={item.catalogItemId} item={item} onDismiss={() => setDismissed((current) => [...current, item.catalogItemId])} />
      ))}
    </>
  );
}

function CaseBanner({ item, onDismiss }: { item: CartItem; onDismiss: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { updateLine } = useTill();
  const caseInfo = item.openableCase!;
  const loose = Math.max(0, item.stock ?? 0);
  const cases = Math.ceil((item.quantity - loose) / caseInfo.unitsPerCase);
  const name = item.name.split(",")[0];
  const open = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { casesOpened: number; singlesAdded: number; singlesOnHand: number; caseName: string } }>("/api/v2/retail/pos/open-case", {
        method: "POST",
        body: JSON.stringify({ productId: item.catalogItemId, wanted: item.quantity }),
      }),
    onSuccess: (result) => {
      updateLine(item.catalogItemId, { stock: result.data.singlesOnHand });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
    },
    onError: (error) => toast({ title: "No case was opened", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  return (
    <div className="banner is-in-list wrap">
      <Package className="ic" />
      {/* A case breaks at the till only once its singles have run out: the loose ones sell first. */}
      {loose ? (
        <span>
          Only {qty(loose)} singles of {name} left. Sell those first; a case opens once they run out.
        </span>
      ) : (
        <span>
          No singles of {name} left, {count(caseInfo.casesOnHand, "case")}. Open {cases === 1 ? "one" : cases} for these {qty(item.quantity)}?
        </span>
      )}
      <div className="end">
        <button type="button" className="btn" onClick={onDismiss}>
          <X className="ic" />
          {loose ? "Got it" : "Not now"}
        </button>
        {loose ? null : (
          <button type="button" className="btn btn-ink" disabled={open.isPending} aria-busy={open.isPending || undefined} onClick={() => open.mutate()}>
            <Check className="ic" />
            Open {count(cases, "case")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── The customer ───────────────────────────────────────────────────── */

export function CustomerPopover() {
  const { toast } = useToast();
  const { tenantKey } = useOfflineRuntime();
  const { customerName, setCustomerName, selectedCustomer, selectCustomer, customerSearchResults, customerSearchLoading } = useTill();
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const query = customerName.trim();
  const showResults = query.length >= 2 && customerSearchResults.length > 0;
  const phoneLike = /^[+\d\s-]{6,}$/.test(query);

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { id: string; name: string; phone: string | null; email: string | null } }>("/api/v2/retail/customers", {
        method: "POST",
        body: JSON.stringify(phoneLike ? { name: `Customer ${query}`, phone: query } : { name: query }),
      }),
    onSuccess: (payload) => {
      selectCustomer({ ...payload.data, loyaltyPoints: 0, loyaltyTier: "BRONZE" });
      setOpen(false);
    },
    onError: async (error) => {
      const message = getApiErrorMessage(error);
      const offline = /network|failed to fetch|load failed/i.test(message) || (typeof navigator !== "undefined" && !navigator.onLine);
      if (offline && tenantKey) {
        const queued = await createOfflineRetailCustomer(tenantKey, {
          name: phoneLike ? `Customer ${query}` : query,
          phone: phoneLike ? query : null,
          email: null,
        });
        selectCustomer({
          id: queued.record.tempId,
          name: String(queued.record.payload.name ?? query),
          phone: (queued.record.payload.phone as string | null | undefined) ?? null,
          email: null,
          loyaltyPoints: 0,
          loyaltyTier: "BRONZE",
        });
        setOpen(false);
        return;
      }
      toast({ title: "That customer was not added", description: message, variant: "destructive" });
    },
  });

  const trigger = selectedCustomer ? (
    <button type="button" className="btn btn-quiet">
      <Avatar name={selectedCustomer.name} size={24} />
      <span className="truncate max-140">
        {selectedCustomer.name}
      </span>
    </button>
  ) : (
    <button type="button" className="btn btn-quiet">
      <UserPlus className="ic" />
      Add customer
    </button>
  );

  return (
    <TillPopover arrow open={open} onOpenChange={setOpen} label={selectedCustomer ? selectedCustomer.name : "Add a customer"} align="end" size="lg" trigger={trigger}>
      {selectedCustomer ? (
        <>
          <div className="pop-body">
            <div className="who-head">
              <Avatar name={selectedCustomer.name} size={40} />
              <div>
                <b className="strong">{selectedCustomer.name}</b>
                <p className="note num text-left">
                  {[selectedCustomer.phone, enumLabel(selectedCustomer.loyaltyTier), `${whole(selectedCustomer.loyaltyPoints)} points`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          </div>
          <div className="pop-foot">
            <button
              type="button"
              className="btn"
              onClick={() => {
                selectCustomer(null);
                setOpen(false);
              }}
            >
              <X className="ic" />
              Take {firstName(selectedCustomer.name)} off the sale
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="pop-body">
            <label className="input-wrap">
              <MagnifyingGlass className="ic" />
              <input
                role="combobox"
                aria-label="Name, phone or email"
                aria-autocomplete="list"
                aria-expanded={showResults}
                aria-controls={showResults ? listId : undefined}
                aria-activedescendant={showResults ? `${listId}-0` : undefined}
                placeholder="Name, phone or email"
                value={customerName}
                autoFocus
                onChange={(event) => setCustomerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customerSearchResults[0]) {
                    event.preventDefault();
                    selectCustomer(customerSearchResults[0]);
                    setOpen(false);
                  }
                }}
              />
            </label>
            {query.length >= 2 ? (
              <div className="menu is-bare">
                {showResults ? (
                  <div id={listId} role="listbox" aria-label="Customers found">
                    {customerSearchResults.map((customer, index) => (
                      <button
                        key={customer.id}
                        id={`${listId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === 0}
                        className="menu-item is-tall"
                        data-active={index === 0 || undefined}
                        onClick={() => {
                          selectCustomer(customer);
                          setOpen(false);
                        }}
                      >
                        <Avatar name={customer.name} />
                        <span className="text-stack text-left">
                          <span className="ink weight-500">{customer.name}</span>
                          <span className="muted num text-left text-12">
                            {[customer.phone, enumLabel(customer.loyaltyTier), `${whole(customer.loyaltyPoints)} points`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {customerSearchLoading && !customerSearchResults.length ? (
                  <p className="note pad-8">
                    Looking
                  </p>
                ) : null}
                {customerSearchResults.length ? <div className="menu-sep" /> : null}
                <button type="button" className="menu-item" disabled={create.isPending} aria-busy={create.isPending || undefined} onClick={() => create.mutate()}>
                  <UserPlus className="ic" />
                  Add {query} as a new customer
                </button>
              </div>
            ) : (
              <p className="help">Type two letters of a name, or the start of a phone number.</p>
            )}
          </div>
          <div className="pop-foot">
            <span className="kbd push-left">
              Esc
            </span>
            {customerSearchResults[0] ? (
              <button
                type="button"
                className="btn btn-ink"
                onClick={() => {
                  selectCustomer(customerSearchResults[0]);
                  setOpen(false);
                }}
              >
                <Check className="ic" />
                Put {firstName(customerSearchResults[0].name)} on the sale
              </button>
            ) : null}
          </div>
        </>
      )}
    </TillPopover>
  );
}

/* ─── Hold ───────────────────────────────────────────────────────────── */

export function HoldPopover() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { cart, shiftHere, customerName, orderDiscountAmount, selectedPromotionId, clearCart, isPosHost } = useTill();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const id = React.useId();

  const hold = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/held-carts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: shiftHere?.id,
          label: label.trim() || undefined,
          cartSnapshot: { items: cart, customerName, orderDiscountAmount, selectedPromotionId },
        }),
      }),
    onSuccess: () => {
      setOpen(false);
      setLabel("");
      clearCart();
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.push(getPosPortalHref("held", isPosHost));
    },
    onError: (error) => toast({ title: "That sale was not held", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <TillPopover
      arrow
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLabel(customerName);
      }}
      label="Hold this sale"
      align="end"
      trigger={
        <button type="button" className="btn btn-quiet is-icon-on-phone" aria-label="Hold">
          <PauseCircle className="ic" />
          <span className="when-wide">Hold</span>
        </button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          hold.mutate();
        }}
      >
        <div className="pop-body">
          <div className="field">
            <label htmlFor={id}>
              Name it <span className="opt">optional</span>
            </label>
            <input id={id} className="input input-lg" value={label} autoFocus onChange={(event) => setLabel(event.target.value)} />
            <span className="help">It waits under Held until this shift closes.</span>
          </div>
        </div>
        <div className="pop-foot">
          <span className="kbd push-left">
            Esc
          </span>
          <button type="submit" className="btn btn-ink" disabled={hold.isPending} aria-busy={hold.isPending || undefined}>
            <PauseCircle className="ic" />
            Hold the sale
            <span className="kbd on-primary">Enter</span>
          </button>
        </div>
      </form>
    </TillPopover>
  );
}

/* ─── Discount, promotion or points ──────────────────────────────────── */

export function DiscountPopover() {
  const {
    promotions,
    selectedPromotionId,
    setSelectedPromotionId,
    orderDiscountAmount,
    setOrderDiscountAmount,
    loyaltyRedemptionPoints,
    setLoyaltyRedemptionPoints,
    selectedCustomer,
    goodsTotal,
  } = useTill();
  const [open, setOpen] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [points, setPoints] = React.useState("");
  const [promotion, setPromotion] = React.useState("");
  const ids = React.useId();

  const pointsValue = Math.max(0, Math.floor(Number(points || "0")));
  const maxPoints = selectedCustomer
    ? Math.min(selectedCustomer.loyaltyPoints, Math.floor(goodsTotal * LOYALTY_MAX_REDEEM_SHARE * LOYALTY_REDEEM_POINTS_PER_USD))
    : 0;
  const tooMany = pointsValue > maxPoints;

  return (
    <TillPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const used = Number(loyaltyRedemptionPoints || "0");
          const rest = Number(orderDiscountAmount || "0") - used / LOYALTY_REDEEM_POINTS_PER_USD;
          setManual(rest > 0.009 ? rest.toFixed(2) : "");
          setPoints(used ? String(used) : "");
          setPromotion(selectedPromotionId);
        }
      }}
      label="Discount on the sale"
      align="start"
      side="top"
      trigger={
        <button type="button" className="btn btn-quiet is-hang">
          <Percent className="ic" />
          Discount, promotion or points
        </button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (tooMany) return;
          const fromPoints = pointsValue / LOYALTY_REDEEM_POINTS_PER_USD;
          const total = (amountOf(manual) ?? 0) + fromPoints;
          setLoyaltyRedemptionPoints(pointsValue ? String(pointsValue) : "");
          setOrderDiscountAmount(total > 0 ? total.toFixed(2) : "");
          setSelectedPromotionId(promotion);
          setOpen(false);
        }}
      >
        <div className="pop-body">
          <MoneyField id={`${ids}m`} label="Off the whole sale" value={manual} onChange={setManual} placeholder="0.00" autoFocus />
          {promotions.length ? (
            <div className="field">
              <label htmlFor={`${ids}p`}>Promotion</label>
              <select id={`${ids}p`} className="select input-lg" value={promotion} onChange={(event) => setPromotion(event.target.value)}>
                <option value="">None</option>
                {promotions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`${ids}l`}>Points</label>
            {selectedCustomer ? (
              <>
                <input
                  id={`${ids}l`}
                  className="input input-lg num text-left"
                  inputMode="numeric"
                  value={points}
                  aria-invalid={tooMany || undefined}
                  aria-describedby={tooMany ? `${ids}le` : undefined}
                  onChange={(event) => setPoints(event.target.value.replace(/\D/g, ""))}
                />
                {tooMany ? (
                  <ErrorLine id={`${ids}le`}>
                    {firstName(selectedCustomer.name)} can pay with {whole(maxPoints)} points at most on this sale.
                  </ErrorLine>
                ) : (
                  <span className="help">
                    {whole(selectedCustomer.loyaltyPoints)} points. 100 points are US$1.00, up to a fifth of the sale.
                  </span>
                )}
              </>
            ) : (
              <p className="help is-flush">
                Add a customer to pay with points: 100 points are US$1.00, up to a fifth of the sale.
              </p>
            )}
          </div>
        </div>
        <div className="pop-foot">
          <span className="kbd push-left">
            Esc
          </span>
          <button type="submit" className="btn btn-ink">
            <Check className="ic" />
            Apply
          </button>
        </div>
      </form>
    </TillPopover>
  );
}

/* ─── The ID check ───────────────────────────────────────────────────── */

export function IdCheckDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { data: session } = useSession();
  const { cart, lineStopped, confirmId, removeAgeRestricted } = useTill();
  const names = cart.filter((item) => item.ageRestricted && !lineStopped(item)).map((item) => item.name.split(",")[0]);
  const listed = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ");
  return (
    <TillDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
      title="Check ID: 18 or over"
      description={`${listed || "These products"} ${names.length === 1 ? "is" : "are"} for people 18 or over. Look at the customer’s ID before you go on.`}
      foot={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              removeAgeRestricted();
              onDone();
            }}
          >
            <Prohibit className="ic" />
            Take the 18+ items off
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              confirmId();
              onDone();
            }}
          >
            <IdentificationCard className="ic" />
            They are 18 or over
          </button>
        </>
      }
    >
      <p className="note">
        Asked once a sale. The answer is kept on the sale with {firstName(session?.user?.name)}’s name.
      </p>
    </TillDialog>
  );
}

/* ─── A manager approves ─────────────────────────────────────────────── */

/**
 * A changed price or a discount, at Take. The person selling says why; when
 * the till rules want a manager (`approvalReason`), or the server says so
 * (409 `needsApprover`, 423 locked), a manager picks their name and types
 * their four-digit PIN here (C-31). The PIN lives in this dialog only: it is
 * cleared each time it opens and after a refusal, and never queued offline.
 */
export function ApproveDialog({
  open,
  onOpenChange,
  amount,
  onApprove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  onApprove: (approval: Approval) => void;
}) {
  const { data: session } = useSession();
  const {
    cart,
    approvers,
    approvalReason,
    updateLine,
    setOrderDiscountAmount,
    loyaltyRedemptionPoints,
    lineDiscountTotal,
    orderDiscountAmount,
    postSalePending,
    saleRefusal,
  } = useTill();
  const [manager, setManager] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [problem, setProblem] = React.useState<{ field: "reason" | "manager" | "pin"; text: string } | null>(null);
  // The server asked for a manager the till did not: kept until the dialog closes.
  const [serverAsked, setServerAsked] = React.useState<string | null>(null);
  const ids = React.useId();
  const chosen = approvers.find((person) => person.userId === manager) ?? approvers[0] ?? null;
  const askedFor = approvalReason ?? serverAsked;
  const managerNeeded = askedFor !== null;

  React.useEffect(() => {
    if (open) {
      setPin("");
      setProblem(null);
    } else {
      setServerAsked(null);
    }
  }, [open]);

  // A refusal from `pos/sales`: ask for a manager, and clear what was wrong.
  React.useEffect(() => {
    if (!saleRefusal || saleRefusal.kind === "refused") return;
    setPin("");
    if (saleRefusal.kind === "needs-approver") {
      if (saleRefusal.field === null) setServerAsked(saleRefusal.message);
      if (saleRefusal.field === "approver") setManager("");
    }
  }, [saleRefusal]);

  // Each refusal shows on the field it is about.
  const refusedField = !saleRefusal
    ? null
    : saleRefusal.kind === "pin-locked"
      ? "pin"
      : saleRefusal.kind === "needs-approver"
        ? saleRefusal.field
        : "reason";
  const refusedOn = (field: "reason" | "approver" | "pin") => (saleRefusal && refusedField === field ? saleRefusal.message : null);
  const pinRefusal = refusedOn("pin");
  const managerRefusal = refusedOn("approver");
  const refusal = refusedOn("reason");

  const changed = cart.filter(lineIsChanged);
  const orderOff = Number(orderDiscountAmount || "0") - Number(loyaltyRedemptionPoints || "0") / LOYALTY_REDEEM_POINTS_PER_USD;
  const what = [
    changed.length === 1
      ? lineDiscountTotal > 0
        ? `${usd(changed[0].lineDiscountAmount)} off ${changed[0].name}`
        : `${changed[0].name} at ${usd(changed[0].unitPrice)}`
      : changed.length
        ? `changes on ${count(changed.length, "line")}`
        : null,
    orderOff > 0.009 ? `${usd(orderOff)} off the whole sale` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const submit = () => {
    if (!reason.trim()) {
      setProblem({ field: "reason", text: "Say why, in a few words. It is kept on the sale." });
      return;
    }
    if (!managerNeeded) {
      setProblem(null);
      onApprove({ reason: reason.trim(), approver: null });
      return;
    }
    if (!chosen) {
      setProblem({ field: "manager", text: "No manager can approve on this till." });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setProblem({ field: "pin", text: `${firstName(chosen.name)} types their four-digit PIN.` });
      return;
    }
    setProblem(null);
    onApprove({ reason: reason.trim(), approver: { userId: chosen.userId, pin } });
  };

  const errorFor = (field: "reason" | "manager" | "pin", refused: string | null) => (problem?.field === field ? problem.text : refused);
  const managerError = errorFor("manager", managerRefusal);
  const pinError = errorFor("pin", pinRefusal);
  const reasonError = errorFor("reason", refusal);

  return (
    <TillDialog
      open={open}
      onOpenChange={onOpenChange}
      title={managerNeeded ? "A manager has to approve this" : "Say why the price changed"}
      description={`${what ? `${what[0].toUpperCase()}${what.slice(1)}` : "A changed price"}, so the sale comes to ${usd(amount)}.${managerNeeded ? ` ${firstName(session?.user?.name)} is asking.` : ""}`}
      foot={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              for (const item of changed) updateLine(item.catalogItemId, { unitPrice: item.shelfPrice, lineDiscountAmount: 0 });
              const points = Number(loyaltyRedemptionPoints || "0") / LOYALTY_REDEEM_POINTS_PER_USD;
              setOrderDiscountAmount(points > 0 ? points.toFixed(2) : "");
              onOpenChange(false);
            }}
          >
            <X className="ic" />
            Take the discount off
          </button>
          <button type="button" className="btn btn-primary" disabled={postSalePending} aria-busy={postSalePending || undefined} onClick={submit}>
            <Check className="ic" />
            {managerNeeded ? `Approve and take ${usd(amount)}` : `Take ${usd(amount)}`}
          </button>
        </>
      }
    >
      {managerNeeded ? (
        <>
          <p className="note">{askedFor}</p>
          <div className="field">
            <label htmlFor={`${ids}m`}>Manager</label>
            <select
              id={`${ids}m`}
              className="select input-lg"
              value={chosen?.userId ?? ""}
              aria-invalid={Boolean(managerError) || undefined}
              aria-describedby={managerError ? `${ids}me` : undefined}
              onChange={(event) => setManager(event.target.value)}
            >
              {approvers.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
            {managerError ? <ErrorLine id={`${ids}me`}>{managerError}</ErrorLine> : null}
          </div>
          <div className="field">
            <label htmlFor={`${ids}p`}>{chosen ? `${firstName(chosen.name)}’s PIN` : "PIN"}</label>
            <input
              id={`${ids}p`}
              className="input input-lg num text-left"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              aria-invalid={Boolean(pinError) || undefined}
              aria-describedby={pinError ? `${ids}pe` : undefined}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            {pinError ? (
              <ErrorLine id={`${ids}pe`}>
                {pinError === pinRefusal && saleRefusal?.kind === "pin-locked"
                  ? `${chosen ? `${firstName(chosen.name)}’s PIN is locked until a new one is sent.` : pinError} Another manager can approve it.`
                  : pinError}
              </ErrorLine>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="field">
        <label htmlFor={`${ids}r`}>Reason</label>
        <input
          id={`${ids}r`}
          className="input input-lg"
          value={reason}
          aria-invalid={Boolean(reasonError) || undefined}
          aria-describedby={reasonError ? `${ids}e` : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {reasonError ? (
          <ErrorLine id={`${ids}e`}>{reasonError}</ErrorLine>
        ) : (
          <span className="help">
            {reason.trim()
              ? `Kept on the sale as “${reason.trim()}${managerNeeded ? ` (approved by ${chosen?.name ?? "the manager"})` : ""}”.`
              : `Kept on the sale${managerNeeded ? ` with ${chosen?.name ?? "the manager"}’s name` : ""}.`}
          </span>
        )}
      </div>
    </TillDialog>
  );
}
