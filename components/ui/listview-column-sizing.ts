import * as React from "react";

type AlignValue = "left" | "center" | "right" | string | undefined;

type ColumnLike<TRow extends Record<string, unknown>> = {
  key: keyof TRow & string;
  label: React.ReactNode;
  align?: AlignValue;
};

type ComputeListViewColumnWidthsOptions<TRow extends Record<string, unknown>> = {
  columns: ColumnLike<TRow>[];
  rows: TRow[];
  getCellContent?: (row: TRow, column: ColumnLike<TRow>) => unknown;
  primaryColumnKeys?: string[];
  numericColumnKeys?: string[];
  sampleSize?: number;
  baseMinWidthPx?: number;
  numericMinWidthPx?: number;
  primaryMinWidthPx?: number;
  horizontalPaddingPx?: number;
  characterWidthPx?: number;
};

const PRIMARY_COLUMN_PATTERN =
  /\b(name|title|description|employee|account|vendor|customer|reference|item|subject|site|group)\b/i;
const NUMERIC_COLUMN_PATTERN =
  /\b(amount|total|balance|value|qty|quantity|count|number|no\.?|id|rate|price|cost|weight|hours|days|percent|percentage|debit|credit|paid|due|net|gross)\b/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  ) {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((value) => extractNodeText(value)).join(" ");
  }

  if (!React.isValidElement(node)) {
    return "";
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (element.type === React.Fragment) {
    return extractNodeText(element.props.children);
  }

  return extractNodeText(element.props.children);
}

export function inferPrimaryColumnKeys<TRow extends Record<string, unknown>>(
  columns: ColumnLike<TRow>[],
): string[] {
  if (columns.length === 0) return [];

  const primaryKeys: string[] = [columns[0].key];
  const prioritized = columns.find((column) => {
    const signature = `${column.key} ${normalizeText(extractNodeText(column.label))}`;
    return PRIMARY_COLUMN_PATTERN.test(signature);
  });

  if (prioritized && !primaryKeys.includes(prioritized.key)) {
    primaryKeys.push(prioritized.key);
  }

  return primaryKeys;
}

export function inferNumericColumnKeys<TRow extends Record<string, unknown>>(
  columns: ColumnLike<TRow>[],
): string[] {
  const keys: string[] = [];

  for (const column of columns) {
    const signature = `${column.key} ${normalizeText(extractNodeText(column.label))}`;
    const isNumericByAlign = column.align === "right";
    const isNumericByPattern = NUMERIC_COLUMN_PATTERN.test(signature);
    if (isNumericByAlign || isNumericByPattern) {
      keys.push(column.key);
    }
  }

  return keys;
}

function toEstimatedTextWidthPx(value: unknown, characterWidthPx: number): number {
  const text = normalizeText(extractNodeText(value as React.ReactNode));
  if (!text) return 0;
  return Math.ceil(text.length * characterWidthPx);
}

export function computeListViewColumnWidths<TRow extends Record<string, unknown>>({
  columns,
  rows,
  getCellContent,
  primaryColumnKeys,
  numericColumnKeys,
  sampleSize = 200,
  baseMinWidthPx = 120,
  numericMinWidthPx = 72,
  primaryMinWidthPx = 240,
  horizontalPaddingPx = 34,
  characterWidthPx = 7.6,
}: ComputeListViewColumnWidthsOptions<TRow>): Record<string, string> {
  const widths: Record<string, string> = {};
  const primaryKeys = new Set(
    primaryColumnKeys && primaryColumnKeys.length > 0
      ? primaryColumnKeys
      : inferPrimaryColumnKeys(columns),
  );
  const numericKeys = new Set(
    numericColumnKeys && numericColumnKeys.length > 0
      ? numericColumnKeys
      : inferNumericColumnKeys(columns),
  );
  const sampledRows = rows.slice(0, sampleSize);

  for (const column of columns) {
    let contentWidthPx = toEstimatedTextWidthPx(column.label, characterWidthPx);

    for (const row of sampledRows) {
      const value = getCellContent ? getCellContent(row, column) : row[column.key];
      const candidateWidthPx = toEstimatedTextWidthPx(value, characterWidthPx);
      if (candidateWidthPx > contentWidthPx) {
        contentWidthPx = candidateWidthPx;
      }
    }

    const alignMinWidthPx = numericKeys.has(column.key)
      ? numericMinWidthPx
      : baseMinWidthPx;
    const minWidthPx = primaryKeys.has(column.key)
      ? Math.max(primaryMinWidthPx, alignMinWidthPx)
      : alignMinWidthPx;
    const widthPx = Math.max(minWidthPx, contentWidthPx + horizontalPaddingPx);

    widths[column.key] = `${Math.ceil(widthPx)}px`;
  }

  return widths;
}
