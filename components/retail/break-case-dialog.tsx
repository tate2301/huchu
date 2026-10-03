"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { useInvalidateProducts } from "@/components/retail/product-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BreakCaseResult } from "@/lib/retail/cases";

/**
 * Open cases onto the shelf as singles.
 *
 * What a stock clerk does when the fridge runs low: one case out, its bottles
 * in, both counted. The dialog says what will happen in the button's own words.
 */
export function BreakCaseDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    packSize: number | null;
    packOf: { id: string; name: string } | null;
    site: { id: string } | null;
    inventoryItem: { currentStock: number } | null;
  };
}) {
  const [count, setCount] = useState("1");
  const [errors, setErrors] = useState<string[]>([]);
  const { toast } = useToast();
  const invalidate = useInvalidateProducts();
  const cases = Number(count);
  const valid = Number.isInteger(cases) && cases >= 1;
  const size = product.packSize ?? 0;

  const open_ = useMutation({
    mutationFn: () =>
      fetchJson<{ data: BreakCaseResult }>(`/api/v2/retail/catalog/${product.id}/break-case`, {
        method: "POST",
        body: JSON.stringify({ siteId: product.site?.id, cases }),
      }),
    onSuccess: (result) => {
      toast({
        title: `${result.data.singles} × ${product.packOf?.name ?? "singles"} on the shelf`,
        description: `${result.data.caseStock} ${result.data.caseStock === 1 ? "case" : "cases"} left`,
        variant: "success",
      });
      invalidate();
      setCount("1");
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open cases"
      description={`Move ${product.name} onto the shelf as singles`}
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setErrors(["Open at least one whole case."]);
          return;
        }
        setErrors([]);
        open_.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={open_.isPending || !valid}>
            {valid ? `Open ${cases} into ${cases * size} singles` : "Open cases"}
          </Button>
        </>
      }
    >
      <FormField label="Cases to open">
        {(id) => (
          <Input
            id={id}
            inputMode="numeric"
            className="font-mono"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        )}
      </FormField>
      <p className="text-sm text-[var(--text-muted)]">
        {product.inventoryItem?.currentStock ?? 0} on hand · {size} × {product.packOf?.name} in each
      </p>
    </RecordDialog>
  );
}
