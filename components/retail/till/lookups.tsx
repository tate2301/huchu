"use client";

/**
 * Price check: scan or type, the products found on the left, the chosen one's
 * price and stock in the sale column's place. It never changes the sale or
 * the stock until someone presses Add it to the sale.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { Barcode, CaretLeft, IdentificationCard, Package, Percent, Plus, Recycle, Stack, Tag } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { count, qty, usd } from "./format";
import { freeKey } from "./layby";
import { Empty, LoadFailed, useWindowKeys } from "./parts";
import { useTill } from "./state";
import { ProductPreview } from "./tile";
import type { PosCatalogItem } from "./types";

/** What an 18+ line asks of the till here, by the shop's switches; a device not yet a till does not know them. */
function ageWords(features: ReturnType<typeof useTill>["features"], sellableNow: boolean) {
  if (features && !sellableNow) return "Not now: outside the licence hours";
  const id = !features || features.ageCheck;
  const hours = !features || features.licenceHours;
  return id && hours ? "Ask for ID, and only in licence hours" : id ? "Ask for ID" : hours ? "Only in licence hours" : "For people 18 or over";
}

/** "US$1.20", or "Any amount" for an open price (airtime): whatever the cashier types at the till. */
const priceOf = (item: PosCatalogItem) => (item.openPrice ? "Any amount" : usd(item.unitPrice));

