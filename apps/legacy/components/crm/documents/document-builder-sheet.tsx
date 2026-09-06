"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Plus, Trash2 } from "@corelithzw/ui/lib/icons";
import type { CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";

import {
  draftToLine,
  emptyLine,
  lineTotals,
  round2,
  toNumber,
  type DocumentLineDraft,
} from "./document-math";
import { formatMoney } from "./document-types";
import { CataloguePicker, type VisitItemOption } from "./catalogue-picker";
import { DocumentTemplatePicker } from "./document-template-picker";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";

/** A render layout the PDF can be drawn through, from the templates studio. */
type LayoutOption = {
  id: string;
  name: string;
  scope: "SYSTEM" | "COMPANY";
  isActive: boolean;
  isDefault: boolean;
};

/**
 * One numeric box on a quote line, labelled on a phone and bare on a desk.
 *
 * `sm:contents` is what makes the row work at both widths without writing it
 * twice: at `sm` and up the wrapper stops generating a box, and the input
 * below it becomes a direct child of the line's seven-column grid again. The
 * label is `sm:hidden` because the grid has its own heading row up there.
 */
function LineField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block sm:contents">
      <span className="mb-1 block text-sm text-[var(--text-muted)] sm:hidden">{label}</span>
      {children}
    </label>
  );
}

