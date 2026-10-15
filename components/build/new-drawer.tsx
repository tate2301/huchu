"use client";

import * as React from "react";

import { Button, ButtonLink, Drawer, Icon, type IconName } from "@/components/core";

import type { BuildHomeData } from "./build-data";
import { useStartBuild, type StartRequest } from "./use-start";

type Choice = { key: string; icon: IconName; title: string; note: string; start: StartRequest };

/**
 * New (N): something blank to build, of each kind this workspace is
 * provisioned for. Every one opens in the builder as a draft; From a template
 * starts from something already made.
 */
export function NewDrawer({ open, onOpenChange, data }: { open: boolean; onOpenChange: (open: boolean) => void; data: BuildHomeData }) {
  const taken = React.useMemo(() => data.items.map((item) => item.name), [data.items]);
  const start = useStartBuild(taken);
  const { provisions } = data;

  const choices: Choice[] = [
    ...(provisions.visitForms
      ? [{ key: "visit", icon: "visits" as const, title: "Site visit form", note: "What a rep asks on site, and the quote it drafts", start: { type: "blank-visit" } as const }]
      : []),
    ...(provisions.enquiryForms
      ? [{ key: "enquiry", icon: "showroom" as const, title: "Enquiry form", note: "Filled in by customers; each answer makes a lead", start: { type: "enquiry" } as const }]
      : []),
    ...(provisions.blocks
      ? [
          { key: "quote", icon: "invoice" as const, title: "Document", note: "A quote, an invoice or a receipt, laid out as blocks", start: { type: "blank-block", kind: "QUOTE", name: "Quotation" } as const },
          { key: "email", icon: "send" as const, title: "Email", note: "A message about a record, with its details filled in", start: { type: "blank-block", kind: "EMAIL", name: "Email" } as const },
        ]
      : []),
    { key: "report", icon: "reports", title: "Report", note: "A board of questions over the workspace's data", start: { type: "blank-report" } },
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New"
      sub="Blank, in the builder. Each starts as a draft until you publish it."
      width={480}
      footer={
        <ButtonLink icon="file" href="/build/templates">
          From a template
        </ButtonLink>
      }
    >
      <div className="list">
        {choices.map((choice) => (
          <div key={choice.key} className="row" style={{ gridTemplateColumns: "24px minmax(0, 1fr) auto", display: "grid", alignItems: "center", gap: "var(--space-12)" }}>
            <Icon name={choice.icon} />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <b style={{ fontWeight: 500 }}>{choice.title}</b>
              <span className="muted truncate" style={{ fontSize: 13 }}>
                {choice.note}
              </span>
            </span>
            <Button icon="plus" busy={start.isPending && start.variables === choice.start} disabled={start.isPending} onClick={() => start.mutate(choice.start)}>
              Start
            </Button>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
