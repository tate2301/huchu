"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CATEGORIES, CATEGORY_LABELS, formatDay, formatMoney, todayKey, type Category } from "./money";
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
 * One line of money, in a dialog — the cost tracker's, a requisition's
 * report, a project's spend — written through the one door every money line
 * uses (`/api/v2/crm/cost-entries`, `addCostEntry` behind it).
 *
 * A dialog rather than a form on the page: the page shows what the day, the
 * requisition or the project has come to, and adding to it is a short
 * question that wants the whole of somebody's attention and then gets out of
 * the way.
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
 * replaced for the next line, so a double press on a bad connection records
 * the money once.
 */
export function CostEntryFormDialog({
  open,
  onOpenChange,
  title,
  fixed = {},
  day: chosenDay,
  defaultCategory = "MATERIALS",
  submitLabel = "Add",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the page already knows. Anything left out, the dialog asks. */
  fixed?: {
    direction?: Direction;
    currency?: string;
    projectId?: string | null;
    requisitionId?: string | null;
  };
  /**
   * The day the line goes on, as `YYYY-MM-DD`, when the page has chosen it —
   * the cost tracker's day is picked on the page, because its balance and its
   * closing are that day's too. Without it the dialog asks.
   */
  day?: string;
  defaultCategory?: Category;
  submitLabel?: string;
  onSaved: () => void;
}) {
  const id = useId();
  const { toast } = useToast();
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
  const [errors, setErrors] = useState<string[]>([]);

  // Every opening is a new line: nothing half-typed follows somebody from the
  // last one.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDirection("SPENT");
      setAmount("");
      setCategory(defaultCategory);
      setDescription("");
      setOwnDay(todayKey());
      setProjectId(NONE);
      setRequisitionId(NONE);
      setInvoiceId(NONE);
      setReceipt(null);
      setClientEntryId(crypto.randomUUID());
      setErrors([]);
    }
  }

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
    enabled: open && asksRequisition,
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
    enabled: open && fixed.projectId === undefined,
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
    enabled: open && asksInvoice,
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
      toast({
        title: `${formatMoney(amount, currency)} ${direction === "SPENT" ? "spent" : "received"}`,
        description: `${description.trim()}, ${day === todayKey() ? "today" : formatDay(day)}.`,
      });
      onOpenChange(false);
      onSaved();
    },
    onError: (failure) => setErrors([getApiErrorMessage(failure)]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: string[] = [];
        if (!(Number(amount) > 0)) problems.push("Say how much.");
        if (!description.trim()) problems.push("Say what it was.");
        setErrors(problems);
        if (problems.length === 0) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      {fixed.direction ? null : (
        <SegmentedControl
          ariaLabel="Money in or out"
          value={chosenDirection}
          onValueChange={setDirection}
          options={DIRECTIONS}
          variant="border"
        />
      )}

      {/* A label over a control and nothing else. The labels are the nouns on
          the receipt — amount, category, description — and the control says
          the rest. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>Amount, {currency}</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="font-mono"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-category`}>Category</Label>
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
        </div>
      </div>

      <div className={chosenDay ? "space-y-1.5" : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"}>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>Description</Label>
          <Input
            id={`${id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {chosenDay ? null : (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-day`}>Day</Label>
            <Input
              id={`${id}-day`}
              type="date"
              className="font-mono"
              max={todayKey()}
              value={ownDay}
              onChange={(event) => setOwnDay(event.target.value)}
            />
          </div>
        )}
      </div>

      {asksRequisition || asksInvoice || fixed.projectId === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {asksRequisition ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-requisition`}>Paid from</Label>
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
            </div>
          ) : null}

          {asksInvoice ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-invoice`}>Invoice</Label>
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
            </div>
          ) : null}

          {fixed.projectId !== undefined ? null : asksProject ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-project`}>Project</Label>
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
            </div>
          ) : (
            // The requisition decides the project, so it is said rather than
            // asked — a control that cannot change anything is not offered.
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-project-fixed`}>Project</Label>
              <output
                id={`${id}-project-fixed`}
                className="flex min-h-9 items-center text-sm text-[var(--text-strong)]"
              >
                {pickedRequisition?.project?.name ?? "No project"}
              </output>
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-receipt`}>Receipt</Label>
        <ReceiptField id={`${id}-receipt`} value={receipt} onChange={setReceipt} />
      </div>
    </RecordDialog>
  );
}
