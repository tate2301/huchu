# App brief: the Tender till

Assumptions made without asking:

- The project folder is `docs/design/till/`, not `app/`: in this repository `app/` is the Next.js
  router, and a design folder there would sit among routes.
- Icons are Phosphor at the fill weight, because `lib/icons.ts` already ships Phosphor. The
  plugin's default (MingCute) would be a second family in the product.
- Figures (money, references, times) use IBM Plex Mono as the second family with a fixed job, as the
  Corelith Workspace design system already does. Every word is Atkinson Hyperlegible Next.
- Mobile money is named generically with a neutral glyph: no EcoCash mark is to hand. Card shows the
  real Visa and Mastercard marks.
- Manager approval stays the manager's password and a reason. The code refuses a PIN for it
  (`lib/retail/till-pin.ts`), and the design keeps that rule.

## The idea

A device a manager has made into a till, where a cashier says who they are with a PIN and sells.

## People

| Role | Buys or uses | Device and conditions | Opens the app to |
|---|---|---|---|
| Cashier | Uses | CounterMini at the counter, a Kora handheld, or a browser; a queue waiting, power and connection that drop | Sell, give change, put a sale aside, close the shift |
| Shop manager | Uses and decides | The same till, standing beside the cashier; the back office on a laptop | Approve a discount, refund or void; pair a device; take the end-of-day report |
| Owner | Buys | The back office at home in the evening | Read the day; see who was short |

## Jobs, most frequent first

1. Ring up a sale and take cash, with change.
2. Take card or mobile money, with the reference.
3. Put a sale aside and pick it up again.
4. Find a sale and print it again, refund part of it, or void it, with a manager.
5. Open the shift with a float; move cash to the safe; count the drawer and close.
6. Pair a new device; choose your own PIN in place of the one you were sent.

The most frequent job decides the home screen: the till opens on the sale.

## Scope

- Kind of work: redesign of the POS portal, plus pairing and PIN sign-in, which are new.
- In: every screen at the POS address, for a general shop and a liquor store, at counter and phone width.
- Out: the back office (`Corelith data tables` canvas), the customer-facing screen.
- Already shipping: `app/portal/pos/**`, `components/retail/portal/**`, `app/api/v2/retail/pos/**`.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind with the Corelith design tokens |
| Component library | Own components in `components/ui` and `components/retail/portal` |
| Icons | Phosphor, fill weight (`lib/icons.ts`) |
| Data layer | Prisma on Postgres; TanStack Query with IndexedDB persistence for offline |
| Deploys to | Vercel; the till on `pos.<shop>.<root domain>` |

## Constraints

- Connection: drops for minutes at a time. Cash sales queue and send later; shifts, refunds, voids
  and cash moves need the line.
- Regulation: ZIMRA fiscalisation of receipts; VAT at 15.5% from 1 January 2026, with basic foods
  zero-rated. Liquor licences fix trading hours and need an 18+ line on receipts.
- Languages and currencies: British English. The till sells in the company's base currency, US$.
- Hardware: CounterMini (1280 × 800 touch), Kora (390 × 844), any browser; receipt printer, drawer, scanner.
- Dates: Africa/Harare. Today in the world is Saturday 3 October 2026.

## Where the work happens

Both. Screens on the "Tender till" canvas (https://claude.ai/artifact/1Rq7Z44C2cQoHBWpddbo2y);
built from there in this repository (`pnpm dev`, the POS host with `?__tenant=`).

## From the brand

- Accent, typeface, mark: Tender orange `#B84A0C` under white text; Atkinson Hyperlegible Next;
  the Tender mark on device ink.
- Rules carried over: orange once per screen, warm ink never black, money in mono as the till prints it.
