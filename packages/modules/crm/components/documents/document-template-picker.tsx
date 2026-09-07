"use client";

import { useQuery } from "@tanstack/react-query";

import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson } from "@corelithzw/platform/api-client";
import { blockSchema, type Block, type TemplateKind } from "@corelithzw/module-documents/blocks";
import { z } from "zod";

/**
 * The templates that apply to what is being raised.
 *
 * A template library nobody sees while working is a filing cabinet. Somebody
 * raising a quote has already decided the shape of it — the terms, the lead
 * times, the exclusions — and was retyping them because the template lived
 * three clicks away under settings.
 *
 * Picking one fills in the standing text. It does not touch the line items,
 * which are what this particular job costs and are never a template's business.
 */

type TemplateRow = {
  id: string;
  name: string;
  kind: TemplateKind;
  isActive: boolean;
};

/** The standing text a template carries — its terms and its prose blocks. */
export function standingTextOf(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "terms" && block.text.trim()) parts.push(block.text.trim());
    if (block.type === "text" && block.text.trim()) parts.push(block.text.trim());
  }
  return parts.join("\n\n");
}

export function DocumentTemplatePicker({
  kind,
  onPick,
}: {
  kind: Extract<TemplateKind, "QUOTE" | "INVOICE">;
  /** Called with the template's standing text when one is chosen. */
  onPick: (text: string, templateName: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["crm-templates", kind],
    queryFn: () => fetchJson<{ data: TemplateRow[] }>(`/api/v2/crm/templates?kind=${kind}`),
    staleTime: 5 * 60_000,
  });

  const templates = (data?.data ?? []).filter((template) => template.isActive);

  // Nothing to offer is not an empty dropdown — it is no dropdown.
  if (templates.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="doc-template">Start from a template</Label>
      <Select
        // The blocks are fetched on pick rather than carried in the list: a
        // dropdown of five names should not download five documents.
        onValueChange={async (id) => {
          const template = templates.find((entry) => entry.id === id);
          if (!template) return;
          try {
            const full = await fetchJson<{ blocks: unknown }>(
              `/api/v2/crm/templates/${id}`,
            );
            const parsed = z.array(blockSchema).safeParse(full.blocks);
            onPick(parsed.success ? standingTextOf(parsed.data) : "", template.name);
          } catch {
            onPick("", template.name);
          }
        }}
      >
        <SelectTrigger id="doc-template" aria-label="Template">
          <SelectValue placeholder="None — write it from scratch" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-[var(--text-muted)]">
        Fills in the standing terms. The lines stay yours.
      </p>
    </div>
  );
}
