"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { Button, Drawer, Field, TextArea, useShortcut } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

import { moduleForPath, useVaneActions, useVaneStatus } from "./use-vane";
import { isVanePath } from "./vane-nav";

/** What a person might ask from the module they are in: a way in, never a template. */
const EXAMPLES: Record<string, string[]> = {
  books: ["Get September's VAT return ready.", "Match last week's bank lines."],
  crm: ["Which quotes have waited more than a week?", "Which deals went quiet this month?"],
  retail: ["Check last week's cash-ups for shortfalls.", "What should we reorder this week?"],
  reports: ["Why is Negotiating losing deals?", "What changed in sales since last month?"],
  people: ["Who has leave due before December?"],
  payroll: ["Check October's pay run against September's."],
  schools: ["Which families have paid nothing this term?"],
  gold: ["Why was Mill 1 down this month?"],
};
const ANYWHERE = ["Get the October close ready, so we can close on the 3rd.", "What needs me before Friday?"];

const MIN = 3;
const MAX = 2000;

/**
 * Give Vane a job (the PageVaneJob board), from any page with Ctrl J: a plain
 * request in a sentence, with examples from the module the person is in.
 * Give it to Vane (Ctrl ↵) queues it for Vane's next run, and it shows in
 * Working on at once. Vane reads what it needs and drafts; it sends, pays and
 * changes nothing. While the Vane panel is open, Ctrl J goes to the panel's
 * own field instead.
 */
export function GiveJobDialog() {
  const shell = useShell();
  const pathname = usePathname();
  const { toast } = useToast();
  const { giveJob } = useVaneActions();
  const status = useVaneStatus();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const panelHasIt = shell.vaneOpen && !isVanePath(pathname);
  useShortcut("Ctrl J", () => shell.setVaneJobOpen(true), { enabled: !panelHasIt && !shell.vaneJobOpen });

  const pageModule = moduleForPath(pathname);
  const examples = [...(pageModule ? (EXAMPLES[pageModule] ?? []) : []), ...ANYWHERE].slice(0, 3);

  const close = () => {
    shell.setVaneJobOpen(false);
    setError(null);
  };

  const give = () => {
    const request = text.trim();
    if (request.length < MIN) {
      setError("Say what Vane should do, in a few words.");
      return;
    }
    giveJob.mutate(request, {
      onSuccess: () => {
        setText("");
        close();
        toast({
          title: status.data?.paused ? "Vane has the job; it starts when Vane is resumed" : "Vane has the job",
          description: "It is in Working on until it is done.",
        });
      },
      onError: (failure) => setError(getApiErrorMessage(failure, "Vane did not get the job. Try again.")),
    });
  };

  return (
    <Drawer
      open={shell.vaneJobOpen}
      onOpenChange={(open) => (open ? shell.setVaneJobOpen(true) : close())}
      title="Give Vane a job"
      sub="Vane reads what it needs and drafts. Sending, paying and changing records stay yours."
      width={560}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon="send" shortcut="Ctrl ↵" busy={giveJob.isPending} onClick={give}>
            Give it to Vane
          </Button>
        </>
      }
    >
      <Field label="What should Vane do?" htmlFor="vane-job" error={error ?? undefined}>
        <TextArea
          id="vane-job"
          rows={4}
          autoFocus
          maxLength={MAX}
          placeholder={ANYWHERE[0]}
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span className="sec-title">For example</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-8)" }}>
          {examples.map((example) => (
            <Button key={example} variant="quiet" size="sm" onClick={() => setText(example)}>
              {example}
            </Button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
