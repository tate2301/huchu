"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { Search, User, Users } from "@/lib/icons";
import {
  PosEmptyState,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";

type CustomerLookupResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
};

export function PosCustomersView() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["retail-pos-customers", search],
    queryFn: () =>
      fetchJson<{ data: CustomerLookupResult[] }>(
        `/api/v2/retail/customers/search?q=${encodeURIComponent(search.trim())}&limit=40`,
      ),
    enabled: search.trim().length >= 2,
  });

  const customers = query.data?.data ?? [];

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Customer utility"
          title="Customer directory"
          description="This stays a fast lookup surface for leads and exceptions, while checkout handles most customer attachment inline."
        />

        <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-3 rounded-[1rem] border border-[var(--border-subtle)] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--action-primary-bg)]">
              <Search className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Search
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, phone, or email"
                className="mt-1 h-11 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>
      </PosPanel>

      <PosPanel className="min-h-0">
        <PosPanelHeader
          eyebrow="Results"
          title="Customer matches"
          description="Show the essentials only: identity, contact, and loyalty context."
        />

        <div className="h-full min-h-0 overflow-y-auto pr-1">
          {search.trim().length < 2 ? (
            <PosEmptyState
              icon={Users}
              title="Start with at least 2 characters"
              description="Type a name, phone number, or email address to pull customer matches into this directory."
            />
          ) : customers.length === 0 ? (
            <PosEmptyState
              icon={User}
              title="No matching customers"
              description={
                query.isLoading
                  ? "Searching customer records now."
                  : "There are no customer records matching that search yet."
              }
            />
          ) : (
            <div className="space-y-3">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-[1.2rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--action-primary-bg)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-[var(--text-strong)]">
                        {customer.name}
                      </div>
                      <div className="mt-1 truncate text-sm text-[var(--text-muted)]">
                        {[customer.phone, customer.email].filter(Boolean).join(" / ") ||
                          "No contact details"}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex justify-end">
                      <PosStatusPill tone="brand">{customer.loyaltyTier}</PosStatusPill>
                    </div>
                    <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                      {customer.loyaltyPoints} pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PosPanel>
    </div>
  );
}
