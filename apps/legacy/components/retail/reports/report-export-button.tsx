"use client";

import { Button } from "@/components/ui/button";
import { Download } from "@/lib/icons";

function downloadCSV(data: unknown[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0] as Record<string, unknown>);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = (row as Record<string, unknown>)[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") ? `"${str}"` : str;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportExportButton({
  data,
  filename = "report.csv",
}: {
  data: unknown[];
  filename?: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 text-xs"
      onClick={() => downloadCSV(data, filename)}
      disabled={!data.length}
    >
      <Download className="h-3.5 w-3.5" />
      Export
    </Button>
  );
}

export { downloadCSV };
