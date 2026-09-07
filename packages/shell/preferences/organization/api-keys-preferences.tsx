"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, Field, Input } from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A workspace's API keys: mint one against the features the workspace holds,
 * read the plaintext once, revoke it when it is done. The scopes offered are
 * the session's enabled features, which is the same list the sidebar is built
 * from, so a key can never be given more than the workspace has.
 */
export function ApiKeysPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const enabledFeatures = React.useMemo(
    () => [...((session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures ?? [])].sort(),
    [session],
  );

  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState("");
  const [revealed, setRevealed] = React.useState<{ name: string; key: string } | null>(null);

  const keysQuery = useQuery({
    queryKey: ["preferences", "organization", "api-keys"],
    queryFn: () => fetchJson<{ data: ApiKeyRow[] }>("/api/v2/api-keys"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; scopes: string[] }) =>
      fetchJson<{ data: ApiKeyRow & { key: string } }>("/api/v2/api-keys", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => {
      setRevealed({ name: result.data.name, key: result.data.key });
      setName("");
      setScopes([]);
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "api-keys"] });
    },
    onError: (error) => toast({ title: "Could not create the key", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => fetchJson<{ data: { id: string } }>(`/api/v2/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Key revoked" });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "api-keys"] });
    },
    onError: (error) => toast({ title: "Could not revoke the key", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  async function revoke(row: ApiKeyRow) {
    const confirmed = await dsConfirm({
      title: "Revoke API key",
      description: `${row.name} (${row.keyPrefix}…) stops working at once; the row stays for the audit.`,
      variant: "warning",
      confirmLabel: "Revoke",
    });
    if (confirmed) revokeMutation.mutate(row.id);
  }

  const visibleFeatures = enabledFeatures.filter((key) => !filter || key.includes(filter.trim().toLowerCase()));
  const rows = keysQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      {revealed ? (
        <Alert tone="success" title={`Key created: ${revealed.name}`}>
          <p className="text-sm">Copy it now. It is shown once and cannot be recovered.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm">{revealed.key}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.key);
                toast({ title: "Copied" });
              }}
            >
              Copy
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || scopes.length === 0) {
            toast({ title: "A name and at least one scope are required", variant: "destructive" });
            return;
          }
          createMutation.mutate({ name: name.trim(), scopes });
        }}
      >
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Warehouse sync" required />
        </Field>
        <Field label="Scopes" required>
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter features…" />
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded border border-border p-2">
            {visibleFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No features match.</p>
            ) : (
              visibleFeatures.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(key)}
                    onChange={(event) =>
                      setScopes((current) => (event.target.checked ? [...current, key] : current.filter((item) => item !== key)))
                    }
                  />
                  <span>{key}</span>
                </label>
              ))
            )}
          </div>
        </Field>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "Create key"}
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Prefix</th>
              <th className="py-2 pr-4 font-medium">Scopes</th>
              <th className="py-2 pr-4 font-medium">Last used</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={6}>
                  {keysQuery.isPending ? "Loading…" : "No API keys yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">
                    <code>{row.keyPrefix}…</code>
                  </td>
                  <td className="py-2 pr-4">
                    {row.scopes.length} scope{row.scopes.length === 1 ? "" : "s"}
                  </td>
                  <td className="py-2 pr-4">{formatDate(row.lastUsedAt)}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={row.revokedAt ? "outline" : "success"}>{row.revokedAt ? "Revoked" : "Active"}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.revokedAt ? null : (
                      <Button type="button" variant="secondary" onClick={() => void revoke(row)} disabled={revokeMutation.isPending}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
