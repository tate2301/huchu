# R-4.5 — retail lists on a phone

Taken at 375×812 against the `acme` demo tenant. Throwaway spec, same reasoning
as `../r43/README.md`.

| Shot | What it shows |
|---|---|
| `stock.png` | The low-stock watchlist as cards — **and the fix**. Before it, this list carried eight lines including ones well above their reorder point; now it carries the one the seed actually puts under it. |
| `catalog.png` | The range as cards: name, SKU, status badge, then shelf price, on-hand and tax rate as pills |
| `customers.png` | Spend, visits and loyalty points per customer |

## The bug the phone found

`Decimal <= Decimal` is a **string** comparison. `new Decimal(14) <= new
Decimal(6)` is `true`, because `"14" <= "6"` is. TypeScript allows relational
operators between two values of the same object type, so nothing complained.

S-1 moved `InventoryItem.currentStock` and `minStock` off `Float`, and four
low-stock filters written as `currentStock <= minStock` silently became
lexicographic. Typecheck, seven hundred unit tests and a desktop screenshot all
passed over it. What gave it away was a card reading **"Amarula Cream 750ml ·
14.00 bottle · 6.00 bottle · −8.00 bottle short"** — a line described as short
while holding more than twice its reorder point.

`atMost` and `atLeast` in `lib/money.ts` are the fix, and
`lib/money.test.ts` pins the trap by asserting the wrong answer as well as the
right one.
