/**
 * The till's shapes, as the server sends them and as the screens hold them.
 *
 * Type-only imports from server modules (`devices`, `shelf-listing`, the POS
 * routes' `_cases`, `fiscalisation`) are erased at build, so none of that code
 * reaches the till's bundle; they keep the two halves on one contract.
 */

import type { RetailTenderType } from "@prisma/client";

import type { CaseOf, OpenableCase } from "@/app/api/v2/retail/pos/_cases";
import type { TillFiscalStatus } from "@/lib/retail/fiscalisation";
import type { PriceBreak } from "@/lib/retail/pricing/engine";
import type { ChangeSplit, TenderCurrency } from "@/lib/retail/payment-words";
import type { ShelfListing } from "@/lib/retail/shelf-listing";

/** What the till knows about itself, from `devices/me`: its till, site, shop, tenders, ZiG rate, rules, receipts, approvers and licence hours. */
export type { TillContext, TillMessage } from "@/lib/retail/devices";
/** The till rules as the till reads them (SET-06). */
export type { TillRulesForTill } from "@/lib/retail/till-rules";
export type { AlcoholVerdict, LicenceWindow } from "@/lib/retail/licence-hours";
export type { ChangeSplit, TenderCurrency, TillTender } from "@/lib/retail/payment-words";

export type TenderType = RetailTenderType;

/** One way the customer pays. `amount` is in the payment's own money: ZiG for ZiG cash. */
export type PaymentRow = {
  tenderType: TenderType;
  amount: string;
  reference: string;
  /** Only ZiG cash says ZWG; anything else is in the sale's money. */
  currency?: TenderCurrency;
  /** A VOUCHER payment: the voucher's code and secret, checked online first (PRD-10). */
  voucherCode?: string;
  voucherSecret?: string;
};

/** A gift voucher bought in this sale (PRD-10): its value ("10.00"), and who it is for. Outside the goods total. */
export type VoucherSold = { key: string; value: string; customerId?: string; customerName?: string };

/** A discount voucher on the sale, checked online: what it takes off after the promotions. */
export type DiscountVoucher = { code: string; secret: string; percentOff: number | null; amountOff: number | null; label: string };

/**
 * One product on the shelf, as `pos/catalog` sends it: the till's offline
 * snapshot of its own site, most sold first. `inventoryItem.reorderLevel` is the
 * stock row's `minStock` (price check's "the reorder level is 6").
 */
export type PosCatalogItem = ShelfListing & {
  /** The case this single comes in, while the shop sells cases and singles. */
  openableCase: OpenableCase | null;
  /** When this product is a case: the single it holds, and how many. */
  caseOf: CaseOf | null;
  /** The price before a cut on the default list in the last 60 days; struck through on the tile. */
  wasPrice: number | null;
  /** From this many, this price (volume breaks), lowest quantity first; `unitPrice` is the price of one. */
  priceBreaks: PriceBreak[];
  /** What the shop calls this deposit ("Bottles, 340 to 375ml"); null when unnamed or none. */
  depositName: string | null;
};

/**
 * A line on the sale. `catalogItemId` is the product's id; `id` is the line's
 * own: the product's id, or `<bundleRef>:<product>` for a bundle's component.
 */
export type CartItem = {
  id: string;
  name: string;
  catalogItemId: string;
  /** The shop's category ("Spirits"), for the ID check's sentence. */
  category: string | null;
  quantity: number;
  unitPrice: number;
  /** What the shelf says at this quantity; a different `unitPrice` is a change the till rules may send to a manager. */
  shelfPrice: number;
  /** The shelf price of one, and its volume breaks: `shelfPrice` follows the quantity through them. */
  priceOfOne: number;
  priceBreaks: PriceBreak[];
  /** Sold at whatever the cashier types (airtime): the typed price is the shelf price, never a change. */
  openPrice: boolean;
  taxPercent: number;
  taxInclusive: boolean;
  lineDiscountAmount: number;
  unit?: string;
  stock?: number;
  /** For people 18 or over: the product's own answer, else its category's. */
  ageRestricted: boolean;
  /** A returnable bottle and its deposit, while the shop charges deposits. */
  returnable: boolean;
  depositAmount: number | null;
  /** What the shop calls this deposit ("Bottles, 340 to 375ml"), or null. */
  depositName: string | null;
  /** Empties the customer brought back against this line: whole bottles, at most the line's quantity. */
  emptiesBack: number;
  /** The most off this product, as a percentage of its shelf price; null is no limit. */
  maxDiscountPercent: number | null;
  openableCase: OpenableCase | null;
  /** The price list the shelf price comes off when it is not the till's own ("Happy hour"); set by the engine. */
  listName?: string | null;
  /** A fixed set rung as one (PRD-08): the bundle, and the till's key shared by its component lines. */
  bundleId?: string | null;
  bundleRef?: string | null;
  bundleName?: string | null;
};

