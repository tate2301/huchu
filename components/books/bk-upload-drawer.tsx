"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Drawer, Field, Select } from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Options = { accounts: Array<{ id: string; label: string; currency: string; kind: string }> };

/** Upload a statement (U): a CSV per account; its lines land in To match, any line uploaded before left out (§5.8.1). */
export function UploadDrawer({
  open,
  onOpenChange,
  accountId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId?: string | null;
  onDone: (account: string) => void;
}) {
  const { toast } = useToast();
  const options = useQuery({ queryKey: ["books", "bank", "entry-options"], queryFn: () => fetchJson<Options>("/api/books/bank/entries"), enabled: open });
  const accounts = (options.data?.accounts ?? []).filter((row) => row.kind !== "cash");
  const [account, setAccount] = React.useState(accountId ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setAccount(accountId ?? "");
      setFile(null);
      setError(null);
    }
  }, [open, accountId]);
  React.useEffect(() => {
    if (open && !account && accounts.length) setAccount(accounts[0].id);
  }, [open, account, accounts]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose the statement file.");
      const csv = await file.text();
      return fetchJson<{ added: number; repeated: number; skipped: number }>("/api/books/bank/statements", { method: "POST", body: JSON.stringify({ accountId: account, csv }) });
    },
    onSuccess: (result) => {
      toast({
        title: result.added === 0 ? "Every line was already there" : result.added === 1 ? "1 line added" : `${result.added} lines added`,
        description: result.repeated > 0 ? `${result.repeated} were uploaded before and were left out.` : undefined,
      });
      onDone(account);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a statement"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="upload2" shortcut="Ctrl ↵" busy={upload.isPending} disabled={!file || !account || upload.isPending} onClick={() => upload.mutate()}>
            Upload
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-16)", padding: "var(--space-16) var(--space-24)" }}>
        <Field label="Account" htmlFor="statement-account">
          <Select id="statement-account" value={account} onChange={(event) => setAccount(event.target.value)}>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Statement" htmlFor="statement-file" error={error} help="The CSV from online banking, with a date, a description and the amounts. Lines uploaded before are left out.">
          <input
            id="statement-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </Field>
      </div>
    </Drawer>
  );
}
