"use client";

import * as React from "react";

import {
  ArrowsCounterClockwise,
  BeerBottle,
  BeerStein,
  Bread,
  Carrot,
  Cube,
  Drop,
  Egg,
  Flame,
  Grains,
  Martini,
  Package,
  PintGlass,
  Plus,
  SimCard,
  Tag,
  Wine,
} from "@/lib/icons";
import { clockLabel } from "@/lib/retail/licence-hours";
import { count, MEASURES, qty, usd, whole } from "./format";
import { TillPopover } from "./parts";
import { useTill } from "./state";
import type { PosCatalogItem, Promotion } from "./types";

/** A glyph for a product with no photo, from what its name says it is. */
const GLYPHS: Array<[RegExp, React.ComponentType<{ className?: string }>]> = [
  [/tomato|potato|onion|carrot|cabbage|vegetable/i, Carrot],
  [/\begg/i, Egg],
  [/bread|loaf|bun/i, Bread],
  [/roller meal|mealie|rice|sugar|flour|maize/i, Grains],
  [/oil/i, Drop],
  [/coke|coca-cola|fanta|sprite|soda|juice|mazoe/i, PintGlass],
  [/match|candle/i, Flame],
  [/airtime|recharge|bundle/i, SimCard],
  [/lager|beer|castle|zambezi|black label/i, BeerBottle],
  [/whisky|walker|gin|vodka|brandy|rum/i, Martini],
  [/savanna|cider|hunter/i, BeerStein],
  [/wine/i, Wine],
  [/\bice\b/i, Cube],
];

export function ProductGlyph({ name }: { name: string }) {
  const Icon = GLYPHS.find(([pattern]) => pattern.test(name))?.[1] ?? Package;
  return <Icon className="ic" />;
}

/** The photo when there is one, else a glyph for its kind on the fill; marks (18+, the count on the sale) ride on it. */
export function ProductPreview({ name, imageUrl, children }: { name: string; imageUrl?: string | null; children?: React.ReactNode }) {
  return (
    <span className="pic" aria-hidden="true">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the shop's own uploads, any size, cached offline
        <img src={imageUrl} alt="" loading="lazy" />
      ) : (
        <ProductGlyph name={name} />
      )}
      {children}
    </span>
  );
}

/** At or under the stock row's reorder level: the tile says so, and what that level is. */
function belowReorder(item: PosCatalogItem) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  const level = item.inventoryItem?.reorderLevel ?? null;
  return level !== null && stock > 0 && stock <= level ? level : null;
}

/** "+10c", "+US$1.00": a returnable bottle's deposit, after its price. */
function depositWord(amount: number) {
  return `+${amount < 1 ? `${Math.round(amount * 100)}c` : usd(amount)}`;
}

/** Sold and out of reach: none left (and no case to open), or 18+ outside the licence hours. */
function tileOff(item: PosCatalogItem, stoppedUntil: number | null | undefined) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  return (item.ageRestricted && stoppedUntil !== undefined) || (stock <= 0 && !item.openableCase);
}

function stockLine(item: PosCatalogItem) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  // A case product is counted in cases, whatever unit its stock row carries.
  if (item.caseOf) return count(stock, "case");
  const unit = item.inventoryItem?.unit?.trim().toLowerCase();
  if (!unit || ["each", "ea", "unit", "units", "pcs", "piece"].includes(unit)) return `${qty(stock)} left`;
  const word = MEASURES.has(unit) || stock === 1 || unit.endsWith("s") ? unit : `${unit}s`;
  return `${qty(stock)} ${word} left`;
}

/**
 * A product on the shelf: press to add one to the sale. An open-price product
 * (airtime) shows "Any" and asks for the amount in a popover from the tile first.
 */
