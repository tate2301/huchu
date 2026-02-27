"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AccountingEditableListView } from "@/components/accounting/listview/accounting-editable-list-view";

type LineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  taxRate: string;
  debit: string;
  credit: string;
};

type TaxOption = {
  id: string;
  code: string;
  rate: number;
};

type AccountingLineItemsListViewProps = {
  title: string;
  lines: LineItem[];
  taxOptions: TaxOption[];
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onChangeLine: (index: number, field: keyof LineItem, value: string) => void;
  canRemoveLine: (index: number) => boolean;
  footer?: React.ReactNode;
};

export function AccountingLineItemsListView({
  title,
  lines,
  taxOptions,
  onAddLine,
  onRemoveLine,
  onChangeLine,
  canRemoveLine,
  footer,
}: AccountingLineItemsListViewProps) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const activeLine = editIndex === null ? null : lines[editIndex] ?? null;

  const columns = useMemo(() => [
    {
      key: "description",
      label: "Description",
      width: "2fr",
      renderCell: ({ row }: { row: LineItem }) => row.description || "-",
    },
    {
      key: "quantity",
      label: "Qty",
      width: "120px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => (
        <span className="font-mono">{Number(row.quantity || 0).toFixed(2)}</span>
      ),
    },
    {
      key: "unitPrice",
      label: "Unit Price",
      width: "140px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => (
        <span className="font-mono">{Number(row.unitPrice || 0).toFixed(2)}</span>
      ),
    },
    {
      key: "taxCode",
      label: "Tax Code",
      width: "180px",
      renderCell: ({ row }: { row: LineItem }) => {
        const tax = taxOptions.find((option) => option.id === row.taxCodeId);
        return tax ? `${tax.code} (${tax.rate}%)` : "No tax";
      },
    },
    {
      key: "taxRate",
      label: "Tax %",
      width: "120px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => (
        <span className="font-mono">{Number(row.taxRate || 0).toFixed(2)}</span>
      ),
    },
    {
      key: "debit",
      label: "Debit",
      width: "120px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => (
        <span className="font-mono">{Number(row.debit || 0).toFixed(2)}</span>
      ),
    },
    {
      key: "credit",
      label: "Credit",
      width: "120px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => (
        <span className="font-mono">{Number(row.credit || 0).toFixed(2)}</span>
      ),
    },
    {
      key: "balance",
      label: "Balance",
      width: "120px",
      align: "right" as const,
      renderCell: ({ row }: { row: LineItem }) => {
        const balance = Number(row.debit || 0) - Number(row.credit || 0);
        return <span className="font-mono">{balance.toFixed(2)}</span>;
      },
    },
    {
      key: "actions",
      label: "",
      width: "120px",
      align: "right" as const,
      renderCell: ({ rowIndex }: { rowIndex: number }) => (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditIndex(rowIndex)}>
            Edit
          </Button>
          {canRemoveLine(rowIndex) ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onRemoveLine(rowIndex)}>
              Remove
            </Button>
          ) : null}
        </div>
      ),
    },
  ], [taxOptions, canRemoveLine, onRemoveLine]);

  return (
    <>
      <AccountingEditableListView
        title={title}
        addLabel="Add Line"
        onAddRow={onAddLine}
        rows={lines}
        getRowKey={(_, index) => `line_${index}`}
        columns={columns}
        footer={footer}
      />

      <Sheet open={editIndex !== null} onOpenChange={(open) => !open && setEditIndex(null)}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Edit Line Item</SheetTitle>
            <SheetDescription>Update line details and save changes instantly.</SheetDescription>
          </SheetHeader>
          {activeLine ? (
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">Description</label>
                <Input
                  value={activeLine.description}
                  onChange={(event) => onChangeLine(editIndex as number, "description", event.target.value)}
                  placeholder="Service or product"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Qty</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLine.quantity}
                    onChange={(event) => onChangeLine(editIndex as number, "quantity", event.target.value)}
                    className="text-right font-mono"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Unit Price</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLine.unitPrice}
                    onChange={(event) => onChangeLine(editIndex as number, "unitPrice", event.target.value)}
                    className="text-right font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Tax Code</label>
                  <Select
                    value={activeLine.taxCodeId}
                    onValueChange={(value) => onChangeLine(editIndex as number, "taxCodeId", value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No tax</SelectItem>
                      {taxOptions.map((tax) => (
                        <SelectItem key={tax.id} value={tax.id}>
                          {tax.code} ({tax.rate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Tax %</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLine.taxRate}
                    onChange={(event) => onChangeLine(editIndex as number, "taxRate", event.target.value)}
                    className="text-right font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Debit</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLine.debit}
                    onChange={(event) => onChangeLine(editIndex as number, "debit", event.target.value)}
                    className="text-right font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Credit</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLine.credit}
                    onChange={(event) => onChangeLine(editIndex as number, "credit", event.target.value)}
                    className="text-right font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

export type { LineItem };

