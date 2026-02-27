import {
  inferSourceKeyFromPath,
  runDocumentExport,
  type DocumentExportFormat,
} from "@/lib/documents/export-client";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

type ExtractedTablePayload = {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  totalsMeta: Array<{ label: string; value: string }>;
  dataRowCount: number;
};

function isLikelyIdentifierColumn(label: string) {
  return /\b(id|code|ref|reference)\b/i.test(label);
}

function isLikelyMoneyColumn(label: string) {
  return /\b(amount|value|price|cost|balance|total|net|gross|usd|eur|zar|zwl)\b/i.test(
    label,
  );
}

function parseNumericCellValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, decimals: Number.isInteger(value) ? 0 : 2, currency: "" };
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\d{4}-\d{2}-\d{2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed)) return null;

  const negative = /^\(.*\)$/.test(trimmed);
  const currencyMatch = trimmed.match(/[$€£¥]/);
  const currency = currencyMatch?.[0] ?? "";
  const normalized = trimmed
    .replace(/[,$€£¥\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^0-9.\-]/g, "");

  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;

  const decimalPart = normalized.split(".")[1];
  const decimals = decimalPart ? Math.min(decimalPart.length, 4) : 0;

  return {
    value: negative ? -parsed : parsed,
    decimals,
    currency,
  };
}

function formatTotalValue(value: number, decimals: number, currency: string) {
  const precision = Math.max(0, Math.min(4, decimals));
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return `${currency}${formatted}`;
}

function appendTotals(payload: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}) {
  const totalsMeta: Array<{ label: string; value: string }> = [];
  if (payload.rows.length === 0 || payload.columns.length === 0) {
    return { rows: payload.rows, totalsMeta };
  }

  const totalsRow: Record<string, unknown> = {};
  let hasTotals = false;

  for (const column of payload.columns) {
    const normalizedLabel = `${column.label} ${column.key}`.toLowerCase();
    if (isLikelyIdentifierColumn(normalizedLabel)) continue;

    const nonEmptyValues = payload.rows
      .map((row) => row[column.key])
      .filter((value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string") return value.trim().length > 0;
        return true;
      });

    if (nonEmptyValues.length < 2) continue;

    const numericValues = nonEmptyValues
      .map((value) => parseNumericCellValue(value))
      .filter((value): value is { value: number; decimals: number; currency: string } =>
        Boolean(value),
      );

    if (numericValues.length < 2) continue;
    if (numericValues.length / nonEmptyValues.length < 0.6) continue;

    const total = numericValues.reduce((sum, value) => sum + value.value, 0);
    const hasCurrency = numericValues.some((value) => value.currency);
    const inferredCurrency =
      numericValues.find((value) => value.currency)?.currency ?? "";
    const decimals = hasCurrency || isLikelyMoneyColumn(normalizedLabel)
      ? 2
      : Math.min(3, Math.max(...numericValues.map((value) => value.decimals)));
    const formatted = formatTotalValue(total, decimals, inferredCurrency);

    totalsMeta.push({
      label: `Total ${column.label}`,
      value: formatted,
    });
    totalsRow[column.key] = formatted;
    hasTotals = true;
  }

  if (!hasTotals) {
    return { rows: payload.rows, totalsMeta };
  }

  const firstColumnKey = payload.columns[0]?.key;
  if (firstColumnKey) {
    totalsRow[firstColumnKey] = "Total";
  }

  return {
    rows: [...payload.rows, totalsRow],
    totalsMeta,
  };
}

function extractTablePayload(root: HTMLElement): ExtractedTablePayload | null {
  const table = root.querySelector("table");
  if (!table) return null;

  const headerCells = Array.from(table.querySelectorAll("thead th"));
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));

  if (bodyRows.length === 0) return null;

  const columns =
    headerCells.length > 0
      ? headerCells.map((cell, index) => ({
          key: `col_${index + 1}`,
          label: normalizeText(cell.textContent) || `Column ${index + 1}`,
        }))
      : Array.from(
          {
            length: Math.max(
              ...bodyRows.map((row) => row.querySelectorAll("td").length),
              1,
            ),
          },
          (_, index) => ({
            key: `col_${index + 1}`,
            label: `Column ${index + 1}`,
          }),
        );

  const rows = bodyRows.map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const values: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      values[column.key] = normalizeText(cells[index]?.textContent ?? "");
    });
    return values;
  });

  const withTotals = appendTotals({ columns, rows });

  return {
    columns,
    rows: withTotals.rows,
    totalsMeta: withTotals.totalsMeta,
    dataRowCount: rows.length,
  };
}

function extractFallbackPayload(root: HTMLElement) {
  const lines = normalizeText(root.innerText)
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);

  return {
    columns: [{ key: "value", label: "Value" }],
    rows: lines.map((line) => ({ value: line })),
  };
}

function inferTitle(root: HTMLElement) {
  const heading =
    root.querySelector("h1, h2, h3") ??
    (typeof document !== "undefined"
      ? document.querySelector("main h1, h1, h2")
      : null);
  return normalizeText(heading?.textContent) || "Table Export";
}

function stripPdfExtension(filename: string) {
  return filename.replace(/\.(pdf|csv)$/i, "") || "export";
}

export async function exportElementToDocument(
  element: HTMLElement,
  filename: string,
  format: DocumentExportFormat,
) {
  const extracted = extractTablePayload(element);
  const fallback = extractFallbackPayload(element);
  const payload = extracted ?? { ...fallback, totalsMeta: [], dataRowCount: fallback.rows.length };
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;

  await runDocumentExport({
    sourceKey: inferSourceKeyFromPath(pathname),
    format,
    payload: {
      title: inferTitle(element),
      subtitle: "Backend generated export",
      fileName: stripPdfExtension(filename),
      list: {
        columns: payload.columns,
        rows: payload.rows,
      },
      meta: [
        { label: "Rows", value: String(payload.dataRowCount) },
        ...payload.totalsMeta,
      ],
    },
  });
}

export async function exportElementToCsv(element: HTMLElement, filename: string) {
  await exportElementToDocument(element, filename, "csv");
}

export async function exportElementToPdf(element: HTMLElement, filename: string) {
  await exportElementToDocument(element, filename, "pdf");
}

