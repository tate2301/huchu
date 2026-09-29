"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { FormField, StatusDot } from "@/components/management/ui";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RowMenu } from "@/components/retail/row-menu";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatRetailDate, promotionStatusLabel, promotionTypeLabel } from "@/lib/retail/words";

type Promotion = {
  id: string;
  promoCode: string;
  name: string;
  type: string;
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  notes: string | null;
};

type PromotionForm = {
  name: string;
  type: string;
  value: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string;
};

const TYPES = ["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"];
const STATUSES = ["ACTIVE", "SCHEDULED", "INACTIVE"];
const STATUS_OPTIONS = new Map(STATUSES.map((status) => [status, promotionStatusLabel(status)]));

/** A stored instant as a `datetime-local` value, in the viewer's own time. */
function localInput(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formFor(promotion: Promotion | null): PromotionForm {
  if (!promotion) {
    return {
      name: "",
      type: "PERCENT",
      value: "",
      startsAt: localInput(new Date()),
      endsAt: "",
      status: "ACTIVE",
      notes: "",
    };
  }
  return {
    name: promotion.name,
    type: promotion.type,
    value: String(promotion.value),
    startsAt: localInput(promotion.startsAt),
    endsAt: localInput(promotion.endsAt),
    status: promotion.status,
    notes: promotion.notes ?? "",
  };
}

/** What the value field holds, named for the type so it needs no explaining. */
function valueLabel(type: string) {
  if (type === "PERCENT") return "Percent off";
  if (type === "AMOUNT") return "Amount off";
  return "Value";
}

function valueText(promotion: Promotion) {
  if (promotion.type === "PERCENT") return `${promotion.value}%`;
  if (promotion.type === "AMOUNT") return retailMoney(promotion.value);
  return String(promotion.value);
}

/** Running is the ordinary case and draws nothing. */
function promotionStatusDot(status: string) {
  if (status === "ACTIVE") return null;
  return <StatusDot tone="neutral" label={promotionStatusLabel(status)} />;
}

/**
 * Promotions — the discounts the till applies at checkout.
 *
 * The three tiles and three charts that sat over the table (running now, all
 * campaigns, average value, the eight richest offers, two donuts) governed
 * nothing on the page and are gone (D3), and so is the Pricing button in the
 * bar: the sidebar does navigation. The form lost its Advanced options
 * disclosure — the dates a promotion runs between are part of it, not an
 * advanced setting.
 */
export default function RetailPromotionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  // A new key per opening, so the form starts from the promotion it was opened on.
  const [opening, setOpening] = useState(0);

  const promotionsQuery = useQuery({
    queryKey: ["retail-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions"),
  });
  const promotions = useMemo(() => promotionsQuery.data?.data ?? [], [promotionsQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return promotions.filter((promotion) => {
      if (status !== FILTER_ANY && promotion.status !== status) return false;
      if (!needle) return true;
      return [promotion.name, promotion.promoCode].some((value) => value.toLowerCase().includes(needle));
    });
  }, [promotions, search, status]);

  const open = (promotion: Promotion | null) => {
    setEditing(promotion);
    setOpening((current) => current + 1);
    setDialogOpen(true);
  };

  const remove = useMutation({
    mutationFn: (promotion: Promotion) =>
      fetchJson(`/api/v2/retail/promotions/${promotion.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Promotion removed", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
    },
    onError: (error) =>
      toast({
        title: "That promotion was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = (promotion: Promotion) => {
    void dsConfirm({
      title: `Remove ${promotion.name}?`,
      description:
        "The till stops applying it at checkout. Sales it has already discounted keep their discount.",
      confirmLabel: "Remove the promotion",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) remove.mutate(promotion);
    });
  };

  const emptyTitle = search.trim()
    ? "No promotions match that search"
    : status !== FILTER_ANY
      ? "No promotions match this filter"
      : "No promotions yet";

  return (
    <>
      <RecordListShell
        title="Promotions"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or code"
        filters={
          <ViewToolbarFilter
            label="Status"
            value={status}
            anyLabel="Any status"
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        }
        filterCount={status === FILTER_ANY ? 0 : 1}
        count={promotionsQuery.isSuccess ? `${rows.length} of ${promotions.length}` : null}
        createLabel="New promotion"
        onCreate={() => open(null)}
        error={promotionsQuery.error}
      >
        <RecordTable
          rows={rows}
          isLoading={promotionsQuery.isPending}
          emptyTitle={emptyTitle}
          columns={[
            {
              id: "promotion",
              label: "Promotion",
              cell: (promotion) => <RecordTableName title={promotion.name} subtitle={promotion.promoCode} />,
            },
            {
              id: "status",
              label: "Status",
              width: "8rem",
              cell: (promotion) => promotionStatusDot(promotion.status),
            },
            {
              id: "type",
              label: "Type",
              width: "9rem",
              cell: (promotion) => <RecordCell value={promotionTypeLabel(promotion.type)} />,
            },
            {
              id: "value",
              label: "Value",
              align: "end",
              width: "7rem",
              cell: (promotion) => (
                <RecordCell kind={promotion.type === "AMOUNT" ? "money" : "number"} value={valueText(promotion)} />
              ),
            },
            {
              id: "starts",
              label: "Starts",
              width: "9rem",
              cell: (promotion) => (
                <RecordCell kind="date" value={formatRetailDate(promotion.startsAt) || "No start"} />
              ),
            },
            {
              id: "ends",
              label: "Ends",
              width: "9rem",
              cell: (promotion) => (
                <RecordCell kind="date" value={formatRetailDate(promotion.endsAt) || "No end"} />
              ),
            },
            {
              id: "menu",
              label: "",
              width: "3rem",
              align: "end",
              cell: (promotion) => (
                <RowMenu
                  label={`More for ${promotion.name}`}
                  items={[
                    { label: "Edit promotion", onSelect: () => open(promotion) },
                    { label: "Remove promotion", onSelect: () => confirmRemove(promotion), destructive: true },
                  ]}
                />
              ),
            },
          ]}
        />
      </RecordListShell>

      <PromotionDialog key={opening} open={dialogOpen} onOpenChange={setDialogOpen} promotion={editing} />
    </>
  );
}

/** New promotion, and the same form to edit one. */
function PromotionDialog({
  open,
  onOpenChange,
  promotion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The promotion to edit, or null for a new one. */
  promotion: Promotion | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PromotionForm>(() => formFor(promotion));
  const [errors, setErrors] = useState<string[]>([]);

  // The code is reserved when the dialog opens and sent with the promotion;
  // nobody types it, so it is not a field.
  const { reservedId: promoCode } = useReservedId({
    entity: "RETAIL_PROMOTION",
    enabled: open && !promotion,
  });

  const set = <K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        promoCode: promotion ? undefined : promoCode || undefined,
        name: form.name.trim(),
        type: form.type,
        value: Number(form.value),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (promotion) {
        return fetchJson(`/api/v2/retail/promotions/${promotion.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return fetchJson("/api/v2/retail/promotions", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: promotion ? "Promotion saved" : "Promotion created", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      onOpenChange(false);
    },
    onError: (error) =>
      setErrors([
        `${promotion ? "That promotion was not saved" : "That promotion was not created"}: ${getApiErrorMessage(error)}`,
      ]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.name.trim()) problems.push("Give the promotion a name.");
    const value = Number(form.value);
    if (!form.value.trim() || !(value > 0)) problems.push(`${valueLabel(form.type)} is a number above zero.`);
    else if (form.type === "PERCENT" && value > 100) problems.push("Percent off is at most 100.");
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt))
      problems.push("It has to end after it starts.");
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={promotion ? promotion.name : "New promotion"}
      size="md"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {promotion ? "Save promotion" : "Create promotion"}
          </Button>
        </>
      }
    >
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Month-end braai special"
            autoFocus={!promotion}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type">
          {(id) => (
            <Select value={form.type} onValueChange={(value) => set("type", value)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {promotionTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={valueLabel(form.type)}>
          {(id) => (
            <Input
              id={id}
              value={form.value}
              inputMode="decimal"
              className="font-mono"
              onChange={(event) => set("value", event.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Starts">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Ends">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
            />
          )}
        </FormField>
      </div>

      {promotion ? (
        <FormField label="Status">
          {(id) => (
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {promotionStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}

      <FormField label="Notes">
        {(id) => (
          <Textarea id={id} rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        )}
      </FormField>
    </RecordDialog>
  );
}
