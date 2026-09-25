"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CATEGORIES, CATEGORY_LABELS, formatMoney, todayKey, type Category } from "./money";
import { ReceiptField, type UploadedReceipt } from "./receipt-field";

type Direction = "SPENT" | "RECEIVED";

/** A select cannot hold "" as a value, so "none of them" needs a name of its own. */
const NONE = "__none";

type ProjectOption = { id: string; name: string; currency: string };

type RequisitionOption = {
  id: string;
  requisitionNo: string;
  purpose: string;
  category: Category;
  currency: string;
  project: { id: string; name: string } | null;
};

type InvoiceOption = {
  id: string;
  number: string | null;
  customer: string | null;
  balance: number | null;
  currency: string;
};

const DIRECTIONS = [
  { value: "SPENT", label: "Expense" },
  { value: "RECEIVED", label: "Income" },
] as const;

/**
 * One line of money, written where it happened — the cost tracker, a
 * requisition's report, a project's spend — through the one door every money
 * line uses (`/api/v2/crm/cost-entries`, `addCostEntry` behind it).
 *
 * What the page already knows is fixed rather than asked: a line on a
 * requisition's report is against that requisition and its project, and one
 * added on a project is that project's. Whatever is left open is the
 * person's to answer — on the cost tracker that is nearly everything: money
 * in or out, which project, and which requisition an expense came out of or
 * which invoice income was paying.
 *
 * The day can be moved back and never forward: a rep writes Tuesday up on
 * Wednesday, and a line for Friday written on Wednesday is a guess.
 *
 * Each attempt carries a `clientEntryId`, kept across a failed retry and
 * replaced once a line lands, so a double press on a bad connection records
 * the money once.
 */
