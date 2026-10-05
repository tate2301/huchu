"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { NAV_BADGES_KEY } from "@/components/layout/shell-nav";
import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";

type ShiftForm = { siteId: string; registerId: string; openingFloat: string; notes: string };

type ShiftContextSite = {
  id: string;
  name: string;
  code: string;
  registers: Array<{ id: string; name: string; code: string; siteId: string }>;
};

const EMPTY_FORM: ShiftForm = { siteId: "", registerId: "", openingFloat: "0", notes: "" };

function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * "+ Open shift" over the Shifts list, at `?sheet=shift-open`.
 *
 * The form the list has always had — site, till, float and a note, through
 * `POST /api/v2/retail/shifts` — now opened from the address the header's
 * primary writes. FND-07 replaces it with the SheetForm `shift-open` kind.
 */
export function OpenShiftSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("sheet") === "shift-open";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sheet");
    params.delete("id");
    const query = params.toString();
    setForm(EMPTY_FORM);
    setErrors([]);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const contextQuery = useQuery({
    queryKey: ["retail-shift-context"],
    enabled: open,
    queryFn: () =>
      fetchJson<{ data: { defaultSiteId: string | null; defaultRegisterId: string | null; sites: ShiftContextSite[] } }>(
        "/api/v2/retail/shifts/context",
      ),
  });
  const context = contextQuery.data?.data;
  const sites = useMemo(() => context?.sites ?? [], [context]);
  const defaultSiteId = context?.defaultSiteId ?? null;
  const defaultRegisterId = context?.defaultRegisterId ?? null;

  // The pick while it is still valid, the shop's default otherwise.
  const siteId =
    (form.siteId && sites.some((site) => site.id === form.siteId) ? form.siteId : "") ||
    (defaultSiteId && sites.some((site) => site.id === defaultSiteId) ? defaultSiteId : "") ||
    sites.find((site) => site.registers.length > 0)?.id ||
    sites[0]?.id ||
    "";
  const site = sites.find((candidate) => candidate.id === siteId) ?? null;
  const tills = useMemo(() => site?.registers ?? [], [site]);
  const tillId =
    (form.registerId && tills.some((till) => till.id === form.registerId) ? form.registerId : "") ||
    (site?.id === defaultSiteId && defaultRegisterId && tills.some((till) => till.id === defaultRegisterId)
      ? defaultRegisterId
      : "") ||
    tills[0]?.id ||
    "";

  const { reservedId: shiftNo, isReserving, error: reserveError } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: open && Boolean(siteId),
    siteId: siteId || undefined,
  });

  const openMutation = useMutation({
    mutationFn: async (payload: ShiftForm) =>
      fetchJson("/api/v2/retail/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftNo: shiftNo || undefined,
          siteId: payload.siteId,
          registerId: payload.registerId,
          openingFloat: Number(payload.openingFloat || 0),
          notes: payload.notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["list", "retail-shifts"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-shift-context"] });
      void queryClient.invalidateQueries({ queryKey: NAV_BADGES_KEY });
      close();
    },
    onError: (error) => {
      toast({ title: "That shift was not opened", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Open shift"
      size="sm"
      errors={[...(reserveError ? [`The shift number was not reserved: ${reserveError}`] : []), ...errors]}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: string[] = [];
        if (!siteId) problems.push("Choose a site.");
        else if (tills.length === 0) problems.push(`${site?.name ?? "That site"} has no tills yet.`);
        else if (!tillId) problems.push("Choose a till.");
        const float = amount(form.openingFloat);
        if (form.openingFloat.trim() && (float === null || float < 0))
          problems.push("The opening float is an amount of zero or more.");
        setErrors(problems);
        if (problems.length === 0) openMutation.mutate({ ...form, siteId, registerId: tillId });
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={openMutation.isPending || isReserving}>
            Open shift
          </Button>
        </>
      }
    >
      <FormField label="Shift">{(id) => <Input id={id} value={shiftNo} readOnly className="font-mono" />}</FormField>
      {sites.length > 1 ? (
        <FormField label="Site">
          {(id) => (
            <Select
              value={siteId}
              onValueChange={(value) => setForm((current) => ({ ...current, siteId: value, registerId: "" }))}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Till">
          {(id) => (
            <Select
              value={tillId}
              onValueChange={(value) => setForm((current) => ({ ...current, registerId: value }))}
              disabled={tills.length === 0}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder="Choose a till" />
              </SelectTrigger>
              <SelectContent>
                {tills.map((till) => (
                  <SelectItem key={till.id} value={till.id}>
                    {till.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Opening float">
          {(id) => (
            <Input
              id={id}
              value={form.openingFloat}
              inputMode="decimal"
              className="font-mono"
              onChange={(event) => setForm((current) => ({ ...current, openingFloat: event.target.value }))}
            />
          )}
        </FormField>
      </div>
      <FormField label="Notes">
        {(id) => (
          <Textarea
            id={id}
            value={form.notes}
            rows={3}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        )}
      </FormField>
    </RecordDialog>
  );
}
