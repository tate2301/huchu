"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Kit, KitScreen } from "@/components/core";
import { BooksLoading } from "@/components/books/books-state";
import { PageChrome } from "@/components/layout/page-chrome";
import { WorkOrderRecordView } from "@/components/maintenance/work-order-record-view";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { WorkOrderRecord } from "@/lib/maintenance/work-order-record";

/**
 * One equipment work order (the PageVaneMine board). Vane's draft is raised
 * from here, which tells the workshop, or deleted; while it is a draft, who
 * fixes it and how urgently can be changed.
 */
export default function WorkOrderPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(false);
  const key = ["work-order", id];

  const order = useQuery({
    queryKey: key,
    queryFn: () => fetchJson<WorkOrderRecord>(`/api/work-orders/${id}`),
    enabled: Boolean(id),
  });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: ["work-orders"] })]);

  const change = useMutation({
    mutationFn: (body: { technicianId?: string | null; priority?: WorkOrderRecord["priority"] }) =>
      fetchJson(`/api/work-orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refresh,
    onError: (error) => toast({ title: "That did not change", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const raise = useMutation({
    mutationFn: () => fetchJson(`/api/work-orders/${id}/raise`, { method: "POST" }),
    onSuccess: async () => {
      toast({ title: "The work order is raised", description: "The workshop has been told.", variant: "success" });
      await refresh();
    },
    onError: (error) => toast({ title: "It was not raised", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const record = order.data;
  const draft = record?.status === "DRAFT";
  const busy = raise.isPending || change.isPending;
  return (
    <>
      <PageChrome
        title={draft ? "Work order · draft" : "Work order"}
        reference={record?.equipment.label ?? null}
        backHref="/maintenance/work-orders"
        backLabel="Work orders"
        primary={draft ? { label: "Raise the work order", icon: "send", onClick: () => raise.mutate(), shortcut: "R", disabled: busy ? "Saving" : undefined } : null}
      >
        {draft && record.madeByVane ? (
          <Button icon="x" disabled={busy} onClick={() => setDeleting(true)}>
            Delete the draft
          </Button>
        ) : null}
      </PageChrome>
      <Kit className="kit-main">
        <KitScreen slug="maintenance-work-order">
          <div className="mn" style={{ flex: 1, minHeight: 0 }}>
            {record ? (
              <WorkOrderRecordView order={record} saving={busy} onChange={(body) => change.mutate(body)} />
            ) : order.isError ? (
              <Empty
                icon="warn"
                title="This work order did not load"
                action={
                  <Button icon="history" onClick={() => order.refetch()}>
                    Try again
                  </Button>
                }
              >
                {getApiErrorMessage(order.error, "Check the connection and try again.")}
              </Empty>
            ) : (
              <BooksLoading />
            )}
          </div>
        </KitScreen>
      </Kit>
      {record ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          ask={{
            title: "Delete Vane's draft?",
            body: `The work order for ${record.equipment.label} goes. Nobody was told of it.`,
            keep: "Keep it",
            go: "Delete the draft",
            fill: "bad",
          }}
          onConfirm={async () => {
            try {
              await fetchJson(`/api/work-orders/${id}`, { method: "DELETE" });
            } catch (error) {
              throw new Error(getApiErrorMessage(error));
            }
            toast({ title: "The draft is deleted", variant: "success" });
            await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
            router.push("/maintenance/work-orders");
          }}
        />
      ) : null}
    </>
  );
}
