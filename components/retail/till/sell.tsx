"use client";

/**
 * The till: search and the shelf on the left, the sale on the right, and one
 * button that carries the amount. Before the shift is open the screen asks for
 * the float; a shift of the person's open on another till is refused there
 * ("Close your shift on {till} first."), and so is anyone else's open here.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Barcode,
  CaretLeft,
  CaretRight,
  HandCoins,
  IdentificationCard,
  MagnifyingGlass,
  Moon,
  Package,
  ShoppingCart,
  UserSwitch,
  WifiSlash,
  X,
} from "@/lib/icons";
import { clockLabel, harareClock } from "@/lib/retail/licence-hours";
import { LOYALTY_REDEEM_POINTS_PER_USD } from "@/lib/retail/loyalty-rules";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { enumLabel } from "@/lib/retail/words";
import { count, firstName, hhmm, pairedWhen, usd } from "./format";
import { Avatar, Empty, ErrorLine, GateSide, Keypad, Segmented, typeAmount, useKeypadKeys, useWindowKeys, type KeypadKey } from "./parts";
import { PayTray, payWays, TenderMark, type PayWay } from "./pay-tray";
import {
  ApproveDialog,
  BottlesBackLine,
  bottlesBackCredit,
  BottlesBackPopover,
  CaseBanners,
  CustomerPopover,
  DiscountPopover,
  HoldPopover,
  IdCheckDialog,
  SaleLine,
} from "./sale-parts";
import { DOORS, PersonMenu } from "./shell";
import { useSignOut } from "./sign-out";
import { useTill } from "./state";
import { BottlesBackTile, ProductTile } from "./tile";
import type { Approval, PaymentRow, PosCatalogItem } from "./types";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Soft drinks, ice and snacks": the first word capitalised, the rest as they fall. */
function groupList(groups: string[]): string {
  const words = groups.map((group, index) => (index ? enumLabel(group).toLowerCase() : enumLabel(group)));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : (words[0] ?? "");
}