export function PriceCheckScreen() {
  const { context } = useTill();
  const [typed, setTyped] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [phoneRecord, setPhoneRecord] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setTerm(typed.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [typed]);
  // The device fixes the site: the till's own shelf.
  const siteId = context?.site.id ?? null;
  const query = useQuery({
    queryKey: ["retail-pos-price-check", siteId, term],
    enabled: term.length >= 1,
    queryFn: () => fetchJson<{ data: PosCatalogItem[] }>(`/api/v2/retail/pos/catalog?search=${encodeURIComponent(term)}`),
  });
  const rows = React.useMemo(() => (term ? (query.data?.data ?? []) : []), [term, query.data]);
  const item = rows.find((row) => row.id === chosenId) ?? rows[0] ?? null;

  return (
    <div className={`bench hx cu cu-pc${phoneRecord ? " is-sale" : ""}`}>
      <main className="main hx-main" aria-label="Price check">
        <div className="hx-head">
          <h1>Price check</h1>
          {term && !query.isPending && rows.length ? <span className="hx-sub">{count(rows.length, "product")}</span> : null}
        </div>
        <label className="input-wrap cu-find">
          <Barcode className="ic" />
          <input
            type="search"
            aria-label="Scan or search products"
            placeholder="Scan a barcode or type a product"
            autoComplete="off"
            autoFocus
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setChosenId(null);
            }}
          />
        </label>
        {!term ? (
          <Empty icon={Tag} title="Scan it, or type its name" />
        ) : query.isPending ? (
          <div className="hx-list" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className="skeleton hx-skeleton" />
            ))}
          </div>
        ) : query.isError ? (
          <LoadFailed icon={Tag} title="Prices did not load" error={query.error} onRetry={() => void query.refetch()} />
        ) : !rows.length ? (
          <Empty icon={Tag} title={`No product called “${term}”`} />
        ) : (
          <div className="hx-list">
            {rows.map((row) => {
              const stock = row.inventoryItem?.currentStock ?? 0;
              return (
                <div key={row.id} className="hx-item">
                  <button
                    type="button"
                    className="hx-row"
                    aria-current={row.id === item?.id ? "true" : undefined}
                    onClick={() => {
                      setChosenId(row.id);
                      setPhoneRecord(true);
                    }}
                  >
                    <span className="hx-glyph">
                      <ProductPreview name={row.name} imageUrl={row.imageUrl} />
                    </span>
                    <span className="hx-text">
                      <span className="hx-t">
                        <span className="truncate">{row.name}</span>
                        {row.ageRestricted ? <span className="hx-tag">18+</span> : null}
                      </span>
                      <span className="hx-s">
                        <span className="num">{row.barcode ?? row.sku}</span> · <span className="num">{qty(stock)}</span> left
                      </span>
                    </span>
                    <span className="hx-v num">{priceOf(row)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <aside className="bench-side hx-side" aria-label={item ? item.name : "Product"}>
        {item ? <ProductRecord key={item.id} item={item} onBack={() => setPhoneRecord(false)} /> : null}
      </aside>
    </div>
  );
}

/** A product in the sale column's place: its price as the largest figure, its stock and rules as facts, and Add it to the sale. */
function ProductRecord({ item, onBack }: { item: PosCatalogItem; onBack: () => void }) {
  const router = useRouter();
  const { addToCart, alcohol, context, features, isPosHost, shiftHere } = useTill();
  const stock = item.inventoryItem?.currentStock ?? 0;
  // Stock at or below the shop's reorder level says so; null when the shop never set one.
  const reorderLevel = item.inventoryItem?.reorderLevel ?? null;
  const site = context?.site.name ?? "this shop";
  const deposits = features ? features.emptiesAndDeposits : true;
  const add = () => {
    addToCart(item);
    router.push(getPosPortalHref("checkout", isPosHost));
  };
  useWindowKeys((event) => {
    if (!shiftHere || event.key !== "Enter" || !freeKey(event)) return;
    event.preventDefault();
    add();
  });

  return (
    <>
      <div className="bar sale-head">
        <button type="button" className="btn btn-icon is-touch when-phone" aria-label="Back to Price check" onClick={onBack}>
          <CaretLeft className="ic" />
        </button>
        <h1>Product</h1>
        <span className="hx-code num">{item.barcode ?? item.sku}</span>
      </div>
      <div className="hx-scroll">
        <div className="cu-product">
          <span className="cu-pic" aria-hidden="true">
            <ProductPreview name={item.name} imageUrl={item.imageUrl} />
          </span>
          <span className="cu-product-n">{item.name}</span>
          <span className="paid-v">{priceOf(item)}</span>
        </div>
        <dl className="facts hx-facts">
          <div className="fact">
            <Package className="ic" />
            <dt>{stock <= 0 && item.openableCase ? `None loose at ${site}` : `Left at ${site}`}</dt>
            <dd>{qty(stock)}</dd>
          </div>
          {stock <= 0 && item.openableCase ? (
            <div className="fact">
              <Stack className="ic" />
              <dt>{count(item.openableCase.casesOnHand, "case")} to open</dt>
              <dd>{item.openableCase.unitsPerCase} a case</dd>
            </div>
          ) : reorderLevel !== null && stock <= reorderLevel ? (
            <div className="fact">
              <Stack className="ic" />
              <dt>Reorder level</dt>
              <dd>{qty(reorderLevel)}</dd>
            </div>
          ) : null}
          <div className="fact">
            <Percent className="ic" />
            <dt>VAT</dt>
            <dd>{item.taxPercent ? `${item.taxInclusive ? "Included" : "Added"} at ${item.taxPercent}%` : "None"}</dd>
          </div>
          {item.ageRestricted ? (
            <div className="fact">
              <IdentificationCard className="ic" />
              <dt>{ageWords(features, alcohol.sellable)}</dt>
              <dd>18+</dd>
            </div>
          ) : null}
          {deposits && item.returnable && item.depositAmount ? (
            <div className="fact">
              <Recycle className="ic" />
              <dt>Deposit a bottle</dt>
              <dd>{usd(item.depositAmount)}</dd>
            </div>
          ) : null}
        </dl>
        <span className="grow" />
      </div>
      {shiftHere ? (
        <div className="hx-keys is-one">
          <button type="button" className="take-key" onClick={add}>
            <Plus className="ic" />
            Add it to the sale
            <span className="kbd on-primary" aria-hidden="true">
              ↵
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}
