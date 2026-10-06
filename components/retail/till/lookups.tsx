"use client";

/**
 * The lookups beside the sale: customers and price check. Neither changes the
 * sale or the stock until someone presses the one button that says so.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Barcode, MagnifyingGlass, Plus, ShoppingCart, Tag, Users } from "@/lib/icons";
import { LOYALTY_REDEEM_POINTS_PER_USD } from "@/lib/retail/loyalty-rules";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { count, firstName, qty, usd, whole } from "./format";
import { Avatar, Empty } from "./parts";
import { useTill } from "./state";
import { ProductPreview } from "./tile";
import type { CustomerLookupResult, PosCatalogItem } from "./types";

const TIER: Record<string, string> = { BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold" };
const NEXT_TIER: Record<string, [string, number] | null> = { BRONZE: ["Silver", 500], SILVER: ["Gold", 2000], GOLD: null };

function useTyped(delay = 250) {
  const [typed, setTyped] = React.useState("");
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setValue(typed.trim()), delay);
    return () => window.clearTimeout(timer);
  }, [typed, delay]);
  return { typed, setTyped, value };
}

/* ─── Customers ──────────────────────────────────────────────────────── */

export function CustomersScreen() {
  const router = useRouter();
  const { selectCustomer, isPosHost } = useTill();
  const search = useTyped();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const query = useQuery({
    queryKey: ["retail-pos-customer-search", search.value],
    enabled: search.value.length >= 2,
    queryFn: () => fetchJson<{ data: CustomerLookupResult[] }>(`/api/v2/retail/customers/search?q=${encodeURIComponent(search.value)}&limit=30`),
  });
  const rows = query.data?.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const next = selected ? NEXT_TIER[selected.loyaltyTier] : null;

  return (
    <div className="with-rail">
      <main className="main is-fixed">
        <div className="bar">
          <h1>Customers</h1>
          <div className="end">
            <label className="input-wrap is-search">
              <MagnifyingGlass className="ic" />
              <input type="search" aria-label="Search customers" placeholder="Name or phone" autoComplete="off" autoFocus value={search.typed} onChange={(event) => search.setTyped(event.target.value)} />
            </label>
          </div>
        </div>
        {search.value.length < 2 ? (
          <Empty icon={Users} title="Find a customer">
            Two letters of a name, or the start of a phone number.
          </Empty>
        ) : query.isLoading ? (
          <div className="finding" aria-busy="true">
            <span className="skeleton is-line" />
          </div>
        ) : query.isError ? (
          <Empty icon={Users} title="Customers did not load">
            {getApiErrorMessage(query.error)}
          </Empty>
        ) : !rows.length ? (
          <Empty icon={Users} title={`No customer matches “${search.value}”`}>
            Add them from the till with Add customer, while their sale is on it.
          </Empty>
        ) : (
          <div className="table-shell">
            <div className="table-scroll">
              <div className="list">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="row is-person"
                    aria-current={row.id === selected?.id || undefined}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <Avatar name={row.name} />
                    <span className="truncate">
                      <span className="ink">{row.name}</span> <span className="muted num">{row.phone ?? ""}</span>
                    </span>
                    <span className="muted">{TIER[row.loyaltyTier] ?? row.loyaltyTier}</span>
                    <span className="num">{whole(row.loyaltyPoints)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="table-foot">
              <div className="foot-row">
                <span className="num text-left">
                  {rows.length} {rows.length === 1 ? "customer matches" : "customers match"} “{search.value}”
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
      <aside className="rail" aria-label={selected?.name ?? "Customer"}>
        {selected ? (
          <>
            <section>
              <div className="who-head">
                <Avatar name={selected.name} size={40} />
                <div>
                  <div className="title-16">{selected.name}</div>
                  <div className="note num text-left">
                    {selected.phone ?? selected.email ?? ""}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={() => {
                  selectCustomer(selected);
                  router.push(getPosPortalHref("checkout", isPosHost));
                }}
              >
                <ShoppingCart className="ic" />
                Start a sale for {firstName(selected.name)}
              </button>
            </section>
            <section>
              <div className="sec-title">Points</div>
              <div className="figure">{whole(selected.loyaltyPoints)}</div>
              <dl className="attrs">
                <dt>Worth</dt>
                <dd className="num text-left">
                  {usd(selected.loyaltyPoints / LOYALTY_REDEEM_POINTS_PER_USD)}
                </dd>
                <dt>Tier</dt>
                <dd>
                  {TIER[selected.loyaltyTier] ?? selected.loyaltyTier}
                  {next ? `, ${whole(next[1] - selected.loyaltyPoints)} to ${next[0]}` : ""}
                </dd>
              </dl>
            </section>
            <section>
              <p className="help">Details and merging are changed in the back office.</p>
            </section>
          </>
        ) : null}
      </aside>
    </div>
  );
}

/* ─── Price check ────────────────────────────────────────────────────── */

/** What an 18+ line asks of the till here, by the shop's switches; a device not yet a till does not know them. */
function ageWords(features: ReturnType<typeof useTill>["features"], sellableNow: boolean) {
  if (features && !sellableNow) return "Not now: outside the licence hours";
  const id = !features || features.ageCheck;
  const hours = !features || features.licenceHours;
  return id && hours ? "Ask for ID, and only in licence hours" : id ? "Ask for ID" : hours ? "Only in licence hours" : "For people 18 or over";
}

export function PriceCheckScreen() {
  const router = useRouter();
  const { addToCart, alcohol, context, features, isPosHost, shiftHere } = useTill();
  const search = useTyped(150);
  // The device fixes the site: the till's own shelf.
  const siteId = context?.site.id ?? null;
  const query = useQuery({
    queryKey: ["retail-pos-price-check", siteId, search.value],
    enabled: search.value.length >= 1,
    queryFn: () => fetchJson<{ data: PosCatalogItem[] }>(`/api/v2/retail/pos/catalog?search=${encodeURIComponent(search.value)}`),
  });
  const rows = query.data?.data ?? [];
  const item = rows[0] ?? null;
  const others = rows.slice(1, 4);
  const stock = item?.inventoryItem?.currentStock ?? 0;
  const site = context?.site.name ?? "this shop";
  const deposits = features ? features.emptiesAndDeposits : true;

  return (
    <div className="main is-scroll">
      <div className="bar">
        <h1>Price check</h1>
      </div>
      <div className="tools">
        <label className="input-wrap input-lg grow">
          <Barcode className="ic" />
          <input type="search" aria-label="Scan or search products" placeholder="Scan a barcode or type a product" autoComplete="off" autoFocus value={search.typed} onChange={(event) => search.setTyped(event.target.value)} />
        </label>
      </div>
      {!search.value ? (
        <Empty icon={Tag} title="Scan it, or type its name">
          Price check never changes the sale or the stock.
        </Empty>
      ) : query.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-lede" />
        </div>
      ) : query.isError ? (
        <Empty icon={Tag} title="Prices did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
      ) : !item ? (
        <Empty icon={Tag} title={`No product called “${search.value}”`}>
          Check the spelling or scan the barcode.
        </Empty>
      ) : (
        <div className="page">
          <div className="side-by-side">
            <span className="tile is-preview" aria-hidden="true">
              <ProductPreview name={item.name} imageUrl={item.imageUrl} />
            </span>
            <p className="lede-figure">
              {item.name} is <span className="num">{usd(item.unitPrice)}</span>.{" "}
              <span className="q">
                {stock <= 0 && item.openableCase
                  ? `None loose at ${site}; ${count(item.openableCase.casesOnHand, "case")} of ${item.openableCase.unitsPerCase} to open.`
                  : `${qty(stock)} left at ${site}.`}
              </span>
            </p>
          </div>
          <dl className="attrs">
            <dt>{item.barcode ? "Barcode" : "Code"}</dt>
            <dd className="num text-left">{item.barcode ?? item.sku}</dd>
            <dt>VAT</dt>
            <dd>{item.taxPercent ? `${item.taxInclusive ? "Included" : "Added"} at ${item.taxPercent}%` : "None"}</dd>
            {item.ageRestricted ? (
              <>
                <dt>18+</dt>
                <dd>{ageWords(features, alcohol.sellable)}</dd>
              </>
            ) : null}
            {deposits && item.returnable && item.depositAmount ? (
              <>
                <dt>Deposit</dt>
                <dd className="num text-left">
                  {usd(item.depositAmount)} a bottle
                </dd>
              </>
            ) : null}
            {others.length ? (
              <>
                <dt>Also</dt>
                <dd>{others.map((other) => `${other.name} ${usd(other.unitPrice)}`).join(" · ")}</dd>
              </>
            ) : null}
          </dl>
          {shiftHere ? (
            <div>
              <button
                type="button"
                className="btn btn-lg"
                onClick={() => {
                  addToCart(item);
                  router.push(getPosPortalHref("checkout", isPosHost));
                }}
              >
                <Plus className="ic" />
                Add it to the sale
              </button>
            </div>
          ) : null}
          <p className="help">Price check never changes the sale or the stock.</p>
        </div>
      )}
    </div>
  );
}
