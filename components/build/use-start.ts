"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildHref } from "@/lib/build/items";
import type { TemplateStart } from "@/lib/build/templates";
import { starterBlocks, starterTemplate } from "@/lib/crm/starter-templates";

/** A name nothing of the same kind here has: "Quotation", then "Quotation 2". */
export function freeName(wanted: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!names.has(wanted.trim().toLowerCase())) return wanted;
  for (let n = 2; ; n += 1) {
    const next = `${wanted} ${n}`;
    if (!names.has(next.toLowerCase())) return next;
  }
}

/** Something new to build: from a template, or blank. */
export type StartRequest = TemplateStart | { type: "blank-visit" } | { type: "blank-report" } | { type: "blank-block"; kind: string; name: string };

/**
 * Making the workspace's own copy of a template (or a blank one), through each
 * builder's own API, then opening it in the builder. Every one starts as a
 * draft its maker finishes and publishes.
 */
export function useStartBuild(takenNames: readonly string[]) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: StartRequest): Promise<string> => {
      switch (request.type) {
        case "visit": {
          const { set } = await fetchJson<{ set: { id: string } }>("/api/v2/crm/question-sets", { method: "POST", body: JSON.stringify({ template: request.template }) });
          return buildHref("visit", set.id);
        }
        case "blank-visit": {
          const { set } = await fetchJson<{ set: { id: string } }>("/api/v2/crm/question-sets", { method: "POST", body: JSON.stringify({ blank: true }) });
          return buildHref("visit", set.id);
        }
        case "enquiry": {
          const made = await fetchJson<{ id: string }>("/api/v2/crm/intake-forms", {
            method: "POST",
            body: JSON.stringify({ name: freeName("Enquiry form", takenNames), fields: [], services: [] }),
          });
          return buildHref("enquiry", made.id);
        }
        case "block":
        case "blank-block": {
          const starter = request.type === "block" ? starterTemplate(request.starter) : undefined;
          const name = freeName(request.name, takenNames);
          const made = await fetchJson<{ id: string }>("/api/v2/crm/templates", {
            method: "POST",
            body: JSON.stringify({
              name,
              kind: request.kind,
              attributes: { custom: {}, emoji: starter?.emoji ?? null },
              blocks: starter ? starterBlocks(starter, name) : [{ id: "title", type: "heading", text: name, level: 1 }],
              // A draft until it is published from the builder.
              isShared: false,
            }),
          });
          return buildHref("block", made.id, request.kind);
        }
        case "layout": {
          const made = await fetchJson<{ template: { id: string } }>("/api/document-templates", {
            method: "POST",
            body: JSON.stringify({
              name: freeName(request.name, takenNames),
              sourceKey: request.sourceKey,
              documentType: request.documentType,
              targetType: request.targetType,
              cloneFromSystemDefault: true,
              setDefault: false,
            }),
          });
          return buildHref("layout", made.template.id);
        }
        case "library": {
          // The type's own API copies it, names it and starts it as a draft.
          const body = JSON.stringify({ library: request.key });
          if (request.kind === "VISIT_FORM") {
            const { set } = await fetchJson<{ set: { id: string } }>("/api/v2/crm/question-sets", { method: "POST", body });
            return buildHref("visit", set.id);
          }
          if (request.kind === "ENQUIRY_FORM") {
            const made = await fetchJson<{ id: string }>("/api/v2/crm/intake-forms", { method: "POST", body });
            return buildHref("enquiry", made.id);
          }
          if (request.kind === "BLOCK_TEMPLATE") {
            const made = await fetchJson<{ id: string; kind: string }>("/api/v2/crm/templates", { method: "POST", body });
            return buildHref("block", made.id, made.kind);
          }
          const made = await fetchJson<{ template: { id: string } }>("/api/document-templates", { method: "POST", body });
          return buildHref("layout", made.template.id);
        }
        case "blank-report": {
          const made = await fetchJson<{ report: { id: string } }>("/api/v2/reports/custom", { method: "POST", body: JSON.stringify({}) });
          return buildHref("report", made.report.id);
        }
      }
    },
    onSuccess: async (href) => {
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      router.push(href);
    },
    onError: (error) =>
      toast({ title: "It was not made", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
}
