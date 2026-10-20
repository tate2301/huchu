"use client";

/**
 * The till: search and the shelf on the left, the sale on the right, and one
 * button that carries the amount. Before the shift is open the screen asks for
 * the float; a shift of the person's open on another till is refused there
 * ("Close your shift on {till} first."), and so is anyone else's open here.
 */

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";

import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Barcode,
  CaretLeft,
  DotsThree,
  HandCoins,
  IdentificationCard,
  MagnifyingGlass,
  Archive,
  Package,
  ShoppingCart,
  Trash,
  Tray,
  WifiSlash,
  X,
} from "@/lib/icons";
import { enumLabel } from "@/lib/retail/words";
import { percentWords, PRICE_UP_SENTENCE } from "@/lib/retail/till-rule-words";
import { count, firstName, usd } from "./format";
import { KeySheet } from "./keys";
import { RollingFigure } from "./motion";
import { Empty, ErrorLine, LoadFailed, Segmented, TillPopover, useWindowKeys } from "./parts";
import { PayTray, payWays } from "./pay-tray";
import { OpenShiftScreen } from "./shift";
import { useApproval } from "./approval";
import { LaybyStartDialog } from "./layby";
import { bottlesBackCredit } from "./cart-pricing";
import {
  AdjustStockDialog,
  AgeCheckDialog,
  BottlesBackButton,
  BundleOffers,
  BundleTile,
  CaseDialog,
  GiftVoucherPopover,
  LicenceBanner,
  VoucherSoldLines,
} from "./floor-parts";
import { asksForId, caseMoment, licenceEyebrow, licenceSentence } from "./moments";
import { CustomerPopover, DiscountPopover, HoldPopover, ReasonDialog, SaleLine, useDropSale } from "./sale-parts";
import { saleChangeWords } from "./sale-words";
import { parseScan } from "./scan-match";
import { cue } from "./sound";
import { useTill } from "./state";
import { ProductTile, QuickRow } from "./tile";
import type { SnapshotBundle } from "@/lib/retail/pricing/engine";
import type { PaymentRow, PosCatalogItem } from "./types";

/** The product as the shelf holds it after a case was opened. */
const withStock = (item: PosCatalogItem, onHand: number): PosCatalogItem =>
  item.inventoryItem ? { ...item, inventoryItem: { ...item.inventoryItem, currentStock: onHand } } : item;

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
  if (!shiftHere) return <OpenShiftScreen />;
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


/* ─── The workbench ───────────────────────────────────────────────────── */

