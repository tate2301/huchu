"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { RETAIL_REQUISITION_CATEGORIES } from "@/lib/retail/requisition-words";

type Form = { category: string; purpose: string; amount: string; neededBy: string; siteId: string; notes: string };

const EMPTY: Form = { category: "MATERIALS", purpose: "", amount: "", neededBy: "", siteId: "", notes: "" };

/**
 * Ask for money to spend on the shop.
 *
 * What for, how much, and by when; the shop when there is more than one.
 * Send it straight to a manager, or keep it as a draft to finish later.
 */
export function RequisitionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sitesQuery = useQuery({ queryKey: ["retail-sites"], queryFn: fetchSites, enabled: open });
  const sites = useMemo(
    () => (sitesQuery.data ?? []).filter((site: { isActive?: boolean }) => site.isActive !== false),
    [sitesQuery.data],
  );
  const siteId = form.siteId || (sites.length === 1 ? sites[0].id : "");

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      fetchJson("/api/v2/retail/requisitions", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          category: form.category,
          purpose: form.purpose.trim(),
          amount: Number(form.amount),
          neededBy: form.neededBy || null,
          notes: form.notes.trim() || null,
          submit,
        }),
      }),
    onSuccess: (_result, submit) => {
      toast({ title: submit ? "Sent for approval" : "Saved as a draft", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-requisitions"] });
      setForm(EMPTY);
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const attempt = (submit: boolean) => {
    const problems: string[] = [];
    if (!form.purpose.trim()) problems.push("Say what the money is for.");
    if (!(Number(form.amount) > 0)) problems.push("Give an amount above zero.");
    if (!siteId) problems.push("Choose the shop it is for.");
    setErrors(problems);
    if (problems.length === 0) save.mutate(submit);
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New requisition"
      description="Ask for money to spend on the shop"
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        attempt(true);
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => attempt(false)}>
            Save as a draft
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Send for approval
          </Button>
        </>
      }
    >
      <FormField label="What is it for?">
        {(id) => (
          <Input
            id={id}
            value={form.purpose}
            placeholder="Cleaning materials for the floor"
            onChange={(event) => set("purpose", event.target.value)}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              className="font-mono"
              placeholder="0.00"
              value={form.amount}
              onChange={(event) => set("amount", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Kind">
          {() => (
            <SearchableSelect
              value={form.category}
              placeholder="Choose a kind"
              options={Object.entries(RETAIL_REQUISITION_CATEGORIES).map(([value, label]) => ({ value, label }))}
              onValueChange={(value) => set("category", value)}
            />
          )}
        </FormField>
        <FormField label="Needed by">
          {(id) => (
            <Input id={id} type="date" value={form.neededBy} onChange={(event) => set("neededBy", event.target.value)} />
          )}
        </FormField>
        {sites.length > 1 ? (
          <FormField label="Shop">
            {() => (
              <SearchableSelect
                value={form.siteId || undefined}
                placeholder="Choose a shop"
                options={sites.map((site: { id: string; name: string }) => ({ value: site.id, label: site.name }))}
                onValueChange={(value) => set("siteId", value)}
              />
            )}
          </FormField>
        ) : null}
      </div>
      <FormField label="Notes">
        {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} />}
      </FormField>
    </RecordDialog>
  );
}
