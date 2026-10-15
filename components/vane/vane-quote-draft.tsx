"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Icon, Kit } from "@/components/core";
import { RailSection } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { VaneQuoteView } from "@/lib/vane/blocks";

/**
 * Where a quote's prices came from, in its rail: each line priced from the
 * knowledge base, with the document it went by, and each that is Vane's
 * estimate. On Vane's draft it also says so, and offers Issue it (the quote
 * becomes the person's, sent as any quote is) and Delete the draft. A quote
 * nothing in the knowledge base priced shows nothing here.
 */
export function VaneQuoteDraft({ documentId }: { documentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(false);
  const key = ["crm", "documents", documentId, "vane"];
  const query = useQuery({ queryKey: key, queryFn: () => fetchJson<{ data: VaneQuoteView; canDecide: boolean }>(`/api/v2/crm/documents/${documentId}/vane`) });

  const issue = useMutation({
    mutationFn: () => fetchJson<{ number: string }>(`/api/v2/crm/documents/${documentId}/vane`, { method: "POST" }),
    onSuccess: async (done) => {
      toast({ title: `${done.number} is issued`, description: "It is yours now. Send it when you are ready.", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["crm"] });
      router.refresh();
    },
    onError: (error) => toast({ title: "It was not issued", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const quote = query.data?.data;
  if (!quote) return null;
  const draft = quote.madeByVane && quote.status === "Draft";
  const sourced = quote.lines.filter((line) => line.source);
  if (!draft && sourced.length === 0) return null;
  const canDecide = query.data?.canDecide ?? false;

  return (
    <RailSection title={draft ? "Vane's draft" : "Priced from your knowledge"}>
      <Kit className="vr">
        {draft ? (
          <p className="vr-none">
            Vane drafted this quote. Nothing is sent until you issue it.
            {quote.unpriced > 0
              ? ` ${quote.unpriced === 1 ? "1 line is" : `${quote.unpriced} lines are`} Vane's estimate: nothing in your knowledge prices ${quote.unpriced === 1 ? "it" : "them"}, so check ${quote.unpriced === 1 ? "it" : "them"}.`
              : " Every price is from your knowledge."}
          </p>
        ) : null}
        <ul className="vq-src">
          {quote.lines.map((line, index) => (
            <li key={index}>
              <span className="vq-d">{line.description}</span>
              {line.source ? (
                <Link href={line.source.href} className="link">
                  {line.source.title}
                </Link>
              ) : (
                <span className="vb-warn">
                  <Icon name="warn" /> Vane&rsquo;s estimate
                </span>
              )}
            </li>
          ))}
        </ul>
        {draft && canDecide ? (
          <div className="vc-a" style={{ marginTop: "var(--space-4)" }}>
            <Button size="sm" icon="send" busy={issue.isPending} disabled={issue.isPending} onClick={() => issue.mutate()}>
              Issue it
            </Button>
            <Button size="sm" variant="quiet" disabled={issue.isPending} onClick={() => setDeleting(true)}>
              Delete the draft
            </Button>
          </div>
        ) : null}
      </Kit>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        ask={{ title: `Delete ${quote.number}?`, body: "Vane's draft goes. Nothing was sent.", keep: "Keep it", go: "Delete the draft", fill: "bad" }}
        onConfirm={async () => {
          try {
            await fetchJson(`/api/v2/crm/documents/${documentId}/vane`, { method: "DELETE" });
          } catch (error) {
            throw new Error(getApiErrorMessage(error));
          }
          toast({ title: `${quote.number} is deleted`, variant: "success" });
          await queryClient.invalidateQueries({ queryKey: ["crm"] });
          router.push("/crm/quotes");
        }}
      />
    </RailSection>
  );
}
