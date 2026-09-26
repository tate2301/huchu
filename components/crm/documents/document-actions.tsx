"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";
import {
  Check,
  Download,
  FileText,
  Mail,
  Payments,
  Pencil,
  ReceiptLong,
  RefreshCw,
  Send,
  type LucideIcon,
} from "@/lib/icons";

import { DepositDialog } from "./deposit-dialog";
import { DocumentBuilderSheet } from "./document-builder-sheet";
import {
  documentEditLock,
  documentNumber,
  documentStatus,
  formatMoney,
  invoiceOutstanding,
  type LeadDocument,
} from "./document-types";
import { RecordPaymentSheet } from "./record-payment-sheet";

type ApprovalLink = { token: string; path: string; issued: boolean };

/**
 * The link the customer clicks. Built on the host the rep is already on, so a
 * tenant reading their workspace at `acme.example.com` sends a link to the
 * same place rather than to a domain their customer cannot resolve.
 */
function approvalUrl(link: ApprovalLink): string {
  return `${window.location.origin}${link.path}`;
}

/**
 * One thing that can be done to a document, as data.
 *
 * The deal's document list draws these as menu items and the document's own
 * page draws them as its primary action and its menu — the same verbs, the
 * same rules for when each is offered, from one place. They were a hundred
 * lines of menu inside the list, which the document page could not have
 * reached without copying them.
 */
export type DocumentVerb = {
  id:
    | "view"
    | "download"
    | "edit"
    | "share"
    | "replace-link"
    | "email"
    | "convert"
    | "deposit"
    | "part-payment"
    | "settle";
  label: string;
  icon: LucideIcon;
  /** Verbs are drawn in groups, a rule between each. */
  group: "read" | "change" | "send" | "bill" | "pay";
  tone?: "primary" | "destructive" | "positive";
  /** Offered but refused, with why — an invoice's edit, where the way round is not obvious. */
  refusal?: string;
  /** A verb that is a place: the PDF. */
  href?: string;
  newTab?: boolean;
  onSelect?: () => void;
};

type BuilderState = {
  mode: "quotation" | "invoice";
  fromQuotationId?: string;
  deposit?: boolean;
  /** Opens the builder on an existing quote or invoice, prefilled. */
  editing?: { documentId: string; number: string; version: number };
} | null;

/**
 * Everything a document can have done to it on a lead's or a deal's behalf:
 * the verbs, the mutations behind them, and the builder, deposit and payment
 * surfaces they open.
 *
 * `basePath` is the record the document hangs off — every document route
 * (`/documents/<id>/pdf`, `/approval`, `/email`, `/receipt`) lives under it.
 */
