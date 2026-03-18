"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Clock, Package, Payments, Wallet } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type CurrentShift = {
  id: string;
  shiftNo: string;
  siteId: string;
  registerName: string;
  cashierName: string;
  openingFloat: number;
  expectedCash: number;
  site: { id: string; name: string; code: string } | null;
};

type PosCatalogItem = {
  id: string;
  name: string;
  unitPrice: number;
  taxPercent: number;
  inventoryItemId: string;
  inventoryItem: { id: string; currentStock: number; unit: string } | null;
};

type HeldCart = {
  id: string;
  holdNo: string;
  label: string | null;
  cartSnapshot: {
    items?: CartItem[];
    customerName?: string;
  };
};

type CartItem = {
  id: string;
  name: string;
  catalogItemId: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
};

type TenderType = "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PosPortalContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [tenderType, setTenderType] = useState<TenderType>("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [holdDialog, setHoldDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [registerName, setRegisterName] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [holdLabel, setHoldLabel] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const sitesQuery = useQuery({ queryKey: ["pos-sites"], queryFn: fetchSites });
  const currentShiftQuery = useQuery({
    queryKey: ["retail-current-shift"],
    queryFn: () => fetchJson<{ data: CurrentShift | null }>("/api/v2/retail/pos/current-shift"),
  });
  const currentShift = currentShiftQuery.data?.data ?? null;
  const siteId = currentShift?.siteId || selectedSiteId;
  const catalogQuery = useQuery({
    queryKey: ["retail-pos-catalog", siteId, search],
    queryFn: () =>
      fetchJson<{ data: PosCatalogItem[] }>(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}&search=${encodeURIComponent(search)}`,
      ),
    enabled: Boolean(siteId),
  });
  const heldCartsQuery = useQuery({
    queryKey: ["retail-held-carts", currentShift?.id],
    queryFn: () =>
      fetchJson<{ data: HeldCart[] }>(
        `/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(currentShift?.id ?? "")}`,
      ),
    enabled: Boolean(currentShift?.id),
  });

  const {
    reservedId: shiftNo,
    isReserving: reservingShiftNo,
    error: reserveShiftError,
  } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openShiftDialog && Boolean(selectedSiteId),
    siteId: selectedSiteId || undefined,
  });

  const siteOptions = useMemo<SearchableOption[]>(
    () => (sitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sitesQuery.data],
  );

  const subTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const taxAmount = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + (item.unitPrice * item.quantity * item.taxPercent) / 100,
        0,
      ),
    [cart],
  );
  const total = Number((subTotal + taxAmount).toFixed(2));
  const change = Math.max(Number(amountTendered || "0") - total, 0);

  const openShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftNo: shiftNo || undefined,
          siteId: selectedSiteId,
          registerName,
          registerCode: registerCode.trim() || undefined,
          openingFloat: Number(openingFloat || 0),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setOpenShiftDialog(false);
      setOpeningFloat("0");
      setRegisterName("");
      setRegisterCode("");
    },
    onError: (error) => {
      toast({
        title: "Unable to open shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/shifts/${currentShift?.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          countedCash: Number(countedCash || 0),
          notes: closeNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift closed", variant: "success" });
      setCloseShiftDialog(false);
      setCountedCash("");
      setCloseNotes("");
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to close shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const holdCartMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/held-carts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          label: holdLabel.trim() || undefined,
          cartSnapshot: {
            items: cart,
            customerName,
          },
        }),
      }),
    onSuccess: () => {
      toast({ title: "Cart held", variant: "success" });
      setHoldDialog(false);
      setHoldLabel("");
      setCart([]);
      setCustomerName("");
      setAmountTendered("");
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to hold cart",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const saleMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/sales", {
        method: "POST",
        body: JSON.stringify({
          shiftId: currentShift?.id,
          siteId,
          customerName: customerName.trim() || undefined,
          items: cart.map((item) => ({
            catalogItemId: item.catalogItemId,
            quantity: item.quantity,
          })),
          payments: [
            {
              tenderType,
              amount: Number(amountTendered || 0),
            },
          ],
        }),
      }),
    onSuccess: () => {
      toast({ title: "Sale posted", variant: "success" });
      setCart([]);
      setCustomerName("");
      setAmountTendered("");
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to post sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const recallCart = (heldCart: HeldCart) => {
    setCart((heldCart.cartSnapshot.items ?? []).map((item) => ({ ...item })));
    setCustomerName(heldCart.cartSnapshot.customerName ?? "");
    setHoldDialog(false);
    void fetchJson(`/api/v2/retail/pos/held-carts/${heldCart.id}/recall`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
  };

  const addToCart = (item: PosCatalogItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.catalogItemId === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.catalogItemId === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          catalogItemId: item.id,
          quantity: 1,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
        },
      ];
    });
  };

  const updateQty = (catalogItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((entry) => entry.catalogItemId !== catalogItemId));
      return;
    }
    setCart((current) =>
      current.map((entry) =>
        entry.catalogItemId === catalogItemId ? { ...entry, quantity } : entry,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-1.5">
            <Clock className="h-4 w-4" />
            <span>{currentShift ? currentShift.shiftNo : "No open shift"}</span>
          </div>
          {currentShift ? (
            <>
              <div>{currentShift.site?.name ?? "Site"}</div>
              <div className="text-[var(--text-muted)]">{currentShift.registerName}</div>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!currentShift ? (
            <Button size="sm" onClick={() => setOpenShiftDialog(true)}>
              Open shift
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setHoldDialog(true)} disabled={cart.length === 0}>
                Hold
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCloseShiftDialog(true)}>
                Close shift
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_420px]">
        <section className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-muted)] px-3 py-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Scan or search item"
              className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="h-[calc(100vh-20rem)] overflow-auto rounded-2xl bg-[var(--surface-muted)] p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(catalogQuery.data?.data ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addToCart(item)}
                  className="rounded-2xl bg-[var(--surface-base)] p-3 text-left transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--text-strong)]">{item.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {(item.inventoryItem?.currentStock ?? 0).toFixed(2)} {item.inventoryItem?.unit ?? ""}
                      </div>
                    </div>
                    <Package className="h-4 w-4 text-[var(--text-muted)]" />
                  </div>
                  <div className="mt-4 font-mono text-lg font-semibold text-[var(--text-strong)]">
                    {money(item.unitPrice)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Current cart</div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs">
                <Payments className="h-4 w-4" />
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </div>
            </div>
            <div className="mt-3 space-y-3">
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer"
              />
              <div className="h-[320px] overflow-auto">
                <div className="space-y-2 pr-1">
                  {cart.length === 0 ? (
                    <div className="rounded-2xl bg-[var(--surface-base)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                      Add items to start checkout.
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.catalogItemId} className="rounded-2xl bg-[var(--surface-base)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-[var(--text-muted)]">{money(item.unitPrice)} each</div>
                          </div>
                          <NumericCell>{money(item.unitPrice * item.quantity)}</NumericCell>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-9 w-9 px-0" onClick={() => updateQty(item.catalogItemId, item.quantity - 1)}>-</Button>
                          <Input
                            value={String(item.quantity)}
                            onChange={(event) => updateQty(item.catalogItemId, Number(event.target.value || "0"))}
                            inputMode="numeric"
                            className="h-9 text-center"
                          />
                          <Button size="sm" variant="outline" className="h-9 w-9 px-0" onClick={() => updateQty(item.catalogItemId, item.quantity + 1)}>+</Button>
                          <Button size="sm" variant="outline" className="ml-auto" onClick={() => updateQty(item.catalogItemId, 0)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Subtotal</span>
                <span className="font-mono">{money(subTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Tax</span>
                <span className="font-mono">{money(taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-base font-semibold">
                <span>Total</span>
                <span className="font-mono">{money(total)}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <Select value={tenderType} onValueChange={(value) => setTenderType(value as TenderType)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="MOBILE_MONEY">Mobile money</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="VOUCHER">Voucher</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={amountTendered}
                onChange={(event) => setAmountTendered(event.target.value)}
                inputMode="decimal"
                placeholder="Amount tendered"
                className="h-11"
              />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Change</span>
                <span className="font-mono">{money(change)}</span>
              </div>
              <Button
                className="h-12 text-base"
                onClick={() => saleMutation.mutate()}
                disabled={!currentShift || cart.length === 0 || Number(amountTendered || "0") < total || saleMutation.isPending}
              >
                <Wallet className="h-4 w-4" />
                Complete sale
              </Button>
            </div>
          </div>

          {currentShift ? (
            <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
              <div className="text-sm font-medium">Held carts</div>
              <div className="mt-3 space-y-2">
                {(heldCartsQuery.data?.data ?? []).slice(0, 5).map((heldCart) => (
                  <button
                    key={heldCart.id}
                    type="button"
                    onClick={() => recallCart(heldCart)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-left"
                  >
                    <div>
                      <div className="font-medium">{heldCart.label || heldCart.holdNo}</div>
                      <div className="font-mono text-xs text-[var(--text-muted)]">{heldCart.holdNo}</div>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {(heldCart.cartSnapshot.items?.length ?? 0)} lines
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={openShiftDialog} onOpenChange={setOpenShiftDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open POS shift</DialogTitle>
            <DialogDescription>Pick site, till, and float.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Shift number</label>
              <Input value={shiftNo} readOnly disabled={reservingShiftNo} />
              <FieldHelp error={reserveShiftError ?? undefined} hint={reserveShiftError ? undefined : "Generated automatically."} />
            </div>
            <SearchableSelect
              label="Site"
              value={selectedSiteId}
              options={siteOptions}
              placeholder="Select site"
              onValueChange={setSelectedSiteId}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register name</label>
                <Input value={registerName} onChange={(event) => setRegisterName(event.target.value)} placeholder="Front till" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register code</label>
                <Input value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Opening float</label>
              <Input value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} inputMode="decimal" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenShiftDialog(false)}>Cancel</Button>
            <Button type="button" onClick={() => openShiftMutation.mutate()} disabled={openShiftMutation.isPending || !selectedSiteId || !registerName}>
              Open shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdDialog} onOpenChange={setHoldDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hold cart</DialogTitle>
            <DialogDescription>Save this basket to recall it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Label</label>
            <Input value={holdLabel} onChange={(event) => setHoldLabel(event.target.value)} placeholder="Counter pickup" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHoldDialog(false)}>Cancel</Button>
            <Button type="button" onClick={() => holdCartMutation.mutate()} disabled={holdCartMutation.isPending}>
              Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftDialog} onOpenChange={setCloseShiftDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
            <DialogDescription>{currentShift?.shiftNo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Expected cash</span>
                <span className="font-mono">{money(currentShift?.expectedCash ?? 0)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Counted cash</label>
              <Input value={countedCash} onChange={(event) => setCountedCash(event.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseShiftDialog(false)}>Cancel</Button>
            <Button type="button" onClick={() => closeShiftMutation.mutate()} disabled={closeShiftMutation.isPending}>
              Close shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
