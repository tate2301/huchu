"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CartItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

type TenderType = "CASH" | "CARD" | "MOBILE_MONEY";

type PostedSale = {
  id: string;
  saleNo: string;
  postedAt: string;
  total: number;
  tenderType: TenderType;
  itemCount: number;
};

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PosPortalContent() {
  const [shiftOpen, setShiftOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickQty, setQuickQty] = useState("1");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tenderType, setTenderType] = useState<TenderType>("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [postedSales, setPostedSales] = useState<PostedSale[]>([]);

  const subTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );
  const tendered = Number(amountTendered || "0");
  const change = Math.max(tendered - subTotal, 0);

  const addQuickItem = () => {
    const name = quickName.trim();
    const price = Number(quickPrice);
    const quantity = Math.max(1, Number(quickQty || "1"));
    if (!name || !Number.isFinite(price) || price <= 0) return;

    const id = `${name.toLowerCase()}-${price.toFixed(2)}`;
    setCart((previous) => {
      const existing = previous.find((item) => item.id === id);
      if (existing) {
        return previous.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [...previous, { id, name, unitPrice: price, quantity }];
    });
    setQuickName("");
    setQuickPrice("");
    setQuickQty("1");
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((previous) => previous.filter((item) => item.id !== id));
      return;
    }
    setCart((previous) =>
      previous.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const clearCart = () => {
    setCart([]);
    setAmountTendered("");
  };

  const checkout = () => {
    if (!shiftOpen || cart.length === 0) return;
    if (tenderType === "CASH" && tendered < subTotal) return;
    const saleNo = `POS-${String(postedSales.length + 1).padStart(5, "0")}`;
    const posted: PostedSale = {
      id: crypto.randomUUID(),
      saleNo,
      postedAt: new Date().toISOString(),
      total: subTotal,
      tenderType,
      itemCount,
    };
    setPostedSales((previous) => [posted, ...previous]);
    clearCart();
  };

  const cashSalesTotal = postedSales
    .filter((sale) => sale.tenderType === "CASH")
    .reduce((sum, sale) => sum + sale.total, 0);
  const cardSalesTotal = postedSales
    .filter((sale) => sale.tenderType === "CARD")
    .reduce((sum, sale) => sum + sale.total, 0);
  const mobileSalesTotal = postedSales
    .filter((sale) => sale.tenderType === "MOBILE_MONEY")
    .reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Shift Control</span>
              <Badge variant={shiftOpen ? "secondary" : "outline"}>
                {shiftOpen ? "Shift Open" : "Shift Closed"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="opening-float">Opening Float</Label>
              <Input
                id="opening-float"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShiftOpen(false)}
              disabled={!shiftOpen}
            >
              Close Shift
            </Button>
            <Button onClick={() => setShiftOpen(true)} disabled={shiftOpen}>
              Open Shift
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Sell Entry</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1.2fr_0.6fr_0.4fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="quick-name">Item Name</Label>
              <Input
                id="quick-name"
                placeholder="e.g. School Shoes"
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
                disabled={!shiftOpen}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-price">Unit Price</Label>
              <Input
                id="quick-price"
                placeholder="0.00"
                value={quickPrice}
                onChange={(event) => setQuickPrice(event.target.value)}
                inputMode="decimal"
                disabled={!shiftOpen}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-qty">Qty</Label>
              <Input
                id="quick-qty"
                value={quickQty}
                onChange={(event) => setQuickQty(event.target.value)}
                inputMode="numeric"
                disabled={!shiftOpen}
              />
            </div>
            <Button onClick={addQuickItem} disabled={!shiftOpen}>
              Add Item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Cart Lines</span>
              <Badge variant="outline">{itemCount} units</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lines yet. Add quick sell entries to build the basket.
              </p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.4fr_0.6fr_0.5fr_0.6fr_auto] md:items-center">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Unit: ${money(item.unitPrice)}
                    </p>
                  </div>
                  <NumericCell>${money(item.unitPrice)}</NumericCell>
                  <Input
                    value={String(item.quantity)}
                    onChange={(event) =>
                      updateQuantity(item.id, Math.max(0, Number(event.target.value || "0")))
                    }
                    inputMode="numeric"
                    className="h-8"
                  />
                  <NumericCell>${money(item.unitPrice * item.quantity)}</NumericCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateQuantity(item.id, 0)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tender Type</Label>
              <Select
                value={tenderType}
                onValueChange={(value) => setTenderType(value as TenderType)}
                disabled={!shiftOpen}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount-tendered">Amount Tendered</Label>
              <Input
                id="amount-tendered"
                value={amountTendered}
                onChange={(event) => setAmountTendered(event.target.value)}
                inputMode="decimal"
                disabled={!shiftOpen}
              />
            </div>
            <div className="space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between text-sm">
                <span>Subtotal</span>
                <NumericCell>${money(subTotal)}</NumericCell>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Change</span>
                <NumericCell>${money(change)}</NumericCell>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearCart} disabled={cart.length === 0}>
                Clear Basket
              </Button>
              <Button
                onClick={checkout}
                disabled={
                  !shiftOpen ||
                  cart.length === 0 ||
                  (tenderType === "CASH" && tendered < subTotal)
                }
              >
                Post Sale
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shift Reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Opening Float</span>
              <NumericCell>${money(Number(openingFloat || "0"))}</NumericCell>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Cash Sales</span>
              <NumericCell>${money(cashSalesTotal)}</NumericCell>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Card Sales</span>
              <NumericCell>${money(cardSalesTotal)}</NumericCell>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Mobile Money Sales</span>
              <NumericCell>${money(mobileSalesTotal)}</NumericCell>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Posted Sales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {postedSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posted sales in this session yet.</p>
            ) : (
              postedSales.slice(0, 8).map((sale) => (
                <div key={sale.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{sale.saleNo}</span>
                    <NumericCell>${money(sale.total)}</NumericCell>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sale.tenderType} | {sale.itemCount} items | {new Date(sale.postedAt).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