export function useDocumentActions({
  basePath,
  currency,
  prefillLines,
  onPrefillConsumed,
}: {
  basePath: string;
  currency: string;
  prefillLines?: Parameters<typeof DocumentBuilderSheet>[0]["prefillLines"];
  onPrefillConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [paymentFor, setPaymentFor] = useState<LeadDocument | null>(null);
  const [depositFor, setDepositFor] = useState<LeadDocument | null>(null);
  const [depositLine, setDepositLine] =
    useState<Parameters<typeof DocumentBuilderSheet>[0]["prefillLines"]>(undefined);

  const shareApproval = useMutation({
    // `{ token, path, issued }`, bare. `successResponse` adds no envelope of
    // its own, and declaring one here is why sharing a quote produced a link
    // ending in `/undefined` — a lie the compiler accepted, surfacing only
    // when a customer clicked it.
    //
    // `rotate` is what the two verbs differ by. Without it the endpoint hands
    // back the link the customer already has; with it, that link stops
    // working. Copying used to rotate, so re-reading a link to forward it
    // silently killed the copy already in the customer's inbox.
    mutationFn: ({ docId, rotate }: { docId: string; rotate?: boolean }) =>
      fetchJson<ApprovalLink>(`${basePath}/documents/${docId}/approval`, {
        method: "POST",
        body: JSON.stringify(rotate ? { rotate: true } : {}),
      }),
    onSuccess: async (result) => {
      const url = approvalUrl(result);
      const title = result.issued ? "New approval link copied" : "Approval link copied";
      try {
        await navigator.clipboard?.writeText(url);
        toast({ title, description: url });
      } catch {
        // Clipboard is blocked in some browsers without a user gesture chain;
        // showing the link is still useful.
        toast({ title: "Approval link ready", description: url });
      }
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not create the approval link",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  /**
   * Send the document to the client, from the platform: the server renders
   * the PDF, attaches it, puts the approval link in the body, and sends it as
   * the company. The two refusals a rep can act on come back as their own
   * messages — no address on the record, and no mail provider configured.
   */
  const emailToClient = useMutation({
    mutationFn: (doc: LeadDocument) =>
      fetchJson<{ to: string; subject: string }>(`${basePath}/documents/${doc.id}/email`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (sent) => {
      toast({ title: "Sent", description: `Emailed to ${sent.to}` });
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not send the email",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const settle = useMutation({
    mutationFn: (doc: LeadDocument) =>
      fetchJson(`${basePath}/receipt`, {
        method: "POST",
        body: JSON.stringify({
          invoiceDocumentId: doc.id,
          amount: doc.invoice ? invoiceOutstanding(doc.invoice) : doc.amount,
          method: "Bank transfer",
        }),
      }),
    onSuccess: () => {
      // The receipt is the point: an invoice marked paid with nothing issued
      // to the customer is a number changed in a database.
      toast({ title: "Invoice settled", description: "A receipt has been raised." });
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not settle the invoice",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  /** What may be done to this document, by whoever is looking, in the order it is drawn. */
  const verbsFor = (doc: LeadDocument): DocumentVerb[] => {
    const status = documentStatus(doc);
    const outstanding = doc.invoice ? invoiceOutstanding(doc.invoice) : 0;
    const editLock = documentEditLock(doc);
    const openEditor = () =>
      setBuilder({
        mode: doc.type === "INVOICE" ? "invoice" : "quotation",
        editing: { documentId: doc.id, number: documentNumber(doc), version: doc.version },
      });
    const verbs: DocumentVerb[] = [
      {
        id: "view",
        label: "View PDF",
        icon: FileText,
        group: "read",
        href: `${basePath}/documents/${doc.id}/pdf`,
        newTab: true,
      },
      {
        id: "download",
        label: "Download PDF",
        icon: Download,
        group: "read",
        href: `${basePath}/documents/${doc.id}/pdf?download=1`,
      },
    ];

    // A quote that can no longer change is simply not offered the verb: an
    // accepted quote is an agreement, and a new quote is the next step. An
    // invoice keeps the verb and says why it is locked, because what to do
    // instead — a credit note in Accounting — is not obvious from here.
    if (doc.type === "QUOTATION" && !editLock) {
      verbs.push({ id: "edit", label: "Edit", icon: Pencil, group: "change", onSelect: openEditor });
    }
    if (doc.type === "INVOICE") {
      verbs.push(
        editLock
          ? { id: "edit", label: "Edit", icon: Pencil, group: "change", refusal: editLock }
          : { id: "edit", label: "Edit", icon: Pencil, group: "change", onSelect: openEditor },
      );
    }

    if (doc.type !== "RECEIPT") {
      verbs.push({
        id: "share",
        label: doc.approval ? "Copy approval link" : "Send for approval",
        icon: Send,
        group: "send",
        tone: "primary",
        onSelect: () => shareApproval.mutate({ docId: doc.id }),
      });
      // Withdrawing a link is its own decision, and a destructive one:
      // whatever the customer was sent stops working. It is not what copying
      // does.
      if (doc.approval) {
        verbs.push({
          id: "replace-link",
          label: "Replace the link",
          icon: RefreshCw,
          group: "send",
          tone: "destructive",
          onSelect: () => shareApproval.mutate({ docId: doc.id, rotate: true }),
        });
      }
      verbs.push({
        id: "email",
        label: emailToClient.isPending ? "Sending…" : "Email to the client",
        icon: Mail,
        group: "send",
        tone: "primary",
        onSelect: () => emailToClient.mutate(doc),
      });
    }

    const canConvert =
      doc.type === "QUOTATION" &&
      Boolean(doc.quotationId) &&
      status.label !== "Declined" &&
      status.label !== "Voided";
    if (canConvert) {
      verbs.push(
        {
          id: "convert",
          label: "Convert to invoice",
          icon: ReceiptLong,
          group: "bill",
          onSelect: () => setBuilder({ mode: "invoice", fromQuotationId: doc.quotationId ?? undefined }),
        },
        {
          id: "deposit",
          label: "Request a deposit",
          icon: Payments,
          group: "bill",
          onSelect: () => setDepositFor(doc),
        },
      );
    }

    if (doc.type === "INVOICE" && outstanding > 0) {
      verbs.push(
        {
          id: "part-payment",
          label: "Record a part payment",
          icon: Payments,
          group: "pay",
          onSelect: () => setPaymentFor(doc),
        },
        // The whole balance, one press, receipt raised. The sheet is for a
        // part payment — this is for the invoice that has simply been settled.
        {
          id: "settle",
          label: `Settle in full (${formatMoney(outstanding, doc.currency)})`,
          icon: Check,
          group: "pay",
          tone: "positive",
          onSelect: () => settle.mutate(doc),
        },
      );
    }

    return verbs;
  };

  const surfaces = (
    <>
      <DocumentBuilderSheet
        open={Boolean(builder)}
        onOpenChange={(next) => {
          if (!next) {
            setBuilder(null);
            setDepositLine(undefined);
            onPrefillConsumed?.();
          }
        }}
        basePath={basePath}
        mode={builder?.mode ?? "quotation"}
        currency={currency}
        fromQuotationId={builder?.fromQuotationId}
        isDeposit={builder?.deposit}
        editing={builder?.editing}
        prefillLines={
          depositLine ?? (builder?.fromQuotationId || builder?.editing ? undefined : prefillLines)
        }
      />

      <DepositDialog
        open={Boolean(depositFor)}
        onOpenChange={(next) => (!next ? setDepositFor(null) : undefined)}
        quotation={depositFor}
        onConfirm={(line) => {
          // The deposit is a one-line invoice, so the builder opens on it
          // rather than on the whole quote.
          setDepositLine([line]);
          setBuilder({ mode: "invoice", deposit: true });
        }}
      />

      <RecordPaymentSheet
        open={Boolean(paymentFor)}
        onOpenChange={(next) => (!next ? setPaymentFor(null) : undefined)}
        basePath={basePath}
        document={paymentFor}
      />
    </>
  );

  return {
    verbsFor,
    /** Opens the builder on a new quote or invoice for the record. */
    create: (mode: "quotation" | "invoice") => setBuilder({ mode }),
    surfaces,
  };
}

/** A document's verbs as menu items, a rule between each group. */
export function DocumentVerbMenuItems({ verbs }: { verbs: DocumentVerb[] }): ReactNode {
  return verbs.map((verb, index) => {
    const Icon = verb.icon;
    const rule = index > 0 && verbs[index - 1]!.group !== verb.group;
    const variant =
      verb.tone === "primary" || verb.tone === "destructive" || verb.tone === "positive"
        ? verb.tone
        : undefined;
    return (
      <Fragment key={verb.id}>
        {rule ? <DropdownMenuSeparator /> : null}
        {verb.refusal ? (
          <DropdownMenuItem disabled title={verb.refusal}>
            <Icon />
            <span className="min-w-0 whitespace-normal">
              {verb.label}
              <span className="block text-sm">{verb.refusal}</span>
            </span>
          </DropdownMenuItem>
        ) : verb.href ? (
          <DropdownMenuItem asChild>
            <a
              href={verb.href}
              target={verb.newTab ? "_blank" : undefined}
              rel={verb.newTab ? "noreferrer" : undefined}
              className="flex items-center gap-2"
            >
              <Icon />
              {verb.label}
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant={variant} onClick={verb.onSelect}>
            <Icon />
            {verb.label}
          </DropdownMenuItem>
        )}
      </Fragment>
    );
  });
}
