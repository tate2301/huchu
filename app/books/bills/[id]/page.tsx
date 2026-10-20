"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BkBillView } from "@/components/books/bk-bill-view";
import { DebitDrawer } from "@/components/books/bk-debit-drawer";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BillRecordPage } from "@/lib/books/bill-record";
import { uploadBooksFile } from "@/lib/books/upload-client";

type Page = BillRecordPage;

/**
 * One bill in Books (design/core-modules/boards/view/BkBill.html). The one
 * thing it waits for is the primary: a draft is finished in the bill form; one
 * over the limit is approved by the owner (A); a payment drafted for it is
 * approved (A) or paid (P); one owing is paid (P). The caret holds the rest,
 * each as `canDo` allows: the FDMS check, their invoice as a photo, a debit
 * note, a write-off, Print; then Revise (void, then a new draft linked to it;
 * D7), Void and Delete permanently as the core's `undoChoices` says, faint
 * with the reason on hover when not allowed. The server refuses on its own.
 */
export default function BooksBillPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [noting, setNoting] = React.useState<"debit-note" | "write-off" | null>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["books", "bill", id],
    queryFn: () => fetchJson<Page>(`/api/books/bills/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const bill = query.data;
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  const act = useMutation({
    mutationFn: (input: { url: string; method?: string; body?: unknown; done: string; description?: string }) =>
      fetchJson(input.url, { method: input.method ?? "PATCH", body: input.body === undefined ? undefined : JSON.stringify(input.body) }).then(() => input),
    onSuccess: async (input) => {
      toast({ title: input.done, description: input.description, variant: "success" });
      await refresh();
    },
    onError: (error) => toast({ title: "Nothing was changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const fdms = (status: "VALID" | "NOT_VALID") =>
    act.mutate({
      url: `/api/books/bills/${id}`,
      body: { action: "check", status },
      done: status === "VALID" ? "Valid on FDMS" : "Not valid on FDMS",
      description: status === "VALID" ? "Its VAT counts as input VAT now." : "Its VAT is not claimed until a valid invoice comes.",
    });

  const upload = async (file: File) => {
    try {
      const stored = await uploadBooksFile(file);
      await fetchJson(`/api/books/bills/${id}`, { method: "PATCH", body: JSON.stringify({ action: "photo", file: stored }) });
      toast({ title: "Their invoice is kept with the bill", variant: "success" });
      await refresh();
    } catch (error) {
      toast({ title: "Their invoice was not kept", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" });
    }
  };

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const can = bill?.can;
  const draft = bill?.status === "DRAFT";

  // The one thing the bill waits for, as the primary.
  let primary: React.ReactNode = null;
  if (bill && can) {
    if (draft && can.approve) {
      primary = (
        <Button variant="primary" icon="check" shortcut="A" busy={act.isPending} onClick={() => act.mutate({ url: `/api/books/bills/${id}`, body: { action: "approve" }, done: "Approved", description: "It can be recorded now." })}>
          Approve the bill
        </Button>
      );
    } else if (draft) {
      primary = (
        <ButtonLink variant="primary" icon="check" shortcut="R" href={`/books/bills/new?bill=${id}`}>
          Record the bill
        </ButtonLink>
      );
    } else if (can.approvePayment) {
      primary = (
        <Button
          variant="primary"
          icon="check"
          shortcut="A"
          busy={act.isPending}
          disabled={!can.approvePayment.allowed}
          title={can.approvePayment.allowed ? undefined : `${bill.owner ?? "The owner"} approves it.`}
          onClick={() => act.mutate({ url: `/api/books/payments-made/${can.approvePayment!.id}`, body: { action: "approve" }, done: "The payment is approved", description: "It can be paid now." })}
        >
          Approve the payment
        </Button>
      );
    } else if (can.payApproved) {
      primary = (
        <Button
          variant="primary"
          icon="payments"
          shortcut="P"
          busy={act.isPending}
          disabled={!can.payApproved.allowed}
          onClick={() => act.mutate({ url: `/api/books/payments-made/${can.payApproved!.id}`, body: { action: "pay" }, done: "Paid", description: "The money has left, and the bill shows it." })}
        >
          Pay
        </Button>
      );
    } else if (can.pay) {
      primary = (
        <ButtonLink variant="primary" icon="payments" shortcut="P" href={`/books/payments-made/new?supplier=${bill.supplier.id}&bills=${id}`}>
          Pay
        </ButtonLink>
      );
    }
  }

  // Void, Revise and Delete permanently, as the core's undoChoices says (P4). `?do=void|revise|delete` opens that dialog.
  const [initial, setInitial] = React.useState<string | null>(null);
  React.useEffect(() => setInitial(new URLSearchParams(window.location.search).get("do")), []);
  const undo = useUndoMenu("bill", bill?.id, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label} is void`, description: done.detail ?? "Its posting is reversed; payments on it stay as credit with the supplier.", variant: "success" });
      await refresh();
    },
    onRevised: async (done) => {
      toast({ title: `${done.label} is void`, description: "The new draft is open: put it right, then record it. Payments left on account move to it then.", variant: "success" });
      await refresh();
      router.push(`/books/bills/${done.draft.id}`);
    },
    onDeleted: async (done) => {
      toast({ title: `${done.label} is deleted`, description: draft ? undefined : "Payments on it stay on account; its snapshot is in the audit trail.", variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(draft ? "/books/bills?view=drafts" : "/books/bills");
    },
  });

  const menu: MenuEntry[] = [];
  if (bill && can) {
    if (can.check && bill.taxTotal > 0.005) {
      if (bill.fti.fdms !== "VALID") menu.push({ key: "valid", icon: "fiscal", label: "Valid on FDMS", onSelect: () => fdms("VALID") });
      if (bill.fti.fdms !== "NOT_VALID") menu.push({ key: "not-valid", icon: "fiscal", label: "Not valid on FDMS", onSelect: () => fdms("NOT_VALID") });
    }
    if (bill.photo) menu.push({ key: "open-photo", icon: "photo", label: "Their invoice", onSelect: () => window.open(bill.photo!.url, "_blank", "noopener") });
    if (can.check) menu.push({ key: "photo", icon: "camera", label: bill.photo ? "Replace their invoice" : "Add their invoice", onSelect: () => photoInput.current?.click() });
    if (can.note) menu.push({ key: "debit", icon: "invoice", label: "Debit note", onSelect: () => setNoting("debit-note") });
    if (can.writeOff) menu.push({ key: "write-off", icon: "retire", label: "Write off", onSelect: () => setNoting("write-off") });
    menu.push({ key: "print", icon: "print", label: "Print", onSelect: () => window.print() });
    // Revise, Void and Delete: the core says which this person may press, and why not (rule 12).
    menu.push(...undo.entries);
  }

  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!bill) return null;
    return menu.flatMap((entry) => ("key" in entry && !entry.disabled ? [{ key: entry.key, label: typeof entry.label === "string" ? entry.label : entry.key, danger: entry.danger, onSelect: entry.onSelect }] : []));
    // Rebuilt from the bill on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill, undo.choices]);

  return (
    <>
      <PageChrome title={bill?.number ?? "Bill"} backHref="/books/bills" backLabel="Bills" phoneMenu={phoneMenu}>
        {bill ? (
          <Kit contents>
            {primary && menu.length ? (
              <ButtonGroup aria-label="The next step, and more">
                {primary}
                <MenuButton variant="primary" iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
              </ButtonGroup>
            ) : primary ? (
              primary
            ) : menu.length ? (
              <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
            ) : null}
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-a">
        {bill ? (
          <BkBillView bill={bill} />
        ) : notFound ? (
          <Empty icon="docs" title="There is no such bill here">
            It may have been deleted, or it belongs to another workspace. Bills lists every one this workspace has.
          </Empty>
        ) : query.isError ? (
          <BooksError what="This bill" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <input
        ref={photoInput}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {bill ? (
        <>
          {undo.node}
          <DebitDrawer
            kind={noting ?? "debit-note"}
            target={{ id: bill.id, number: bill.number, supplier: bill.supplier.name, currency: bill.currency, balance: bill.balance, taxRate: bill.subTotal > 0 ? Math.round((bill.taxTotal / bill.subTotal) * 1000) / 10 : 0 }}
            open={noting !== null}
            onOpenChange={(open) => (open ? undefined : setNoting(null))}
            onDone={async (message) => {
              toast({ ...message, variant: "success" });
              await refresh();
            }}
          />
        </>
      ) : null}
    </>
  );
}
