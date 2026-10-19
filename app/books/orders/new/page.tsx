"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BkField, BkFormPage, FormSec, RailFigure, RailSteps, todayHarare, WideSec } from "@/components/books/bk-form";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Kit, Select, TextArea } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { BooksFormOptions } from "@/lib/books/form-options-view";
import { readNumber } from "@/lib/books/invoice-form";
import { orderFormErrors, orderPayload, orderTotals, type OrderForm, type OrderFormLine } from "@/lib/books/order-form";

type Options = BooksFormOptions & { approval: { limit: number; orderLimit: number; owner: string | null } | null };

const VAT_RATES = [
  { value: "15.5", label: "VAT 15.5%" },
  { value: "0", label: "No VAT" },
];
const blank = (): OrderFormLine => ({ itemName: "", quantity: "1", unitCost: "", vatRate: "15.5" });
const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function OrderFormPage({ options }: { options: Options }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<OrderForm>({ vendorId: "", expectedDate: "", note: "", lines: [blank(), blank()] });
  const [shown, setShown] = React.useState(false);
  const set = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<OrderFormLine>) => setForm((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }));
  const totals = orderTotals(form.lines);
  const errors = shown ? orderFormErrors(form) : {};
  const limit = options.approval?.orderLimit ?? null;
  const over = limit !== null && totals.total > limit + 0.004;

  const save = useMutation({
    mutationFn: async (send: boolean) => {
      const order = await fetchJson<{ id: string; poNo: string }>("/api/books/purchase-orders", { method: "POST", body: JSON.stringify(orderPayload(form)) });
      if (!send) return { order, status: "DRAFT" };
      const sent = await fetchJson<{ status: string }>(`/api/books/purchase-orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ action: "submit" }) });
      return { order, status: sent.status };
    },
    onSuccess: async ({ order, status }) => {
      toast({
        title: status === "DRAFT" ? `${order.poNo} is saved as a draft` : status === "TO_APPROVE" ? `${order.poNo} waits for approval` : `${order.poNo} is sent`,
        description: status === "TO_APPROVE" ? `Over ${money(limit ?? 0)}, ${options.approval?.owner ?? "the owner"} approves it.` : status === "SENT" ? "Send it to the supplier the way you always do." : undefined,
        variant: "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(`/books/orders?view=${status === "DRAFT" ? "draft" : status === "TO_APPROVE" ? "to-approve" : "sent"}`);
    },
    onError: (error) => toast({ title: "The order was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const submit = (send: boolean) => {
    setShown(true);
    if (Object.keys(orderFormErrors(form)).length === 0) save.mutate(send);
  };

  return (
    <>
      <PageChrome
        title="New order"
        backHref="/books/orders"
        backLabel="Purchase orders"
        primary={{ label: "Send the order", icon: "send", shortcut: "Ctrl ↵", onClick: () => submit(true), disabled: save.isPending ? "Saving" : undefined }}
      >
        <Kit contents>
          <Button icon="docs" onClick={() => submit(false)} disabled={save.isPending}>
            Save draft
          </Button>
        </Kit>
      </PageChrome>
      <BkFormPage
        rail={
          <>
            <RailFigure
              title="Total"
              figure={money(totals.total, options.base)}
              rows={[
                ["Before VAT", money(totals.net, options.base)],
                ["VAT", money(totals.tax, options.base)],
                ["Number", "Given when saved"],
              ]}
            />
            <RailSteps
              title="When it is sent"
              steps={[
                over ? [`${options.approval?.owner ?? "The owner"} approves it`, `over ${money(limit ?? 0, options.base)}`] : ["It goes out", "under the limit, at once"],
                ["Goods come in", "against it, line by line"],
                ["The bill", "is matched to it"],
              ]}
            />
          </>
        }
      >
        <FormSec title="Supplier" text="Who it is ordered from, and when it is due.">
          <BkField label="Supplier" htmlFor="order-supplier" error={errors.vendorId}>
            <div style={{ display: "flex", gap: 8 }}>
              <Select id="order-supplier" value={form.vendorId} onChange={(event) => set("vendorId", event.target.value)} style={{ flex: 1, minWidth: 0 }}>
                <option value="">Choose a supplier</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
              <Button icon="plus" onClick={() => setAdding(true)}>
                New supplier
              </Button>
            </div>
          </BkField>
          <div className="field-row">
            <BkField label="Expected" htmlFor="order-expected" optional error={errors.expectedDate}>
              <Input id="order-expected" type="date" min={todayHarare()} value={form.expectedDate} onChange={(event) => set("expectedDate", event.target.value)} />
            </BkField>
            <div />
          </div>
        </FormSec>

        <WideSec title="Lines" text="Goods or a service: no stock item needed.">
          <table className="table bk-le" aria-label="Lines">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num" style={{ width: 84 }}>
                  Quantity
                </th>
                <th className="num" style={{ width: 100 }}>
                  Cost
                </th>
                <th style={{ width: 118 }}>Tax code</th>
                <th className="num" style={{ width: 104 }}>
                  Amount
                </th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, index) => {
                const amount = (readNumber(line.quantity) || 0) * (readNumber(line.unitCost) || 0);
                return (
                  <tr key={index}>
                    <td>
                      <Input aria-label="Item" value={line.itemName} placeholder="What is ordered" aria-invalid={Boolean(errors[`lines.${index}.itemName`]) || undefined} onChange={(event) => setLine(index, { itemName: event.target.value })} />
                    </td>
                    <td>
                      <Input className="num" aria-label="Quantity" inputMode="decimal" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
                    </td>
                    <td>
                      <Input className="num" aria-label="Cost" inputMode="decimal" placeholder="0.00" value={line.unitCost} onChange={(event) => setLine(index, { unitCost: event.target.value })} />
                    </td>
                    <td>
                      <Select aria-label="Tax code" value={line.vatRate} onChange={(event) => setLine(index, { vatRate: event.target.value })}>
                        {VAT_RATES.map((rate) => (
                          <option key={rate.value} value={rate.value}>
                            {rate.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="num" style={{ color: "var(--color-ink)" }}>
                      {plain(amount)}
                    </td>
                    <td>
                      <Button variant="quiet" iconOnly icon="x" label="Remove the line" disabled={form.lines.length === 1} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {errors.lines ? (
            <p className="error bk-add" role="alert">
              <Icon name="warn" />
              {errors.lines}
            </p>
          ) : null}
          <div className="bk-add">
            <Button variant="quiet" icon="plus" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, blank()] }))}>
              Add a line
            </Button>
          </div>
        </WideSec>

        <FormSec title="Note" text="What the supplier reads on the order.">
          <BkField label="Note to the supplier" htmlFor="order-note" optional>
            <TextArea id="order-note" rows={3} value={form.note} placeholder="Deliver to the showroom, before 10am" onChange={(event) => set("note", event.target.value)} />
          </BkField>
        </FormSec>
      </BkFormPage>
      <PartyDrawer
        kind="supplier"
        open={adding}
        onOpenChange={setAdding}
        onCreated={(party) => {
          setParties((current) => [...current, { id: party.id, name: party.name, vatNumber: null, tin: null }].sort((a, b) => a.name.localeCompare(b.name)));
          set("vendorId", party.id);
          toast({ title: `${party.name} is added`, variant: "success" });
        }}
      />
    </>
  );
}

function NewOrder() {
  const options = useQuery({ queryKey: ["books", "forms", "order"], queryFn: () => fetchJson<Options>("/api/books/forms?for=bill") });
  if (options.data) return <OrderFormPage options={options.data} />;
  return (
    <>
      <PageChrome title="New order" backHref="/books/orders" backLabel="Purchase orders" />
      {options.isError ? <BooksError what="The order form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Bills & spending → Purchase orders → New order: a Books order (D11), as a draft or sent. No board draws it; it is BkBillNew's form. */
export default function NewOrderPage() {
  return (
    <BooksPage screen="bk-a">
      <NewOrder />
    </BooksPage>
  );
}
