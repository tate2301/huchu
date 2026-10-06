"use client";

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
  SimCard,
  Wine,
} from "@/lib/icons";
import { clockLabel } from "@/lib/retail/licence-hours";
import { count, MEASURES, qty, usd } from "./format";
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

/** A product on the shelf: press to add one to the sale. */
export function ProductTile({
  item,
  stoppedUntil,
  depositsOn,
  onAdd,
}: {
  item: PosCatalogItem;
  /** Minutes after midnight when 18+ products sell again, when they are stopped now. */
  stoppedUntil: number | null | undefined;
  /** The shop charges deposits on returnable bottles. */
  depositsOn: boolean;
  onAdd: (item: PosCatalogItem) => void;
}) {
  const stock = item.inventoryItem?.currentStock ?? 0;
  const stopped = item.ageRestricted && stoppedUntil !== undefined;
  const empty = stock <= 0 && !item.openableCase;
  const off = stopped || empty;
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
      : stockLine(item);

  return (
    <button
      type="button"
      className="tile"
      aria-label={[
        item.name,
        usd(item.unitPrice),
        ...(item.wasPrice !== null && item.wasPrice > item.unitPrice ? [`was ${usd(item.wasPrice)}`] : []),
        ...tags,
        status,
      ].join(", ")}
      aria-disabled={off || undefined}
      onClick={() => {
        if (!off) onAdd(item);
      }}
    >
      <ProductPreview name={item.name} imageUrl={item.imageUrl} />
      <span className="p">
        {usd(item.unitPrice)}
        {item.wasPrice !== null && item.wasPrice > item.unitPrice ? <s className="was">{usd(item.wasPrice)}</s> : null}
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
      <span className={`s${!off && stock > 0 && stock <= LOW_STOCK ? " low" : !off && item.ageRestricted ? " age" : ""}`}>{status}</span>
    </button>
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
