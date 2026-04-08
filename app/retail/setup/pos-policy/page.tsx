"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

const TENDER_TYPES = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;

type TenderPolicyPayload = {
  data: {
    requiredReferenceTenders: string[];
    minReferenceLength: number;
    referencePattern: string;
  };
};

export default function RetailPosPolicyPage() {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["retail-tender-policy"],
    queryFn: () => fetchJson<TenderPolicyPayload>("/api/v2/retail/setup/tender-policy"),
  });

  const [requiredReferenceTenders, setRequiredReferenceTenders] = useState<string[]>([]);
  const [minReferenceLength, setMinReferenceLength] = useState("4");
  const [referencePattern, setReferencePattern] = useState("^[A-Za-z0-9][A-Za-z0-9\\-/_ ]*$");

  useEffect(() => {
    if (!query.data?.data) return;
    setRequiredReferenceTenders(query.data.data.requiredReferenceTenders);
    setMinReferenceLength(String(query.data.data.minReferenceLength));
    setReferencePattern(query.data.data.referencePattern);
  }, [query.data?.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/setup/tender-policy", {
        method: "PUT",
        body: JSON.stringify({
          requiredReferenceTenders,
          minReferenceLength: Number(minReferenceLength || "4"),
          referencePattern,
        }),
      }),
    onSuccess: () => toast({ title: "POS policy saved", variant: "success" }),
    onError: (error) =>
      toast({
        title: "Unable to save POS policy",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <RetailShell
      title="POS Policy"
      description="Configure tender reference controls used across POS sale and refund posting."
    >
      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Label>Tenders requiring reference</Label>
            <div className="space-y-2">
              {TENDER_TYPES.map((tender) => {
                const checked = requiredReferenceTenders.includes(tender);
                return (
                  <label key={tender} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setRequiredReferenceTenders((current) =>
                          next ? [...new Set([...current, tender])] : current.filter((value) => value !== tender),
                        );
                      }}
                    />
                    <span>{tender.replaceAll("_", " ")}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Minimum reference length</Label>
              <Input value={minReferenceLength} onChange={(event) => setMinReferenceLength(event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label>Reference regex</Label>
              <Input value={referencePattern} onChange={(event) => setReferencePattern(event.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={requiredReferenceTenders.length === 0 || saveMutation.isPending}
          >
            Save POS policy
          </Button>
        </div>
      </div>
    </RetailShell>
  );
}
