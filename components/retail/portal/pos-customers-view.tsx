"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { User, Users } from "@/lib/icons";

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

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 text-sm font-semibold">
        <Users className="h-5 w-5 text-[var(--text-muted)]" />
        Customer directory
      </div>

      <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3">
          <Users className="h-4 w-4 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer by name, phone, or email"
            className="h-12 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        {search.trim().length < 2 ? (
          <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
            Type at least 2 characters to search customers.
          </div>
        ) : (query.data?.data ?? []).length === 0 ? (
          <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
            {query.isLoading ? "Searching customers..." : "No matching customers."}
          </div>
        ) : (
          <div className="space-y-2">
            {(query.data?.data ?? []).map((customer) => (
              <div
                key={customer.id}
                className="flex min-h-14 items-center justify-between gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] bg-[var(--surface-base)] text-[var(--text-muted)]">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{customer.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {[customer.phone, customer.email].filter(Boolean).join(" - ") ||
                        "No contacts"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">{customer.loyaltyPoints} pts</div>
                  <div className="text-xs text-[var(--text-muted)]">{customer.loyaltyTier}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
