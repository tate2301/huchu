"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export function PosPortalContent() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (item: Omit<CartItem, "quantity">) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => setCart([]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pos-search">Search items</Label>
                <Input
                  id="pos-search"
                  placeholder="Search by name or barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Connect to your thrift store catalog to browse items. Use the
                search bar to find products by name or scan a barcode.
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { id: "sample-1", name: "Sample Item A", price: 5.0 },
                  { id: "sample-2", name: "Sample Item B", price: 12.5 },
                  { id: "sample-3", name: "Sample Item C", price: 8.0 },
                ].map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => addToCart(item)}
                  >
                    <CardContent className="p-3">
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        ${item.price.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Cart</span>
              <Badge variant="secondary">{cart.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Cart is empty. Click items to add them.
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity} × ${item.price.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <NumericCell>
                        ${(item.price * item.quantity).toFixed(2)}
                      </NumericCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="font-mono">${total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={clearCart}>
                    Clear
                  </Button>
                  <Button className="flex-1">Checkout</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