export function CostEntryForm({
  fixed = {},
  day: chosenDay,
  defaultCategory = "MATERIALS",
  submitLabel = "Add line",
  primary = false,
  onSaved,
}: {
  /** What the page already knows. Anything left out, the form asks. */
  fixed?: {
    direction?: Direction;
    currency?: string;
    projectId?: string | null;
    requisitionId?: string | null;
  };
  /**
   * The day the line goes on, as `YYYY-MM-DD`, when the page has chosen it —
   * the cost tracker picks the day above the form, because its balance and
   * its closing are that day's too. Without it the form asks.
   */
  day?: string;
  defaultCategory?: Category;
  submitLabel?: string;
  /** Whether adding the line is the page's main action, or one among others. */
  primary?: boolean;
  onSaved: () => void;
}) {
  const id = useId();
  const [chosenDirection, setDirection] = useState<Direction>("SPENT");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [description, setDescription] = useState("");
  const [ownDay, setOwnDay] = useState(todayKey);
  const [projectId, setProjectId] = useState(NONE);
  const [requisitionId, setRequisitionId] = useState(NONE);
  const [invoiceId, setInvoiceId] = useState(NONE);
  const [receipt, setReceipt] = useState<UploadedReceipt | null>(null);
  const [clientEntryId, setClientEntryId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  const direction = fixed.direction ?? chosenDirection;
  const day = chosenDay ?? ownDay;
  const asksRequisition = direction === "SPENT" && fixed.requisitionId === undefined;
  const asksInvoice = direction === "RECEIVED";

  const requisitions = useQuery({
    queryKey: ["crm", "requisitions", "reportable"],
    queryFn: () =>
      fetchJson<{ data: RequisitionOption[] }>(
        "/api/v2/crm/requisitions?queue=MINE&reportable=true&limit=100",
      ),
    enabled: asksRequisition,
  });
  const pickedRequisition = asksRequisition
    ? requisitions.data?.data.find((option) => option.id === requisitionId)
    : undefined;

  // A requisition names its project, so an expense out of one is that
  // project's — the same rule its own report page follows.
  const asksProject = fixed.projectId === undefined && !pickedRequisition;

  const projects = useQuery({
    queryKey: ["crm", "projects", "open-picker"],
    queryFn: () =>
      fetchJson<{ data: ProjectOption[] }>("/api/v2/crm/projects?open=true&costs=false&limit=100"),
    enabled: fixed.projectId === undefined,
    staleTime: 5 * 60_000,
  });
  const pickedProject = asksProject
    ? projects.data?.data.find((option) => option.id === projectId)
    : undefined;

  const invoices = useQuery({
    queryKey: ["crm", "documents", "outstanding-invoices"],
    queryFn: () =>
      fetchJson<{ data: InvoiceOption[] }>(
        "/api/v2/crm/documents?type=INVOICE&outstanding=true&limit=100",
      ),
    enabled: asksInvoice,
    staleTime: 60_000,
  });
  const pickedInvoice = asksInvoice
    ? invoices.data?.data.find((option) => option.id === invoiceId)
    : undefined;

  // The money is in the currency of whatever it came out of or was paying.
  const currency =
    fixed.currency ??
    pickedRequisition?.currency ??
    pickedInvoice?.currency ??
    pickedProject?.currency ??
    "USD";

  const pickRequisition = (next: string) => {
    setRequisitionId(next);
    const requisition = requisitions.data?.data.find((option) => option.id === next);
    // What the money was asked for is what it most likely went on.
    if (requisition) setCategory(requisition.category);
  };

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/cost-entries", {
        method: "POST",
        body: JSON.stringify({
          date: day,
          direction,
          category,
          amount: Number(amount),
          currency,
          description: description.trim(),
          // Left out when a requisition was picked: the server takes the
          // project from the requisition.
          ...(fixed.projectId !== undefined
            ? { projectId: fixed.projectId }
            : asksProject
              ? { projectId: projectId === NONE ? null : projectId }
              : {}),
          requisitionId:
            direction === "SPENT" ? (fixed.requisitionId ?? pickedRequisition?.id ?? null) : null,
          invoiceDocumentId: direction === "RECEIVED" ? (pickedInvoice?.id ?? null) : null,
          receiptUrl: receipt?.url ?? null,
          receiptPathname: receipt?.pathname ?? null,
          clientEntryId,
        }),
      }),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setReceipt(null);
      setError(null);
      setClientEntryId(crypto.randomUUID());
      onSaved();
    },
    onError: (failure) => setError(getApiErrorMessage(failure)),
  });

  const ready = Number(amount) > 0 && description.trim().length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) save.mutate();
      }}
    >
      {fixed.direction ? null : (
        <SegmentedControl
          ariaLabel="Money in or out"
          value={chosenDirection}
          onValueChange={setDirection}
          options={DIRECTIONS}
          variant="border"
          className="mb-5"
        />
      )}

      {/* Rule 1: a label over a control and nothing else. The labels are the
          nouns on the receipt — amount, category, description — and the
          control says the rest. */}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField label={`Amount, ${currency}`} htmlFor={`${id}-amount`}>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="font-mono"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label="Category" htmlFor={`${id}-category`}>
          <Select value={category} onValueChange={(next) => setCategory(next as Category)}>
            <SelectTrigger id={`${id}-category`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className={chosenDay ? undefined : "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_10rem]"}>
        <FormField label="Description" htmlFor={`${id}-description`}>
          <Input
            id={`${id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        {chosenDay ? null : (
          <FormField label="Day" htmlFor={`${id}-day`}>
            <Input
              id={`${id}-day`}
              type="date"
              className="font-mono"
              max={todayKey()}
              value={ownDay}
              onChange={(event) => setOwnDay(event.target.value)}
            />
          </FormField>
        )}
      </div>

      {asksRequisition || asksInvoice || fixed.projectId === undefined ? (
        <div className="grid gap-x-4 sm:grid-cols-2">
          {asksRequisition ? (
            <FormField label="Paid from" htmlFor={`${id}-requisition`}>
              <Select value={requisitionId} onValueChange={pickRequisition}>
                <SelectTrigger id={`${id}-requisition`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>My own money</SelectItem>
                  {(requisitions.data?.data ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.requisitionNo} · {option.purpose}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          {asksInvoice ? (
            <FormField label="Invoice" htmlFor={`${id}-invoice`}>
              <Select value={invoiceId} onValueChange={setInvoiceId}>
                <SelectTrigger id={`${id}-invoice`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No invoice</SelectItem>
                  {(invoices.data?.data ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {[
                        option.number ?? "Invoice",
                        option.customer,
                        option.balance !== null
                          ? `${formatMoney(option.balance, option.currency)} owed`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          {fixed.projectId !== undefined ? null : asksProject ? (
            <FormField label="Project" htmlFor={`${id}-project`}>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id={`${id}-project`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {(projects.data?.data ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : (
            // The requisition decides the project, so it is said rather than
            // asked — a control that cannot change anything is not offered.
            <FormField label="Project" htmlFor={`${id}-project-fixed`}>
              <output id={`${id}-project-fixed`} className="flex min-h-9 items-center text-sm text-[var(--text-strong)]">
                {pickedRequisition?.project?.name ?? "No project"}
              </output>
            </FormField>
          )}
        </div>
      ) : null}

      <FormField label="Receipt" htmlFor={`${id}-receipt`}>
        <ReceiptField id={`${id}-receipt`} value={receipt} onChange={setReceipt} />
      </FormField>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--status-error-text)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant={primary ? "primary" : "outline"} disabled={!ready || save.isPending}>
        {save.isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