export function ProductTile({
  item,
  stoppedUntil,
  depositsOn,
  onSale,
  onAdd,
  pricing,
  onPricing,
}: {
  item: PosCatalogItem;
  /** Minutes after midnight when 18+ products sell again, when they are stopped now. */
  stoppedUntil: number | null | undefined;
  /** The shop charges deposits on returnable bottles. */
  depositsOn: boolean;
  /** How many of it are on the sale now; 0 when none. */
  onSale: number;
  /** `typedPrice`: the amount typed for an open-price product. */
  onAdd: (item: PosCatalogItem, typedPrice?: number) => void;
  /** An open-price product's amount is being asked for; Enter in the search opens it too. */
  pricing?: boolean;
  onPricing?: (open: boolean) => void;
}) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  const stopped = item.ageRestricted && stoppedUntil !== undefined;
  const off = tileOff(item, stoppedUntil);
  const was = !item.openPrice && item.wasPrice !== null && item.wasPrice > item.unitPrice ? item.wasPrice : null;
  const deposit = depositsOn && item.returnable && item.depositAmount ? depositWord(item.depositAmount) : null;
  const reorderAt = item.openPrice ? null : belowReorder(item);
  const status = stopped
    ? stoppedUntil === null
      ? "Not today"
      : `From ${clockLabel(stoppedUntil)}`
    : stock <= 0
      ? item.openableCase
        ? "None loose, a case opens"
        : "None left"
      : item.openPrice
        ? "Type the amount"
        : reorderAt !== null
          ? `${stockLine(item)}, reorder at ${qty(reorderAt)}`
          : stockLine(item);
  // The count on the sale reads as a quantity: a weighed line shows its weight.
  const inCart = onSale > 0 ? qty(onSale) : null;

  const tile = (
    <button
      type="button"
      className="tile"
      aria-label={[
        item.name,
        item.openPrice ? "any amount" : usd(item.unitPrice),
        ...(was !== null ? [`was ${usd(was)}`] : []),
        ...(item.ageRestricted ? ["18+"] : []),
        ...(deposit ? [`${deposit} deposit`] : []),
        status,
        ...(inCart ? [`${inCart} on this sale`] : []),
      ].join(", ")}
      aria-disabled={off || undefined}
      onClick={
        item.openPrice
          ? undefined
          : () => {
              if (!off) onAdd(item);
            }
      }
    >
      <ProductPreview name={item.name} imageUrl={item.imageUrl}>
        {item.ageRestricted ? <span className="age">18+</span> : null}
        {inCart ? <span className="in">{inCart}</span> : null}
      </ProductPreview>
      <span className="p">
        {item.openPrice ? "Any" : usd(item.unitPrice)}
        {was !== null ? <s className="was">{usd(was)}</s> : null}
        {deposit ? <span className="dep">{deposit}</span> : null}
      </span>
      <span className="n">{item.name}</span>
      <span className={reorderAt !== null && !off ? "s low" : "s"}>{status}</span>
    </button>
  );

  if (!item.openPrice || off) return tile;
  return (
    <AmountPopover item={item} open={pricing} onOpenChange={onPricing} onAdd={(price) => onAdd(item, price)}>
      {tile}
    </AmountPopover>
  );
}

/** A promotion on the quick row: what it takes off, short. */
function promotionWord(promotion: Promotion) {
  if (promotion.type === "PERCENT") return `${whole(promotion.value)}% off`;
  if (promotion.type === "AMOUNT") return `${usd(promotion.value)} off`;
  return null;
}

/** At most this many on the quick row: promotions first, then what needs typing (airtime), then the most sold. */
const QUICK_MOST = 5;

/**
 * The quick row, above the groups on Most sold: the shop's running promotions
 * (pressed, one goes on the sale; pressed again, it comes off), open-price
 * products like airtime, and the best sellers, never more than five. Out of
 * stock and stopped products are left off rather than shown grey.
 */