function Workbench() {
  const till = useTill();
  const { data: session } = useSession();
  const { toast } = useToast();
  const {
    cart,
    addToCart,
    addBundle,
    openCase,
    removeFromCart,
    removeAgeRestricted,
    confirmId,
    alcohol,
    context,
    isOffline,
    bundleProblem,
    features,
    idChecked,
    needsIdCheck,
    needsReason,
    discountCeiling,
    offlineStop,
    lineStopped,
    amountDue,
    postSale,
    resetSaleRefusal,
    rules,
    approvers,
    lastCompletedSale,
    lastSavedSale,
    dismissCompletedSale,
    resetPayments,
    tenders,
    zig,
    updateQty,
  } = till;
  const searchRef = React.useRef<HTMLInputElement>(null);
  const ecocash = till.context?.ecocash ?? null;
  const ways = React.useMemo(() => payWays(tenders, zig, ecocash), [tenders, zig, ecocash]);
  const [wayKey, setWayKey] = React.useState<string | null>(null);
  const way = ways.find((entry) => entry.key === wayKey) ?? ways[0];
  const [trayOpen, setTrayOpen] = React.useState(false);
  /* The age check (Liquor panel 1): the lines it is about, and what it says. */
  const [ageAsk, setAgeAsk] = React.useState<{ lineIds: string[] | null; product: string; category: string | null } | null>(null);
  const idCheck = ageAsk !== null;
  /* No singles left (Liquor panel 4): the single whose case is asked about. */
  const [caseAsk, setCaseAsk] = React.useState<PosCatalogItem | null>(null);
  const [caseBusy, setCaseBusy] = React.useState(false);
  const eyebrow = [context?.till.name, session?.user?.name].filter(Boolean).join(" · ");
  const [approve, setApprove] = React.useState(false);
  // A discount over the till rules' cap: the server's 409 opens the approval (FLR-09).
  const approval = useApproval({
    approvers: approvers.sell,
    reason: (server) => (server === PRICE_UP_SENTENCE || !rules ? server : `Discount over ${percentWords(rules.maxCashierDiscountPercent)}`),
  });
  // On a phone the sale is its own screen, opened from the row under the shelf.
  const [phoneSale, setPhoneSale] = React.useState(false);
  // Take was pressed before the ID check: the tray opens once the check is answered.
  const [pendingTake, setPendingTake] = React.useState(false);
  const selling = cart.filter((item) => !lineStopped(item)).length;

  /** The line goes on, and the first 18+ line of the sale asks for an ID. */
  const put = (item: PosCatalogItem, typedPrice?: number, quantity = 1) => {
    const ask = asksForId({ ageCheckOn: Boolean(features?.ageCheck), idChecked, cart, item });
    addToCart(item, typedPrice, quantity);
    cue("added");
    if (ask) setAgeAsk({ lineIds: [item.id], product: item.name, category: item.category });
  };

  /*
    One more of a product (or as many as "3*" asked for), from a tile, the quick
    row or a scan. Outside the licence hours an 18+ product says so and adds
    nothing; a single with none left opens a case first (at once, or after asking).
  */
  const add = (item: PosCatalogItem, typedPrice?: number, quantity = 1) => {
    if (item.ageRestricted && !alcohol.sellable) {
      toast({ title: licenceSentence(alcohol, new Date()) ?? "Alcohol does not sell now." });
      return;
    }
    // The line's own count once it is on the sale (a case opened since), else the shelf's.
    const stock = cart.find((line) => line.id === item.id)?.stock ?? item.inventoryItem?.currentStock ?? 0;
    const moment = caseMoment({ casesAndSingles: Boolean(features?.casesAndSingles), openableCase: item.openableCase, stock });
    if (moment.kind === "ask") {
      setCaseAsk(item);
      return;
    }
    // Offline the sale itself opens the case when it arrives (Break cases at the till).
    if (moment.kind === "break" && !isOffline) {
      void openCase(item).then((onHand) => put(onHand === null ? item : withStock(item, onHand), typedPrice, quantity));
      return;
    }
    put(item, typedPrice, quantity);
  };

  /** A bundle's button or barcode: its components as one, and the ID check if they hold an 18+ line. */
  const addBundleOf = (bundle: SnapshotBundle) => {
    const firstAdult = Boolean(features?.ageCheck) && !idChecked && !cart.some((line) => line.ageRestricted);
    void addBundle(bundle).then((lines) => {
      const adult = lines?.find((line) => line.ageRestricted);
      if (lines && adult && firstAdult) setAgeAsk({ lineIds: [adult.id], product: adult.name, category: adult.category });
    });
  };

  const openTray = () => {
    // Nothing to sell, or the column says why not yet: a discount past its ceiling, or offline too long.
    if (!selling || discountCeiling || offlineStop || bundleProblem) return;
    if (needsIdCheck) {
      const adult = cart.find((line) => line.ageRestricted && !lineStopped(line));
      setPendingTake(true);
      setAgeAsk({ lineIds: null, product: adult?.name ?? "This sale", category: adult?.category ?? null });
      return;
    }
    resetSaleRefusal();
    setTrayOpen(true);
  };

  // The tray's payments wait here while the reason, or a manager, is asked for.
  const rowsRef = React.useRef<PaymentRow[]>([]);
  // The sale goes; a manager the rules want is asked for by the approval dialog, which sends it again.
  const send = (rows: PaymentRow[], reason: string | null) => {
    void approval.run((approver) => postSale(rows, reason, approver)).catch(() => {
      // The tray shows the server's no; a sale saved offline shows as saved.
    });
  };
  const take = (rows: PaymentRow[]) => {
    rowsRef.current = rows;
    if (needsReason) {
      resetSaleRefusal();
      setApprove(true);
    } else send(rows, null);
  };

  const takeWithReason = (reason: string) => {
    setApprove(false);
    send(rowsRef.current, reason);
  };

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

  const next = () => {
    dismissCompletedSale();
    setTrayOpen(false);
    resetPayments();
    setWayKey(null);
    setPhoneSale(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  const [keySheet, setKeySheet] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const dropSale = useDropSale();
  const last = cart.at(-1);

  // The keys on TILL_KEYS (keys.tsx), from anywhere but a field.
  useWindowKeys((event) => {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if (typing || trayOpen || idCheck || approve || approval.asking || keySheet || holding || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === "Enter" && target?.tagName !== "BUTTON") {
      event.preventDefault();
      openTray();
    } else if ((event.key === "+" || event.key === "=") && last) {
      event.preventDefault();
      updateQty(last.catalogItemId, last.quantity + 1);
    } else if ((event.key === "-" || event.key === "_") && last) {
      event.preventDefault();
      updateQty(last.catalogItemId, last.quantity - 1);
    } else if ((event.key === "h" || event.key === "H") && cart.length) {
      event.preventDefault();
      setHolding(true);
    } else if (event.key === "Delete" && event.shiftKey && cart.length) {
      event.preventDefault();
      dropSale();
    } else if (event.key === "?") {
      event.preventDefault();
      setKeySheet(true);
    }
  });

  return (
    <div className={`bench${phoneSale ? " is-sale" : ""}`}>
      <Shelf searchRef={searchRef} onAdd={add} onAddBundle={addBundleOf} onShowSale={() => setPhoneSale(true)} onTake={openTray} />
      <aside className="bench-side" aria-label="This sale">
        <SaleColumn
          onTake={openTray}
          onBack={() => setPhoneSale(false)}
          holding={holding}
          onHolding={setHolding}
        />
        {trayOpen ? <PayTray key={way.key} way={way} ways={ways} onWay={setWayKey} onClose={() => setTrayOpen(false)} onTake={take} onNext={next} /> : null}
      </aside>
      <AgeCheckDialog
        open={idCheck}
        eyebrow={eyebrow}
        product={ageAsk?.product ?? ""}
        category={ageAsk?.category ?? null}
        onRemove={() => {
          // "Remove it": the line that asked, or every 18+ line when Take asked.
          if (ageAsk?.lineIds) for (const id of ageAsk.lineIds) removeFromCart(id);
          else removeAgeRestricted();
          setAgeAsk(null);
        }}
        onConfirm={() => {
          confirmId();
          setAgeAsk(null);
        }}
      />
      {caseAsk?.openableCase ? (
        <CaseDialog
          open
          eyebrow={eyebrow}
          single={caseAsk.name}
          casesOnHand={caseAsk.openableCase.casesOnHand}
          unitsPerCase={caseAsk.openableCase.unitsPerCase}
          busy={caseBusy}
          offline={isOffline}
          onNotNow={() => setCaseAsk(null)}
          onOpen={() => {
            const item = caseAsk;
            setCaseBusy(true);
            void openCase(item)
              .then((onHand) => {
                if (onHand !== null) put(withStock(item, onHand));
              })
              .finally(() => {
                setCaseBusy(false);
                setCaseAsk(null);
              });
          }}
        />
      ) : null}
      <ReasonDialog open={approve} onOpenChange={setApprove} amount={amountDue} onTake={takeWithReason} />
      <KeySheet open={keySheet} onOpenChange={setKeySheet} />
      {approval.dialog}
    </div>
  );
}

/* ─── The shelf ───────────────────────────────────────────────────────── */

function Shelf({
  searchRef,
  onAdd,
  onAddBundle,
  onShowSale,
  onTake,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (item: PosCatalogItem, typedPrice?: number, quantity?: number) => void;
  onAddBundle: (bundle: SnapshotBundle) => void;
  onShowSale: () => void;
  onTake: () => void;
}) {
  // The open-price product whose amount is being asked for. Enter in the search asks for it as well.
  const [pricing, setPricing] = React.useState<{ id: string; fromSearch: boolean } | null>(null);
  const queryClient = useQueryClient();
  // Scans still being found; the box takes the next one meanwhile.
  const [finding, setFinding] = React.useState(0);
  // A code the till does not know: the box shakes once, and the till says so out loud.
  const [unknown, setUnknown] = React.useState(false);
  const { toast } = useToast();
  // The product whose stock is being adjusted from its tile's long press (STK-04).
  const [adjusting, setAdjusting] = React.useState<PosCatalogItem | null>(null);
  const {
    context,
    shelfPriceOf,
    bundlesOnSale,
    canAdjustStock,
    search,
    setSearch,
    categories,
    selectedCategory,
    setSelectedCategory,
    catalogItems,
    catalogLoading,
    catalogError,
    findScanned,
    alcohol,
    features,
    cart,
    lineStopped,
    amountDue,
    selectedCustomer,
  } = useTill();
  // A tablet's keyboard would cover the shelf: the search takes focus only where there is a pointer.
  const [pointer] = React.useState(() => typeof window === "undefined" || !window.matchMedia("(hover: none)").matches);
  const selling = cart.filter((item) => !lineStopped(item)).length;
  const empty = !selling;
  const stoppedUntil = alcohol.sellable ? undefined : alcohol.startsAt;
  const depositsOn = Boolean(features?.emptiesAndDeposits);
  // Liquor panel 2: the licence's sentence, on Harare's clock, whatever the device's says.
  const now = new Date();
  const licence = licenceSentence(alcohol, now);
  const tellStopped = () => licence && toast({ title: licence });
  // A bundle's button sits under its category (PRD-08): the group on show, not a search.
  const shownCategories = new Set(catalogItems.map((item) => item.categoryId).filter(Boolean));
  const bundleTiles =
    selectedCategory && !search.trim() ? bundlesOnSale.filter((bundle) => bundle.tillButton && bundle.categoryId && shownCategories.has(bundle.categoryId)) : [];
  // How many of a product the sale holds now, for the count on its tile.
  const onSaleOf = (item: PosCatalogItem) =>
    cart.filter((line) => line.catalogItemId === item.id).reduce((sum, line) => sum + line.quantity, 0);

  return (
    <main className="main">
      {licence ? <LicenceBanner eyebrow={licenceEyebrow(context?.till.name ?? "This till", now)} sentence={licence} /> : null}
      <div className="tools">
        <label className={`input-wrap input-lg grow${unknown ? " is-shake" : ""}`} onAnimationEnd={() => setUnknown(false)}>
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
                const { quantity, code } = parseScan(search);
                if (!code) return;
                // A bundle's barcode rings the bundle (PRD-08).
                const bundle = bundlesOnSale.find((entry) => entry.barcode && entry.barcode === code);
                if (bundle) {
                  onAddBundle(bundle);
                  setSearch("");
                  return;
                }
                // The box is clear for the next scan while this one is found.
                setSearch("");
                setFinding((n) => n + 1);
                void findScanned(code).then((item) => {
                  setFinding((n) => n - 1);
                  if (item && !item.openPrice) {
                    onAdd(item, undefined, quantity);
                    return;
                  }
                  if (!item) {
                    cue("unknown");
                    setUnknown(true);
                  }
                  // An amount to ask for, or nothing found: the search comes back, unless a new one began.
                  setSearch((current) => current || code);
                  if (item) {
                    setSelectedCategory(null);
                    setPricing({ id: item.id, fromSearch: true });
                  }
                });
              }
              if (event.key === "Escape") setSearch("");
            }}
          />
          {finding ? (
            <span className="note" role="status">
              Finding…
            </span>
          ) : (
            <span className="kbd">/</span>
          )}
        </label>
      </div>
      {/* Quick things on Most sold, the shelf the till opens on: a search or a group is already a choice. */}
      {!search.trim() && !selectedCategory && !catalogLoading ? (
        <QuickRow
          ranked={catalogItems}
          stoppedUntil={stoppedUntil}
          onSaleOf={onSaleOf}
          onAdd={onAdd}
          priceOf={(item) => shelfPriceOf(item.id)?.price ?? item.unitPrice}
        />
      ) : null}
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
        <LoadFailed icon={WifiSlash} title="The shelf did not load" error={catalogError} onRetry={() => void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] })} />
      ) : !catalogItems.length && search.trim() && !bundlesOnSale.some((bundle) => bundle.barcode === search.trim()) ? (
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
              shelf={shelfPriceOf(item.id)}
              stoppedUntil={stoppedUntil}
              depositsOn={depositsOn}
              onStopped={tellStopped}
              onAdjust={canAdjustStock ? () => setAdjusting(item) : undefined}
              onSale={onSaleOf(item)}
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
          {bundleTiles.map((bundle) => (
            <BundleTile key={bundle.id} bundle={bundle} onAdd={onAddBundle} />
          ))}
        </div>
      )}
      {adjusting ? (
        <AdjustStockDialog
          product={{ id: adjusting.id, name: adjusting.name, onHand: adjusting.inventoryItem?.currentStock ?? 0 }}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
      <div className="phone-sale">
        <button type="button" className="btn btn-touch btn-block" disabled={empty} onClick={onShowSale}>
          <ShoppingCart className="ic" />
          <span key={selling} className="grow text-left is-bump">
            {count(selling, "item")}
            {selectedCustomer ? `, ${selectedCustomer.name}` : ""}
          </span>
          <RollingFigure className="num ink" value={amountDue} format={usd} />
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

/** Each change to the sale, said to a screen reader: what happened, then the total (sale-words.ts). */
function SaleWords() {
  const { cart, amountDue } = useTill();
  const [seen, setSeen] = React.useState(cart);
  const [words, setWords] = React.useState("");
  if (cart !== seen) {
    setSeen(cart);
    setWords(saleChangeWords(seen, cart, amountDue));
  }
  return (
    <span className="visually-hidden" role="status" aria-live="polite">
      {words}
    </span>
  );
}

function SaleColumn({
  onTake,
  onBack,
  holding,
  onHolding,
}: {
  onTake: () => void;
  onBack: () => void;
  /** Hold is open: pressed, or H on the keyboard. */
  holding: boolean;
  onHolding: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const {
    cart,
    beforeDiscounts,
    vatIncluded,
    lineDiscountTotal,
    bundleSaving,
    promotionSaving,
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
    pointsOff,
    voucherSaving,
    vouchersSoldTotal,
    emptiesBackCount,
    bundleProblem,
    features,
  } = useTill();
  const orderOff = Math.max(discountAmount - lineDiscountTotal - bundleSaving - promotionSaving - voucherSaving - pointsOff, 0);
  // Anything off the sale: then what it came to before is worth a line.
  const offs = lineDiscountTotal + bundleSaving + promotionSaving + orderOff + voucherSaving + pointsOff;
  const depositsOn = Boolean(features?.emptiesAndDeposits);
  // Lines stopped by the licence hours do not sell, so they are not counted.
  const sellingLines = cart.filter((item) => !lineStopped(item));
  const selling = sellingLines.length;
  const empty = !selling;
  // The deposit as the lines charge it, and what the empties back take off: together the sale's deposit.
  const bottlesBack = bottlesBackCredit(sellingLines);
  const deposits = Number((depositTotal + bottlesBack).toFixed(2));
  // "Deposit, 6 bottles": the bottles the sale charges a deposit on, before any come back.
  const depositBottles = sellingLines.filter((item) => item.returnable && item.depositAmount).reduce((sum, item) => sum + Math.floor(item.quantity), 0);
  // A manager approves an amount off; a changed price is approved as a change.
  const offToApprove = lineDiscountTotal + Number(orderDiscountAmount || "0");
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
      <div className="bar sale-head">
        <button type="button" className="btn btn-quiet when-phone" onClick={onBack}>
          <CaretLeft className="ic" />
          Products
        </button>
        <h1>Sale</h1>
        <SaleWords />
        <div className="end">
          <CustomerPopover />
          <SaleMore />
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
          <AnimatePresence initial={false}>
            {cart.map((item) => (
              <SaleLine key={item.id} item={item} />
            ))}
          </AnimatePresence>
          <VoucherSoldLines />
          <BundleOffers />
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
            {offs > 0.004 ? (
              <div className="l">
                <span>Before discounts</span>
                <span>{usd(beforeDiscounts)}</span>
              </div>
            ) : null}
            {lineDiscountTotal > 0.004 ? (
              <div className="l">
                <span>Line discount</span>
                <span className="off-figure">{usd(-lineDiscountTotal)}</span>
              </div>
            ) : null}
            {bundleSaving > 0.004 ? (
              <div className="l">
                <span>Buy more, pay less</span>
                <span className="off-figure">{usd(-bundleSaving)}</span>
              </div>
            ) : null}
            {promotionSaving > 0.004 ? (
              <div className="l">
                <span>Promotions</span>
                <span className="off-figure">{usd(-promotionSaving)}</span>
              </div>
            ) : null}
            {orderOff > 0.004 ? (
              <div className="l">
                <span>Off the sale</span>
                <span className="off-figure">{usd(-orderOff)}</span>
              </div>
            ) : null}
            {voucherSaving > 0.004 ? (
              <div className="l">
                <span>Discount voucher</span>
                <span className="off-figure">{usd(-voucherSaving)}</span>
              </div>
            ) : null}
            {pointsOff > 0.004 ? (
              <div className="l">
                <span>Points</span>
                <span className="off-figure">{usd(-pointsOff)}</span>
              </div>
            ) : null}
            {/* Liquor panel 3: deposits and bottles back sit outside the goods, then what is paid. */}
            {deposits > 0.004 ? (
              <div className="l">
                <span>Deposit, {count(depositBottles, "bottle")}</span>
                <span>{usd(deposits)}</span>
              </div>
            ) : null}
            {bottlesBack > 0.004 ? (
              <div className="l is-ok">
                <span>Bottles back, {emptiesBackCount}</span>
                <span className="ok-figure">{usd(-bottlesBack)}</span>
              </div>
            ) : null}
            {vouchersSoldTotal > 0.004 ? (
              <div className="l">
                <span>Gift vouchers</span>
                <span>{usd(vouchersSoldTotal)}</span>
              </div>
            ) : null}
            {deposits > 0.004 || bottlesBack > 0.004 || vouchersSoldTotal > 0.004 ? <div className="rule" /> : null}
            <div className="l sum">
              <span>{count(selling, "item")}</span>
              <span>
                VAT {usd(taxAmount)}
                {vatIncluded ? null : " added"}
              </span>
            </div>
          </>
        ) : null}
        {cart.length ? (
          <div className="row">
            <DiscountPopover />
            <GiftVoucherPopover />
          </div>
        ) : null}
        {depositsOn ? <BottlesBackButton emptyCart={!cart.length} /> : null}
        <div className="sale-keys">
          <HoldPopover open={holding} onOpenChange={onHolding} disabled={!cart.length} />
          <button
            type="button"
            className="take-key"
            disabled={empty || Boolean(discountCeiling) || Boolean(offlineStop) || Boolean(bundleProblem)}
            onClick={onTake}
          >
            {depositsOn ? "Pay" : "Take"}
            <RollingFigure className="num" value={amountDue} format={usd} />
            {!empty && !discountCeiling && !offlineStop && !bundleProblem ? <span className="kbd on-primary">↵</span> : null}
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

/* ─── More on the sale ────────────────────────────────────────────────── */

/** The sale's less frequent acts behind one key: the drawer, a lay-by, dropping the sale. */
function SaleMore() {
  const { toast } = useToast();
  const { context, approvers, isOffline, cart } = useTill();
  const drop = useDropSale();
  const [open, setOpen] = React.useState(false);
  const [layby, setLayby] = React.useState(false);
  const approval = useApproval({ approvers: approvers.sell, reason: "Open the drawer without a sale" });
  const hasDrawer = Boolean(context?.till.hasDrawer);
  const openDrawer = () => {
    approval
      .run((approver) => fetchJson("/api/v2/retail/pos/drawer/open", { method: "POST", body: JSON.stringify(approver ? { approver } : {}) }))
      .then((done) => {
        if (done) toast({ title: "Drawer opened.", variant: "success" });
      })
      .catch((error: unknown) => toast({ title: "The drawer did not open", description: getApiErrorMessage(error), variant: "destructive" }));
  };
  const item = (label: string, Icon: React.ComponentType<{ className?: string }>, act: () => void, disabled = false) => (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        act();
      }}
    >
      <Icon className="ic" />
      {label}
    </button>
  );
  if (!hasDrawer && !cart.length) return null;
  return (
    <>
      <TillPopover
        open={open}
        onOpenChange={setOpen}
        label="More"
        align="end"
        size="sm"
        trigger={
          <button type="button" className="btn btn-icon is-touch" aria-label="More">
            <DotsThree className="ic" />
          </button>
        }
      >
        <div className="menu is-flat" role="menu" aria-label="More">
          {hasDrawer ? item("Open drawer", Tray, openDrawer, isOffline) : null}
          {cart.length ? item("Lay-by", Archive, () => setLayby(true), isOffline) : null}
          {cart.length ? item("Drop this sale", Trash, drop) : null}
        </div>
      </TillPopover>
      {layby ? <LaybyStartDialog onClose={() => setLayby(false)} /> : null}
      {approval.dialog}
    </>
  );
}