export function DocumentBuilderSheet({
  open,
  onOpenChange,
  basePath,
  mode,
  currency,
  prefillLines,
  fromQuotationId,
  isDeposit,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record's API base, e.g. /api/v2/crm/deals/<id>. */
  basePath: string;
  mode: "quotation" | "invoice";
  currency: string;
  prefillLines?: CrmDocumentLineInput[];
  fromQuotationId?: string;
  /** This invoice is money down against the quote — stored on the document. */
  isDeposit?: boolean;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lines, setLines] = useState<DocumentLineDraft[]>([emptyLine()]);
  const [documentDiscount, setDocumentDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [sendApproval, setSendApproval] = useState(mode === "quotation");
  const [renderTemplateId, setRenderTemplateId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Which layout the PDF renders through. Distinct from the standing-terms
  // picker below: that fills the notes, this picks the page design.
  const docType = mode === "quotation" ? "SALES_QUOTATION" : "SALES_INVOICE";
  const layouts = useQuery({
    queryKey: ["crm", "render-layouts", docType],
    enabled: open,
    queryFn: () =>
      fetchJson<LayoutOption[]>(`/api/document-templates?documentType=${docType}`),
  });
  // What was measured on this record's visits, offered on every line rather
  // than only as a one-shot prefill when a report is completed. basePath is
  // `/api/v2/crm/leads/{id}` or `.../deals/{id}`; the record is read off it
  // rather than threaded through four callers.
  const recordMatch = /\/(leads|deals)\/([0-9a-f-]{36})/i.exec(basePath);
  const visitItemsQuery = useQuery({
    queryKey: ["crm", "visit-items", basePath],
    enabled: open && Boolean(recordMatch),
    queryFn: () =>
      fetchJson<{ data: VisitItemOption[] }>(
        `/api/v2/crm/visit-items?${recordMatch![1] === "leads" ? "leadId" : "dealId"}=${recordMatch![2]}`,
      ),
    staleTime: 60_000,
  });
  const visitItems = visitItemsQuery.data?.data ?? [];

  const layoutOptions = useMemo(
    () =>
      (layouts.data ?? [])
        .filter((template) => template.isActive)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
    [layouts.data],
  );

  useEffect(() => {
    if (!open) return;
    setLines(
      prefillLines && prefillLines.length > 0
        ? prefillLines.map((line) => ({
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: line.unitPrice ? String(line.unitPrice) : "",
            discountPercent: "",
            taxRate: line.taxRate ? String(line.taxRate) : "",
          }))
        : [emptyLine()],
    );
    setDocumentDiscount("");
    setNotes("");
    setValidUntil("");
    setDueDate("");
    setSendApproval(mode === "quotation");
    setRenderTemplateId("");
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totals = useMemo(
    () => lineTotals(lines, toNumber(documentDiscount)),
    [lines, documentDiscount],
  );

  const patchLine = (index: number, patch: Partial<DocumentLineDraft>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const create = useMutation({
    mutationFn: () => {
      const docDiscount = toNumber(documentDiscount);
      const payload = lines
        .map((line) => draftToLine(line, docDiscount))
        .filter(Boolean) as CrmDocumentLineInput[];

      // The discount is spread across the lines, so say so in the notes —
      // otherwise the client just sees prices they can't reconcile.
      const noteParts = [notes.trim()].filter(Boolean);
      if (docDiscount > 0) {
        noteParts.push(`A ${docDiscount}% discount has been applied across all lines.`);
      }

      const endpoint = mode === "quotation" ? "quotation" : "invoice";
      return fetchJson<{ total?: number }>(
        `${basePath}/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(fromQuotationId ? { fromQuotationId } : { lines: payload }),
            currency,
            notes: noteParts.join(" ") || undefined,
            ...(renderTemplateId ? { renderTemplateId } : {}),
            ...(mode === "invoice" && isDeposit ? { isDeposit: true } : {}),
            ...(mode === "quotation"
              ? {
                  validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
                  sendApproval,
                }
              : { dueDate: dueDate ? new Date(dueDate).toISOString() : undefined }),
          }),
        },
      );
    },
    onSuccess: (result) => {
      refreshAfterDocumentChange(queryClient);
      toast({
        title: mode === "quotation" ? "Quotation created" : "Invoice issued",
        // Report the server's total, not the preview — per-line rounding can
        // put the two a cent apart, and money should never look uncertain.
        description:
          typeof result.total === "number"
            ? formatMoney(result.total, currency)
            : undefined,
      });
      onOpenChange(false);
      onCreated?.();
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    if (fromQuotationId) return [];
    const found: string[] = [];
    const valid = lines.map(draftToLine).filter(Boolean);
    if (valid.length === 0) {
      found.push("Add at least one line with a description and a quantity above zero.");
    }
    if (lines.some((line) => line.description.trim() && !line.unitPrice.trim())) {
      found.push("Every line needs a unit price — use 0 for items you're including free.");
    }
    if (totals.total < 0) {
      found.push("The document total can't be negative. Check your discounts.");
    }
    return found;
  };

  const isQuotation = mode === "quotation";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isQuotation ? "New quotation" : "New invoice"}
      description={fromQuotationId
      ? "Converting the accepted quotation — the lines carry over exactly as quoted."
      : isQuotation
        ? "Price up the work. The client can approve it from a link without signing in."
        : "Bill the work. Payments recorded against this invoice produce receipts."}
      size="xl"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const found = validate();
        setErrors(found);
        if (found.length === 0) create.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending
            ? "Saving…"
            : isQuotation
              ? sendApproval
                ? "Create & share"
                : "Create quotation"
              : "Issue invoice"}
        </Button>
      </>}
    >
      {fromQuotationId ? (
        <p className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-muted)]/50 p-3 text-sm">
          Lines are taken from the source quotation and can&apos;t be edited here — that keeps
          the invoice matching what the client accepted. Cancel and start a fresh invoice if
          the scope has changed.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="hidden gap-2 px-1 text-sm font-medium text-[var(--text-muted)] sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_5rem_7rem_2rem]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Disc %</span>
            <span className="text-right">Tax %</span>
            <span className="text-right">Line total</span>
            <span />
          </div>

          {lines.map((line, index) => {
            const quantity = toNumber(line.quantity, 1);
            const listPrice = toNumber(line.unitPrice);
            const discount = Math.min(Math.max(toNumber(line.discountPercent), 0), 100);
            const net = round2(quantity * round2(listPrice * (1 - discount / 100)));

            return (
              // On a phone the seven-column row becomes a card. The column
              // headings above are `sm:grid`, so stacked the four numeric
              // boxes were four identical unlabelled fields between the
              // description and the total — the aria-labels are the only
              // thing that ever said which was which, and nobody sees those.
              // At `sm` and up the wrappers below go `display: contents` and
              // the original grid is back, unchanged.
              <div
                key={index}
                className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem_5rem_7rem_2rem] sm:items-center sm:rounded-none sm:border-0 sm:p-0"
              >
                {/* Free text still works — a quote for something not in the
                    catalogue is a real thing, and a builder that refuses it
                    sends people to Word. Typing two characters offers what we
                    sell, with its price and tax already right. */}
                <CataloguePicker
                  value={line.description}
                  visitItems={visitItems}
                  aria-label={`Line ${index + 1} description`}
                  onChange={(value) => patchLine(index, { description: value })}
                  onPick={(pick) =>
                    patchLine(index, {
                      description: pick.description,
                      // A measured item may carry no price — somebody wrote
                      // down a size and left the pricing for later. Filling
                      // the box with "0.00" there would look like a decision.
                      ...(pick.unitPrice != null
                        ? { unitPrice: pick.unitPrice.toFixed(2) }
                        : {}),
                      ...(pick.taxRate != null ? { taxRate: String(pick.taxRate) } : {}),
                      ...(pick.quantity != null ? { quantity: String(pick.quantity) } : {}),
                    })
                  }
                  placeholder="What are you charging for?"
                />
                {/* Two by two on a phone, and back in the row at `sm`. */}
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <LineField label="Qty">
                    <Input
                      value={line.quantity}
                      onChange={(event) => patchLine(index, { quantity: event.target.value })}
                      inputMode="decimal"
                      className="text-right font-mono"
                      aria-label={`Line ${index + 1} quantity`}
                    />
                  </LineField>
                  <LineField label="Unit price">
                    <Input
                      value={line.unitPrice}
                      onChange={(event) => patchLine(index, { unitPrice: event.target.value })}
                      inputMode="decimal"
                      className="text-right font-mono"
                      placeholder="0.00"
                      aria-label={`Line ${index + 1} unit price`}
                    />
                  </LineField>
                  <LineField label="Disc %">
                    <Input
                      value={line.discountPercent}
                      onChange={(event) =>
                        patchLine(index, { discountPercent: event.target.value })
                      }
                      inputMode="decimal"
                      className="text-right font-mono"
                      placeholder="0"
                      aria-label={`Line ${index + 1} discount percent`}
                    />
                  </LineField>
                  <LineField label="Tax %">
                    <Input
                      value={line.taxRate}
                      onChange={(event) => patchLine(index, { taxRate: event.target.value })}
                      inputMode="decimal"
                      className="text-right font-mono"
                      placeholder="0"
                      aria-label={`Line ${index + 1} tax percent`}
                    />
                  </LineField>
                </div>

                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span className="px-1 text-right font-mono text-sm tabular-nums">
                    <span className="mr-2 font-sans text-[var(--text-muted)] sm:hidden">
                      Line total
                    </span>
                    {net.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 px-0"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </section>
      )}

      {!fromQuotationId ? (
        <section className="ml-auto w-full max-w-sm space-y-1.5 rounded-[var(--card-radius)] border border-[var(--border)] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">List total</span>
            <span className="font-mono tabular-nums">
              {formatMoney(totals.listTotal, currency)}
            </span>
          </div>
          {totals.lineDiscount > 0 ? (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Line discounts</span>
              <span className="font-mono tabular-nums">
                −{formatMoney(totals.lineDiscount, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="doc-discount" className="text-[var(--text-muted)]">
              Document discount %
            </Label>
            <Input
              id="doc-discount"
              value={documentDiscount}
              onChange={(event) => setDocumentDiscount(event.target.value)}
              inputMode="decimal"
              className="h-8 w-20 text-right font-mono"
              placeholder="0"
            />
          </div>
          {totals.docDiscountAmount > 0 ? (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Document discount</span>
              <span className="font-mono tabular-nums">
                −{formatMoney(totals.docDiscountAmount, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Subtotal</span>
            <span className="font-mono tabular-nums">
              {formatMoney(totals.subTotal, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Tax</span>
            <span className="font-mono tabular-nums">
              {formatMoney(totals.taxTotal, currency)}
            </span>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums">
              {formatMoney(totals.total, currency)}
            </span>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-date">{isQuotation ? "Valid until" : "Due date"}</Label>
          <Input
            id="doc-date"
            type="date"
            value={isQuotation ? validUntil : dueDate}
            onChange={(event) =>
              isQuotation ? setValidUntil(event.target.value) : setDueDate(event.target.value)
            }
          />
        </div>
        {layoutOptions.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="doc-layout">Layout</Label>
            <Select
              value={renderTemplateId || "default"}
              onValueChange={(value) =>
                setRenderTemplateId(value === "default" ? "" : value)
              }
            >
              <SelectTrigger id="doc-layout" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Company default</SelectItem>
                {layoutOptions.map((layout) => (
                  <SelectItem key={layout.id} value={layout.id}>
                    {layout.name}
                    {layout.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-[var(--text-muted)]">
              The page design the PDF is drawn with. Manage layouts under Templates.
            </p>
          </div>
        ) : null}
      </section>

      <DocumentTemplatePicker
        kind={isQuotation ? "QUOTE" : "INVOICE"}
        onPick={(text) => setNotes(text)}
      />

      <div className="space-y-1.5">
        <Label htmlFor="doc-notes">Notes</Label>
        <Textarea
          id="doc-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Terms, lead times, exclusions — anything the client should read."
        />
      </div>

      {isQuotation ? (
        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox
            checked={sendApproval}
            onCheckedChange={(checked) => setSendApproval(checked === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            Create an approval link
            <span className="block text-[var(--text-muted)]">
              The client can accept or decline from the link without an account.
            </span>
          </span>
        </label>
      ) : null}
    </RecordDialog>
  );
}
