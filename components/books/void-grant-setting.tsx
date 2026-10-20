"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Kit, Person } from "@/components/core";
import { SectionHeading } from "@/components/management/ui/section-heading";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";

/** One person's "May void and revise posted documents" (`/api/books/core/grants?userId=`). */
type VoidGrant = { userId: string; holds: boolean; grantable: boolean; by: { id: string; name: string | null; image: string | null } | null; at: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Granting void and revise (books-final §2.3; BooksWho, `who_grant`): on a
 * manager's or the accountant's page in Management → Users, the owner ticks
 * "May void and revise posted documents" (the capability `books.void`).
 * Nobody has it by default. Only the owner sees it: the server answers
 * anyone else with 403, and the section does not show. It never covers
 * permanent delete, reopening a month or a filed VAT return.
 */
export function VoidGrantSetting({ userId, name }: { userId: string; name: string }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const key = ["books", "void-grant", userId];
  const grant = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<VoidGrant>(`/api/books/core/grants?userId=${encodeURIComponent(userId)}`),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 403 || error.status === 404)) && count < 2,
  });
  const change = useMutation({
    mutationFn: (allowed: boolean) => fetchJson("/api/books/core/grants", { method: "POST", body: JSON.stringify({ userId, allowed }) }),
    onSuccess: async (_saved, allowed) => {
      toast({ title: allowed ? `${name} may void and revise posted documents` : `${name} may no longer void or revise`, variant: "success" });
      await client.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast({ title: "Nothing was changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const data = grant.data;
  // Only the owner sees it, and only for someone it can be given to (or who still holds it).
  if (!data || (!data.grantable && !data.holds)) return null;
  const by = data.by?.name ?? null;
  return (
    <>
      <SectionHeading>Books</SectionHeading>
      <Kit style={{ maxWidth: 470, marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 0", boxShadow: "inset 0 1px 0 var(--color-line), inset 0 -1px 0 var(--color-line)" }}>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: change.isPending ? "progress" : "pointer" }}>
            <input
              type="checkbox"
              checked={data.holds}
              disabled={change.isPending || (!data.grantable && !data.holds)}
              onChange={(event) => change.mutate(event.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, flex: "none", accentColor: "var(--color-ink)" }}
            />
            <span>
              <b style={{ fontWeight: 500, color: "var(--color-ink)" }}>May void and revise posted documents</b>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 13, lineHeight: 1.5, color: "var(--color-ink-2)", marginTop: 2 }}>
                {data.holds && by && data.at ? (
                  <>
                    Granted by <Person name={by} src={data.by?.image ?? null} /> on {day(data.at)}.
                  </>
                ) : data.holds ? (
                  "Granted."
                ) : (
                  "Only the owner voids and revises until you tick this."
                )}{" "}
                Stored as the capability <span className="mono">books.void</span>.
              </span>
            </span>
          </label>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--color-muted)" }}>Never covers: permanent delete of posted records, reopening a month, changing a filed VAT return.</p>
        </div>
      </Kit>
    </>
  );
}