/** Whether the line is up, and since when it has been down. */
export function useConnection() {
  const [online, setOnline] = React.useState(true);
  const [since, setSince] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const update = () => {
      const now = navigator.onLine;
      setOnline(now);
      setSince((current) => (now ? null : (current ?? new Date())));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return { online, since };
}

export function SellScreen() {
  const { shiftHere, shiftLoading, context } = useTill();

  if (shiftLoading) {
    return (
      <div className="bench" aria-busy="true">
        <main className="main">
          <div className="bar">
            <span className="skeleton is-short" />
          </div>
        </main>
        <aside className="bench-side" aria-label="This sale" />
      </div>
    );
  }
  if (!context) return <ContextMissing />;
  if (!shiftHere) return <OpenShiftGate />;
  return <Workbench />;
}

function ContextMissing() {
  return (
    <div className="main is-grow">
      <Empty icon={WifiSlash} title="The till cannot reach the shop">
        Check the connection, then reload. Sales already taken are kept on this till.
      </Empty>
    </div>
  );
}

/* ─── 3. Open the shift ───────────────────────────────────────────────── */

function OpenShiftGate() {
  const { data: session } = useSession();
  const { context } = useTill();
  const { requestSignOut } = useSignOut();
  const queryClient = useQueryClient();
  const [float, setFloat] = React.useState("");
  const value = Number(float || "0");
  const open = useMutation({
    mutationFn: () => fetchJson("/api/v2/retail/pos/shifts", { method: "POST", body: JSON.stringify({ openingFloat: value }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] }),
  });
  const onKey = (key: KeypadKey) => setFloat((current) => typeAmount(current, key));
  useKeypadKeys(onKey);
  useWindowKeys((event) => {
    if (event.key === "Enter" && !open.isPending) {
      event.preventDefault();
      open.mutate();
    }
  });

  return (
    <div className="gate is-over">
      <div className="gate-form">
        <div>
          <h1 className="text-display">Open the shift</h1>
          <p className="under">
            {session?.user?.name ?? "You"} on {context?.till.name}
            {context?.nextShiftNo ? (
              <>
                , shift <span className="num">{context.nextShiftNo}</span>
              </>
            ) : null}
            . Count the float into the drawer.
          </p>
        </div>
        <div className="tender">
          <span className="l">In the drawer</span>
          <span className="tender-figure">{usd(value)}</span>
        </div>
        <Keypad onKey={onKey} left="dot" disabled={open.isPending} />
        {open.isError ? <ErrorLine large>{getApiErrorMessage(open.error)}</ErrorLine> : null}
        <button type="button" className="btn btn-primary btn-touch btn-block" aria-busy={open.isPending || undefined} onClick={() => open.mutate()}>
          <CaretRight className="ic" />
          Open shift with {usd(value)}
        </button>
        <button
          type="button"
          className="btn btn-quiet self-start"
          onClick={() => requestSignOut()}
        >
          <UserSwitch className="ic" />
          Someone else
        </button>
      </div>
      <GateSide
        lede={context ? `${context.till.name} at ${context.site.name}.` : ""}
        quiet={context ? `Paired ${pairedWhen(context.device.pairedAt)} by ${context.device.pairedBy}.` : ""}
        step={3}
        till={context?.till.name}
      />
    </div>
  );
}

/* ─── The workbench ───────────────────────────────────────────────────── */

function Workbench() {
  const till = useTill();
  const {
    cart,
    addToCart,
    features,
    idChecked,
    needsIdCheck,
    needsReason,
    approvalReason,
    discountCeiling,
    offlineStop,
    lineStopped,
    amountDue,
    postSale,
    saleRefusal,
    resetSaleRefusal,
    lastCompletedSale,
    lastSavedSale,
    dismissCompletedSale,
    resetPayments,
    tenders,
    zig,
  } = till;
  const searchRef = React.useRef<HTMLInputElement>(null);
  const ways = React.useMemo(() => payWays(tenders, zig), [tenders, zig]);
  const [wayKey, setWayKey] = React.useState<string | null>(null);
  const way = ways.find((entry) => entry.key === wayKey) ?? ways[0];
  const [trayOpen, setTrayOpen] = React.useState(false);
  const [idCheck, setIdCheck] = React.useState(false);
  const [approve, setApprove] = React.useState(false);
  // On a phone the sale is its own screen, opened from the row under the shelf.
  const [phoneSale, setPhoneSale] = React.useState(false);
  // Take was pressed before the ID check: the tray opens once the check is answered.
  const [pendingTake, setPendingTake] = React.useState(false);
  const selling = cart.filter((item) => !lineStopped(item)).length;

  const add = (item: PosCatalogItem, typedPrice?: number) => {
    const firstAdult = Boolean(features?.ageCheck) && item.ageRestricted && !idChecked && !cart.some((line) => line.ageRestricted);
    addToCart(item, typedPrice);
    if (firstAdult) setIdCheck(true);
  };

  const openTray = () => {
    // Nothing to sell, or the column says why not yet: a discount past its ceiling, or offline too long.
    if (!selling || discountCeiling || offlineStop) return;
    if (needsIdCheck) {
      setPendingTake(true);
      setIdCheck(true);
      return;
    }
    resetSaleRefusal();
    setTrayOpen(true);
  };

  // The tray's payments wait here while the reason, or a manager, is asked for.
  const rowsRef = React.useRef<PaymentRow[]>([]);
  const take = (rows: PaymentRow[]) => {
    rowsRef.current = rows;
    if (needsReason || approvalReason) {
      resetSaleRefusal();
      setApprove(true);
    } else postSale(rows, null);
  };

  const approveAndTake = (approval: Approval) => postSale(rowsRef.current, approval);

  // Read after the answer has rendered, so a confirmed ID (or the 18+ lines taken off) is what it sees.
  React.useEffect(() => {
    if (!pendingTake || idCheck) return;
    setPendingTake(false);
    // Closed without an answer: Take waits to be pressed again.
    if (!needsIdCheck) openTray();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once each time the check is answered
  }, [pendingTake, idCheck]);

  // The approval closes once the sale goes through.
  React.useEffect(() => {
    if (lastCompletedSale || lastSavedSale) setApprove(false);
  }, [lastCompletedSale, lastSavedSale]);

  // The server wants a manager the till did not ask for: the approval opens with its sentence.
  React.useEffect(() => {
    if (saleRefusal && saleRefusal.kind !== "refused") setApprove(true);
  }, [saleRefusal]);

  const next = () => {
    dismissCompletedSale();
    setTrayOpen(false);
    resetPayments();
    setWayKey(null);
    setPhoneSale(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  // `/` finds a product; Enter takes the money; both from anywhere but a field.
  useWindowKeys((event) => {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if (typing || trayOpen || idCheck || approve) return;
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === "Enter" && target?.tagName !== "BUTTON") {
      event.preventDefault();
      openTray();
    }
  });

  return (
    <div className={`bench${phoneSale ? " is-sale" : ""}`}>
      <Shelf searchRef={searchRef} onAdd={add} onShowSale={() => setPhoneSale(true)} onTake={openTray} />
      <aside className="bench-side" aria-label="This sale">
        <SaleColumn ways={ways} way={way} onWay={setWayKey} onTake={openTray} onBack={() => setPhoneSale(false)} />
        {trayOpen ? <PayTray key={way.key} way={way} ways={ways} onClose={() => setTrayOpen(false)} onTake={take} onNext={next} /> : null}
      </aside>
      <IdCheckDialog open={idCheck} onDone={() => setIdCheck(false)} />
      <ApproveDialog open={approve} onOpenChange={setApprove} amount={amountDue} onApprove={approveAndTake} />
    </div>
  );
}

/* ─── The shelf ───────────────────────────────────────────────────────── */

function Shelf({
  searchRef,
  onAdd,
  onShowSale,
  onTake,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (item: PosCatalogItem, typedPrice?: number) => void;
  onShowSale: () => void;
  onTake: () => void;
}) {
  // The open-price product whose amount is being asked for. Enter in the search asks for it as well.
  const [pricing, setPricing] = React.useState<{ id: string; fromSearch: boolean } | null>(null);
  const { data: session } = useSession();
  const {
    context,
    search,
    setSearch,
    categories,
    selectedCategory,
    setSelectedCategory,
    catalogItems,
    catalogLoading,
    catalogError,
    alcohol,
    features,
    pendingOfflineSales,
    emptiesBackCount,
    offlineStop,
    isPosHost,
    cart,
    lineStopped,
    amountDue,
    selectedCustomer,
  } = useTill();
  const { online, since } = useConnection();
  // A tablet's keyboard would cover the shelf: the search takes focus only where there is a pointer.
  const [pointer] = React.useState(() => typeof window === "undefined" || !window.matchMedia("(hover: none)").matches);
  const name = session?.user?.name ?? "You";
  const selling = cart.filter((item) => !lineStopped(item)).length;
  const empty = !selling;
  // The groups that are not all 18+ still sell while alcohol is stopped.
  const stillSelling = groupList(categories.filter((category) => !category.allAgeRestricted).map((category) => category.name));
  const stoppedUntil = alcohol.sellable ? undefined : alcohol.startsAt;
  const depositsOn = Boolean(features?.emptiesAndDeposits);
  const showBottles = depositsOn && !search.trim();
  // The licence's weekday is Harare's, whatever the device's clock says.
  const today = WEEKDAY[harareClock(new Date()).weekday];

  return (
    <main className="main">
      <div className="bar">
        <h1>{context?.till.name}</h1>
        <span className="note when-wide">
          {context?.site.name}
        </span>
        <div className="end">
          {pendingOfflineSales ? (
            <Link className="btn btn-quiet" href={getPosPortalHref("offline", isPosHost)}>
              <WifiSlash className="ic" />
              {pendingOfflineSales} waiting to send
            </Link>
          ) : online ? (
            <span className="status status-success note">
              Up to date
            </span>
          ) : null}
          <span className="when-phone">
            <PersonMenu
              doors={DOORS.filter((entry) => !entry.phone)}
              trigger={
                <button type="button" className="btn btn-icon" aria-label={`${name}, open the menu`}>
                  <Avatar name={name} image={session?.user?.image} />
                </button>
              }
            />
          </span>
        </div>
      </div>
      {!online ? (
        <div className="banner banner-warning">
          <WifiSlash className="ic" />
          <span>
            <b className="weight-500">No connection{since ? ` since ${hhmm(since)}` : ""}.</b>{" "}
            {/* Once the offline window has closed, the shell's banner says selling has stopped. */}
            {offlineStop
              ? null
              : "Cash sales are saved on this till and sent when it is back. Card, EcoCash and InnBucks still need their reference."}
          </span>
        </div>
      ) : null}
      {!alcohol.sellable ? (
        <div className="banner">
          <Moon className="ic" />
          <span>
            <b className="weight-500">Alcohol stopped at {clockLabel(alcohol.stoppedAt)}</b>, the licence hours for a {today}.{" "}
            {stillSelling ? `${stillSelling} still sell.` : "Everything else still sells."}
            {alcohol.startsAt !== null ? ` It starts again at ${clockLabel(alcohol.startsAt)}.` : ""}
          </span>
        </div>
      ) : null}
      <div className="tools">
        <label className="input-wrap input-lg grow">
          <MagnifyingGlass className="ic" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Scan or search products"
            placeholder="Scan a barcode or type a product"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={pointer}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = catalogItems[0];
                if (search.trim() && first?.openPrice) setPricing({ id: first.id, fromSearch: true });
                else if (search.trim() && first) {
                  onAdd(first);
                  setSearch("");
                }
              }
              if (event.key === "Escape") setSearch("");
            }}
          />
          <span className="kbd">/</span>
        </label>
      </div>
      {categories.length ? (
        <div className="tools is-seg-row">
          <Segmented
            label="Product groups"
            value={selectedCategory ?? ""}
            options={[{ value: "", label: "Most sold" }, ...categories.map((category) => ({ value: category.name, label: enumLabel(category.name) }))]}
            onChange={(next) => setSelectedCategory(next || null)}
          />
        </div>
      ) : null}
      {catalogLoading ? (
        <div className="tile-grid" aria-busy="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} className="skeleton is-tile" />
          ))}
        </div>
      ) : catalogError && !catalogItems.length ? (
        <Empty icon={WifiSlash} title="The shelf did not load">
          {getApiErrorMessage(catalogError)}
        </Empty>
      ) : !catalogItems.length && search.trim() ? (
        <Empty
          icon={Barcode}
          title={`No product called “${search.trim()}”`}
          action={
            <button type="button" className="btn" onClick={() => setSearch("")}>
              <X className="ic" />
              Clear the search
            </button>
          }
        >
          Check the spelling or scan the barcode. Products are added in the back office.
        </Empty>
      ) : !catalogItems.length ? (
        <Empty icon={Package} title="Nothing on the shelf here">
          Products with stock at {context?.site.name ?? "this shop"} show here. They are added in the back office.
        </Empty>
      ) : (
        <div className="tile-grid">
          {catalogItems.map((item) => (
            <ProductTile
              key={item.id}
              item={item}
              stoppedUntil={stoppedUntil}
              depositsOn={depositsOn}
              onAdd={(added, typedPrice) => {
                onAdd(added, typedPrice);
                // Asked for from the search: the search clears, as it does for anything Enter adds.
                if (pricing?.fromSearch) {
                  setSearch("");
                  // After the popover hands focus back to its tile (its own timeout, set as it closes).
                  window.setTimeout(() => window.setTimeout(() => searchRef.current?.focus(), 0), 0);
                }
              }}
              pricing={pricing?.id === item.id}
              onPricing={(open) => setPricing(open ? { id: item.id, fromSearch: false } : null)}
            />
          ))}
          {showBottles ? <BottlesBackPopover trigger={<BottlesBackTile count={emptiesBackCount} />} /> : null}
        </div>
      )}
      <div className="phone-sale">
        <button type="button" className="btn btn-touch btn-block" disabled={empty} onClick={onShowSale}>
          <ShoppingCart className="ic" />
          <span className="grow text-left">
            {count(selling, "item")}
            {selectedCustomer ? `, ${selectedCustomer.name}` : ""}
          </span>
          <span className="num ink">{usd(amountDue)}</span>
        </button>
        <button type="button" className="btn btn-primary btn-touch btn-block" disabled={empty} onClick={onTake}>
          <HandCoins className="ic" />
          Take {usd(amountDue)}
        </button>
      </div>
    </main>
  );
}

