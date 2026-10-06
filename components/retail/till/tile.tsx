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
  Wine,
} from "@/lib/icons";
import { clockLabel } from "@/lib/retail/licence-hours";
import { count, MEASURES, qty, usd } from "./format";
import { TillPopover } from "./parts";
import { useTill } from "./state";
import type { PosCatalogItem } from "./types";

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

/** The photo when there is one, else a glyph for its kind on the fill. */
export function ProductPreview({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return (
    <span className="pic" aria-hidden="true">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the shop's own uploads, any size, cached offline
        <img src={imageUrl} alt="" loading="lazy" />
      ) : (
        <ProductGlyph name={name} />
      )}
    </span>
  );
}

const LOW_STOCK = 5;

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
  onAdd,
  pricing,
  onPricing,
}: {
  item: PosCatalogItem;
  /** Minutes after midnight when 18+ products sell again, when they are stopped now. */
  stoppedUntil: number | null | undefined;
  /** The shop charges deposits on returnable bottles. */
  depositsOn: boolean;
  /** `typedPrice`: the amount typed for an open-price product. */
  onAdd: (item: PosCatalogItem, typedPrice?: number) => void;
  /** An open-price product's amount is being asked for; Enter in the search opens it too. */
  pricing?: boolean;
  onPricing?: (open: boolean) => void;
}) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  const stopped = item.ageRestricted && stoppedUntil !== undefined;
  const empty = stock <= 0 && !item.openableCase;
  const off = stopped || empty;
  const was = !item.openPrice && item.wasPrice !== null && item.wasPrice > item.unitPrice ? item.wasPrice : null;
  const tags = [
    ...(item.ageRestricted ? ["18+"] : []),
    ...(depositsOn && item.returnable && item.depositAmount ? [`+${item.depositAmount < 1 ? `${Math.round(item.depositAmount * 100)}c` : usd(item.depositAmount)} deposit`] : []),
  ];
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
        : stockLine(item);

  const tile = (
    <button
      type="button"
      className="tile"
      aria-label={[item.name, item.openPrice ? "any amount" : usd(item.unitPrice), ...(was !== null ? [`was ${usd(was)}`] : []), ...tags, status].join(", ")}
      aria-disabled={off || undefined}
      onClick={
        item.openPrice
          ? undefined
          : () => {
              if (!off) onAdd(item);
            }
      }
    >
      <ProductPreview name={item.name} imageUrl={item.imageUrl} />
      <span className="p">
        {item.openPrice ? "Any" : usd(item.unitPrice)}
        {was !== null ? <s className="was">{usd(was)}</s> : null}
      </span>
      <span className="n">{item.name}</span>
      {tags.length ? (
        <span className="t">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </span>
      ) : null}
      <span className={`s${!off && !item.openPrice && stock > 0 && stock <= LOW_STOCK ? " low" : !off && item.ageRestricted ? " age" : ""}`}>
        {status}
      </span>
    </button>
  );

  if (!item.openPrice || off) return tile;
  return (
    <AmountPopover item={item} open={pricing} onOpenChange={onPricing} onAdd={(price) => onAdd(item, price)}>
      {tile}
    </AmountPopover>
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
