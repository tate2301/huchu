"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkPaymentOutView } from "@/components/books/bk-payment-out-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { PaymentOutRecordPage } from "@/lib/books/payment-out-record";

type Move = { action: "submit" | "approve" | "reject" | "pay" | "void"; note?: string; reason?: string };

/**
 * One payment made in Books (design/books/html/bk-payment-made.html). The bar
 * offers the next move for whoever may make it: Send for approval, Approve (A),
 * Pay (P). Reject, Delete and Void sit under the menu; the server refuses on
 * its own and the page says why in one line.
 */
export default function BooksPaymentMadePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const client = useQueryClient();
  const { toast } = useToast();
  const [asking, setAsking] = React.useState<"reject" | "void" | null>(null);

  const query = useQuery({
    queryKey: ["books", "payment-made", id],
    queryFn: () => fetchJson<PaymentOutRecordPage>(`/api/books/payments-made/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = query.data;
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  const move = useMutation({
    mutationFn: (input: Move) => fetchJson(`/api/books/payments-made/${id}`, { method: "PATCH", body: JSON.stringify(input) }).then(() => input),
    onSuccess: async (input) => {
      const words: Record<Move["action"], string> = { submit: "is sent for approval", approve: "is approved", reject: "is sent back as a draft", pay: "is paid", void: "is void" };
      toast({ title: `${record?.number ?? "The payment"} ${words[input.action]}`, variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast({ title: "Nothing was changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/books/payments-made/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "The payment is deleted", variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push("/books/payments-made");
    },
    onError: (error) => toast({ title: "It was not deleted", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const can = record?.can;
  const primary = !record || !can
    ? undefined
    : record.status === "DRAFT" && can.submit
      ? { label: "Send for approval", icon: "send" as const, shortcut: "Ctrl ↵", onClick: () => move.mutate({ action: "submit" }), disabled: move.isPending ? "Saving it" : undefined }
      : record.status === "TO_APPROVE" && can.approve.allowed
        ? { label: "Approve", icon: "check" as const, shortcut: "A", onClick: () => move.mutate({ action: "approve" }), disabled: move.isPending ? "Saving it" : undefined }
        : record.status === "APPROVED" && can.pay.allowed
          ? { label: "Pay", icon: "payments" as const, shortcut: "P", onClick: () => move.mutate({ action: "pay" }), disabled: move.isPending ? "Saving it" : undefined }
          : undefined;

  const menu: MenuEntry[] = record && can
    ? [
        ...(record.status === "TO_APPROVE" && can.approve.allowed ? [{ key: "reject", icon: "x" as const, label: "Reject", onSelect: () => setAsking("reject") }] : []),
        ...(can.delete ? [{ key: "delete", icon: "x" as const, danger: true, label: "Delete", onSelect: () => remove.mutate() }] : []),
        ...(can.void ? [{ key: "void", icon: "x" as const, danger: true, label: `Void ${record.number ?? "the payment"}`, onSelect: () => setAsking("void") }] : []),
      ]
    : [];

  const title = record ? (record.number ?? (record.supplier ? `Pay ${record.supplier.name}` : "Payment")) : "Payment";

  return (
    <>
      <PageChrome title={title} backHref="/books/payments-made" backLabel="Payments made" primary={primary}>
        {menu.length ? (
          <Kit contents>
            <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-a">
        {record ? (
          <BkPaymentOutView record={record} />
        ) : notFound ? (
          <Empty icon="hand" title="There is no such payment here">
            It may have been deleted as a draft, or it belongs to another workspace.
          </Empty>
        ) : query.isError ? (
          <BooksError what="This payment" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {record ? (
        <ReasonDrawer
          open={asking !== null}
          onOpenChange={(open) => (open ? undefined : setAsking(null))}
          title={asking === "void" ? `Void ${record.number ?? "the payment"}` : `Reject ${record.number ?? "the payment"}`}
          sub={`${record.supplier?.name ?? "Supplier"}, ${money(record.gross, record.currency)}`}
          what={asking === "void" ? "Its posting is reversed by a mirror entry dated today, its bank line opens again, and the bill is owing again." : "It goes back to a draft, with your reason."}
          label={asking === "void" ? "Void the payment" : "Reject"}
          danger={asking === "void"}
          placeholder={asking === "void" ? "Paid twice" : "Not this week"}
          onConfirm={async (reason) => {
            await move.mutateAsync(asking === "void" ? { action: "void", reason } : { action: "reject", note: reason });
          }}
        />
      ) : null}
    </>
  );
}