/* ─── The sale ────────────────────────────────────────────────────────── */

function SaleColumn({
  ways,
  way,
  onWay,
  onTake,
  onBack,
}: {
  ways: PayWay[];
  way: PayWay;
  onWay: (key: string) => void;
  onTake: () => void;
  onBack: () => void;
}) {
  const { data: session } = useSession();
  const {
    cart,
    beforeDiscounts,
    vatIncluded,
    lineDiscountTotal,
    discountAmount,
    depositTotal,
    taxAmount,
    amountDue,
    needsReason,
    approvalReason,
    discountCeiling,
    offlineStop,
    idChecked,
    lineStopped,
    orderDiscountAmount,
    loyaltyRedemptionPoints,
  } = useTill();
  const orderOff = Math.max(discountAmount - lineDiscountTotal, 0);
  // Lines stopped by the licence hours do not sell, so they are not counted.
  const sellingLines = cart.filter((item) => !lineStopped(item));
  const selling = sellingLines.length;
  const empty = !selling;
  // The deposit as the lines charge it, and what the empties back take off: together the sale's deposit.
  const bottlesBack = bottlesBackCredit(sellingLines);
  const deposits = Number((depositTotal + bottlesBack).toFixed(2));
  // A manager approves an amount off; a changed price is approved as a change.
  const offToApprove =
    lineDiscountTotal + Math.max(Number(orderDiscountAmount || "0") - Number(loyaltyRedemptionPoints || "0") / LOYALTY_REDEEM_POINTS_PER_USD, 0);
  const priceChanged = cart.some((item) => Math.abs(item.unitPrice - item.shelfPrice) > 0.009);
  const approvalLine = approvalReason
    ? !priceChanged && offToApprove > 0.009
      ? `A manager approves the ${usd(offToApprove)} off when you take the money.`
      : "A manager approves the change when you take the money."
    : needsReason
      ? "You say why the price changed when you take the money."
      : null;

  return (
    <>
      <div className="bar">
        <button type="button" className="btn btn-quiet when-phone" onClick={onBack}>
          <CaretLeft className="ic" />
          Products
        </button>
        <h1>This sale</h1>
        <span className="note when-wide">
          {selling ? count(selling, "item") : ""}
        </span>
        <div className="end">
          {cart.length ? <HoldPopover /> : null}
          <CustomerPopover />
        </div>
      </div>
      {!cart.length ? (
        <div className="list is-empty">
          <div className="empty is-compact">
            <ShoppingCart className="glyph" />
            <h2>Scan the first product</h2>
            <p>Or tap it below the search. The sale starts with it.</p>
          </div>
        </div>
      ) : (
        <div className="list">
          {cart.map((item) => (
            <SaleLine key={item.catalogItemId} item={item} />
          ))}
          <BottlesBackLine />
          <CaseBanners />
          {idChecked ? (
            <div className="banner is-in-list">
              <IdentificationCard className="ic" />
              <span>
                ID checked by {firstName(session?.user?.name)}: 18 or over
              </span>
            </div>
          ) : null}
        </div>
      )}
      <div className="totals has-pin">
        {!empty ? (
          <>
            <div className="l">
              <span>Before discounts</span>
              <span>{usd(beforeDiscounts)}</span>
            </div>
            {lineDiscountTotal > 0.004 ? (
              <div className="l">
                <span>Line discount</span>
                <span className="off-figure">{usd(-lineDiscountTotal)}</span>
              </div>
            ) : null}
            {orderOff > 0.004 ? (
              <div className="l">
                <span>Off the sale</span>
                <span className="off-figure">{usd(-orderOff)}</span>
              </div>
            ) : null}
            {deposits > 0.004 ? (
              <div className="l">
                <span>Deposits</span>
                <span>{usd(deposits)}</span>
              </div>
            ) : null}
            {bottlesBack > 0.004 ? (
              <div className="l">
                <span>Bottles back</span>
                <span className="off-figure">{usd(-bottlesBack)}</span>
              </div>
            ) : null}
            <div className="l">
              <span>{vatIncluded ? "VAT where it applies, included" : "VAT where it applies, added"}</span>
              <span>{usd(taxAmount)}</span>
            </div>
          </>
        ) : null}
        <div className="l total">
          <span>Total</span>
          <span className="figure">{usd(amountDue)}</span>
        </div>
        {cart.length ? <DiscountPopover /> : null}
        {!empty ? (
          <div
            role="radiogroup"
            aria-label="How they are paying"
            className="pay-ways"
            onKeyDown={(event) => {
              // A radio group moves with the arrows, and choosing is moving.
              const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const at = ways.findIndex((entry) => entry.key === way.key);
              const next = ways[(at + step + ways.length) % ways.length].key;
              onWay(next);
              event.currentTarget.querySelector<HTMLButtonElement>(`[data-way="${next}"]`)?.focus();
            }}
          >
            {ways.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="pay"
                role="radio"
                data-way={entry.key}
                aria-checked={way.key === entry.key}
                tabIndex={way.key === entry.key ? 0 : -1}
                onClick={() => onWay(entry.key)}
              >
                <TenderMark tender={entry.choices.length === 1 ? entry.choices[0].tender : entry.key} />
                <span>
                  {entry.label} {entry.meta ? <span className="meta">{entry.meta}</span> : null}
                </span>
                <span className="radio" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="pin-bottom">
          <button
            type="button"
            className="btn btn-primary btn-touch btn-block"
            disabled={empty || Boolean(discountCeiling) || Boolean(offlineStop)}
            onClick={onTake}
          >
            <HandCoins className="ic" />
            Take {usd(amountDue)}
            {!empty && !discountCeiling && !offlineStop ? <span className="kbd on-primary">Enter</span> : null}
          </button>
        </div>
        {empty ? null : discountCeiling ? (
          <ErrorLine>{discountCeiling} Change the line, then take the money.</ErrorLine>
        ) : offlineStop ? (
          <p className="help is-centred">{offlineStop}</p>
        ) : approvalLine ? (
          <p className="help is-centred">{approvalLine}</p>
        ) : null}
      </div>
    </>
  );
}