/** The person's open shift on this till, from `pos/current-shift`. */
export type CurrentShift = {
  id: string;
  shiftNo: string;
  siteId: string;
  registerId: string;
  registerCode: string;
  registerName: string;
  openedAt: string;
  openingFloat: number;
  /** What the drawer should hold now, in `baseCurrency`. The cash drop prompt reads it. */
  expectedCash: number;
  /** The float the close leaves by default, "100.00": the till's last close's, else this shift's opening float. */
  floatLeft: string;
  baseCurrency: string;
  actorRole: string;
  netSalesValue: number;
  refundValue: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  cashSales: number;
  nonCashSales: number;
  /** What each non-cash way of paying took this shift, in `baseCurrency`, refunds and voids netted off. */
  nonCashByTender: Record<Exclude<TenderType, "CASH" | "LAYBY">, number>;
  site: { id: string; name: string; code: string } | null;
};

export type HeldCart = {
  id: string;
  holdNo: string;
  label: string | null;
  createdAt: string;
  shiftId: string;
  cashierId: string | null;
  cartSnapshot: {
    items?: CartItem[];
    customerName?: string;
    orderDiscountAmount?: string;
  };
};

/** A manager's PIN at this till (C-31): who approves, and their four digits. Never queued offline. */
export type Approver = { userId: string; pin: string };

/** Why `pos/sales` did not take the sale: anything the server said no to (a manager asked for is the approval dialog's), or the offline window has closed. The sale stays on the till. */
export type SaleRefusal = { kind: "refused"; message: string };

/** A sale `pos/sales` took, as it answers. Money is in the sale's currency. */
export type CompletedSale = {
  id: string;
  saleNo: string;
  customerName: string | null;
  /** The goods, after discounts. */
  totalAmount: number;
  /** Bottle deposits on top of the goods, net of empties back. */
  depositAmount: number;
  tenderedAmount: number;
  changeAmount: number;
  /** The change as it is handed back (W-05): whole US dollars, then ZiG notes. */
  changeUsd: number;
  changeZig: number;
  postedAt: string;
  payments: Array<{ tenderType: TenderType; amount: number; currency: string | null; reference: string | null }>;
  loyalty: { pointsEarned: number; pointsRedeemed?: number; pointsBalance: number; tier: string } | null;
  fiscal: TillFiscalStatus | null;
  /** The hold this sale was recalled from, as the receipt names it. Set by the till. */
  heldAs?: string | null;
  /** Gift vouchers bought in it, outside `totalAmount` (PRD-10). */
  vouchersSoldAmount?: number;
  /** Each gift voucher it sold, with its secret, to print on the receipt. */
  vouchersSold?: Array<{ id: string; code: string; secret: string; value: string; expiresOn: string }>;
};

/** A sale the till could not send, kept in its offline queue until the line is back. */
export type SavedSale = {
  /** A short tag off the sale's key: the number comes when it is sent. */
  tag: string;
  /** Goods and deposits together. */
  total: number;
  /** Cash handed over, in US dollars. */
  handed: number;
  change: ChangeSplit;
  at: string;
};

/** A customer as the till holds them: `GET /api/v2/retail/pos/customers` (CUS-02). */
export type { PosCustomer } from "@/lib/retail/customers/pos-customer";

/** A category chip above the shelf. `allAgeRestricted`: everything in it stops with the licence hours. */
export type TillCategory = { name: string; allAgeRestricted: boolean };
