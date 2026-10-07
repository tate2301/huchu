"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
  ColumnText,
  FormField,
  StatusDot,
} from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { retailMoney } from "@/components/retail/sale-detail";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { DatePicker } from "@/components/ui/date-picker";
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
import { startOfDayIn } from "@/lib/reports/list-query";
import { DEFAULT_TIME_ZONE, dayKey, formatTime } from "@/lib/workspace/format";
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

const WIDTH = 960;

/** A stored instant as the shop's wall clock, `YYYY-MM-DDTHH:mm`. */
function localInput(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${dayKey(date, DEFAULT_TIME_ZONE)}T${formatTime(date, DEFAULT_TIME_ZONE)}`;
}

/** The shop's wall clock back to an instant, read in the shop's zone. */
function shopInstant(value: string): string {
  const [day, time] = value.split("T");
  const [hours, minutes] = (time ?? "00:00").split(":").map(Number);
  return new Date(startOfDayIn(day!, DEFAULT_TIME_ZONE).getTime() + (hours! * 60 + minutes!) * 60_000).toISOString();
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
 * A `ColumnList` under the toolbar: the code and name, a dot only when the
 * promotion is not running, its type and dates, and its value against the
 * right edge. A promotion has no record page, so Edit sits on its row and
 * Remove is in the dialog Edit opens. The dates a promotion runs between are
 * part of its form, not an advanced setting.
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
      fetchJson("/api/v2/retail/bin", { method: "POST", body: JSON.stringify({ kind: "promotion", id: promotion.id }) }),
    onSuccess: () => {
      toast({ title: "Moved to the bin. Setup › Bin brings it back.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
    },
    onError: (error) =>
      toast({
        title: "That promotion was not moved to the bin",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = (promotion: Promotion) => {
    void dsConfirm({
      title: `Move ${promotion.name} to the bin?`,
      description:
        "The till stops applying it. Sales it discounted keep their discount, and Setup › Bin brings it back for 30 days.",
      confirmLabel: "Move to the bin",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) remove.mutate(promotion);
    });
  };

  const narrowed = Boolean(search.trim()) || status !== FILTER_ANY;
  const empty = search.trim()
    ? "No promotion matches that search."
    : status !== FILTER_ANY
      ? "No promotion matches this filter."
      : "No promotions yet.";

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
        {promotionsQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* A promotion has no record page, so its one verb is on its row;
                Remove is in the dialog that verb opens. */}
            <ColumnList
              label="Promotions"
              maxWidth={WIDTH}
              empty={empty}
              columns={[
                { id: "promotion", label: "Promotion" },
                { id: "status", label: "Status", hideBelow: "sm" },
                { id: "type", label: "Type", hideBelow: "md" },
                { id: "starts", label: "Starts", hideBelow: "md" },
                { id: "ends", label: "Ends", hideBelow: "md" },
                { id: "value", label: "Value", align: "end" },
                { id: "act", label: "" },
              ]}
              rows={rows.map((promotion) => ({
                id: promotion.id,
                cells: {
                  promotion: <ColumnName code={promotion.promoCode} name={promotion.name} />,
                  status: promotionStatusDot(promotion.status),
                  type: <ColumnText>{promotionTypeLabel(promotion.type)}</ColumnText>,
                  starts: (
                    <ColumnFigure tone="muted">{formatRetailDate(promotion.startsAt) || "No start"}</ColumnFigure>
                  ),
                  ends: (
                    <ColumnFigure tone="muted">{formatRetailDate(promotion.endsAt) || "No end"}</ColumnFigure>
                  ),
                  value: <ColumnFigure>{valueText(promotion)}</ColumnFigure>,
                  act: (
                    <ColumnRowAction>
                      <Button type="button" size="sm" variant="secondary" onClick={() => open(promotion)}>
                        Edit
                      </Button>
                    </ColumnRowAction>
                  ),
                },
              }))}
            />
            {rows.length === 0 && !narrowed ? (
              <Button variant="primary" size="sm" onClick={() => open(null)}>
                New promotion
              </Button>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <PromotionDialog
        key={opening}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        promotion={editing}
        onRemove={(promotion) => {
          setDialogOpen(false);
          confirmRemove(promotion);
        }}
      />
    </>
  );
}

/** New promotion, and the same form to edit one. */
function PromotionDialog({
  open,
  onOpenChange,
  promotion,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The promotion to edit, or null for a new one. */
  promotion: Promotion | null;
  /** Remove lives here: a promotion has no record page to carry it. */
  onRemove: (promotion: Promotion) => void;
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
        startsAt: form.startsAt ? shopInstant(form.startsAt) : null,
        endsAt: form.endsAt ? shopInstant(form.endsAt) : null,
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
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt)
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
          {promotion ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-[var(--tone-danger-strong)]"
              onClick={() => onRemove(promotion)}
            >
              Remove promotion
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
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
            <DatePicker
              id={id}
              time
              clearable
              label="Starts"
              value={form.startsAt || null}
              onChange={(value) => set("startsAt", value ?? "")}
            />
          )}
        </FormField>
        <FormField label="Ends">
          {(id) => (
            <DatePicker
              id={id}
              time
              clearable
              label="Ends"
              earliest={form.startsAt ? form.startsAt.slice(0, 10) : undefined}
              value={form.endsAt || null}
              onChange={(value) => set("endsAt", value ?? "")}
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