export function QuickRow({
  ranked,
  promotions,
  selectedPromotionId,
  onPromotion,
  stoppedUntil,
  onSaleOf,
  onAdd,
}: {
  /** The shelf, most sold first. */
  ranked: readonly PosCatalogItem[];
  promotions: readonly Promotion[];
  selectedPromotionId: string;
  onPromotion: (id: string) => void;
  stoppedUntil: number | null | undefined;
  onSaleOf: (item: PosCatalogItem) => number;
  onAdd: (item: PosCatalogItem, typedPrice?: number) => void;
}) {
  const shown = promotions.slice(0, 2);
  const sellable = ranked.filter((item) => !tileOff(item, stoppedUntil));
  const typed = sellable.filter((item) => item.openPrice).slice(0, 1);
  const best = sellable.filter((item) => !item.openPrice).slice(0, Math.max(QUICK_MOST - shown.length - typed.length, 0));
  const products = [...typed, ...best];
  if (!shown.length && !products.length) return null;

  return (
    <div className="quick" role="group" aria-label="Quick add">
      {shown.map((promotion) => {
        const on = promotion.id === selectedPromotionId;
        // Said once: a name that already says "5% off" needs no label after it.
        const off = promotionWord(promotion);
        const word = off && !promotion.name.toLowerCase().includes(off.toLowerCase()) ? off : null;
        return (
          <button
            key={promotion.id}
            type="button"
            className="quick-item"
            aria-pressed={on}
            title={promotion.name}
            onClick={() => onPromotion(on ? "" : promotion.id)}
          >
            <span className="qpic" aria-hidden="true">
              <Tag className="ic" />
            </span>
            <span className="qn">{promotion.name}</span>
            {word ? <span className="qp">{word}</span> : null}
          </button>
        );
      })}
      {products.map((item) => {
        const onIt = onSaleOf(item);
        const button = (
          <button
            key={item.id}
            type="button"
            className="quick-item"
            title={item.name}
            aria-label={[item.name, item.openPrice ? "any amount" : usd(item.unitPrice), ...(onIt > 0 ? [`${qty(onIt)} on this sale`] : [])].join(", ")}
            onClick={item.openPrice ? undefined : () => onAdd(item)}
          >
            <span className="qpic" aria-hidden="true">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the shop's own uploads, cached offline
                <img src={item.imageUrl} alt="" width={40} height={40} loading="lazy" />
              ) : (
                <ProductGlyph name={item.name} />
              )}
            </span>
            <span className="qn">{item.name}</span>
            <span className="qp">{item.openPrice ? "Any" : usd(item.unitPrice)}</span>
            {onIt > 0 ? <span className="in">{qty(onIt)}</span> : null}
          </button>
        );
        return item.openPrice ? (
          <AmountPopover key={item.id} item={item} onAdd={(price) => onAdd(item, price)}>
            {button}
          </AmountPopover>
        ) : (
          button
        );
      })}
    </div>
  );
}

/** The amount for an open-price product, typed in a popover from its tile; Enter adds it. */
function AmountPopover({
  item,
  open,
  onOpenChange,
  onAdd,
  children,
}: {
  item: PosCatalogItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAdd: (price: number) => void;
  children: React.ReactElement;
}) {
  const { cart } = useTill();
  const [own, setOwn] = React.useState(false);
  const isOpen = open ?? own;
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  const value = Number(typed);
  const valid = typed.trim() !== "" && Number.isFinite(value) && value > 0;
  const onSale = cart.find((line) => line.catalogItemId === item.id);
  // Every opening starts empty, whether the tile or Enter in the search opened it.
  const setOpen = (next: boolean) => {
    setTyped("");
    setOwn(next);
    onOpenChange?.(next);
  };

  return (
    <TillPopover open={isOpen} onOpenChange={setOpen} label={`${item.name}: the amount`} trigger={children}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onAdd(Number(value.toFixed(2)));
          setOpen(false);
        }}
      >
        <div className="pop-body">
          <b className="strong">{item.name}</b>
          <div className="field">
            <label htmlFor={id}>Amount</label>
            <label className="input-wrap input-lg">
              <span className="muted">US$</span>
              <input
                id={id}
                className="num text-left"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={typed}
                aria-describedby={onSale ? `${id}h` : undefined}
                // Digits and one point, two places at most: anything typed is an amount or on its way to one.
                onChange={(event) => setTyped(event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/(\.\d{2})\d+$/, "$1"))}
              />
            </label>
          </div>
          {onSale ? (
            <span id={`${id}h`} className="help">
              Already on this sale at {usd(onSale.unitPrice * onSale.quantity)}. This adds to it.
            </span>
          ) : null}
        </div>
        <div className="pop-foot">
          <span className="kbd push-left">Esc</span>
          <button type="submit" className="btn btn-ink" disabled={!valid}>
            <Plus className="ic" />
            {valid ? `Add ${usd(value)}` : "Add"}
          </button>
        </div>
      </form>
    </TillPopover>
  );
}

/** The tile that takes empties back: it opens the count, it adds nothing by itself. */
export function BottlesBackTile({ count, ...props }: React.ComponentProps<"button"> & { count: number }) {
  return (
    <button type="button" className="tile" {...props}>
      <span className="pic" aria-hidden="true">
        <ArrowsCounterClockwise className="ic" />
      </span>
      <span className="p">Count</span>
      <span className="n">Bottles back</span>
      <span className="s">{count ? `${count} on this sale` : "Empties for a credit"}</span>
    </button>
  );
}
