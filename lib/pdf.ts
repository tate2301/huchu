import { inferSourceKeyFromPath, runDocumentExport } from "@/lib/documents/export-client";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function extractTablePayload(root: HTMLElement) {
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

  return { columns, rows };
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
  const heading = root.querySelector("h1, h2, h3");
  return normalizeText(heading?.textContent) || "Table Export";
}

function stripPdfExtension(filename: string) {
  return filename.replace(/\.pdf$/i, "") || "export";
}

export async function exportElementToPdf(element: HTMLElement, filename: string) {
  const payload = extractTablePayload(element) ?? extractFallbackPayload(element);
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;

  await runDocumentExport({
    sourceKey: inferSourceKeyFromPath(pathname),
    format: "pdf",
    payload: {
      title: inferTitle(element),
      subtitle: "Backend generated export",
      fileName: stripPdfExtension(filename),
      list: payload,
      meta: [{ label: "Rows", value: String(payload.rows.length) }],
    },
  });
}

