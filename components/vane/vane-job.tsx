"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";

import { Button, Kit, TextArea, useShortcut } from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

import { moduleForPath, useVaneActions } from "./use-vane";

/** Whether Give Vane a job is open, shared by Ctrl J, the Plans page's button and the dialog. */
let isOpen = false;
const listeners = new Set<() => void>();
function setOpen(value: boolean) {
  isOpen = value;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens Give Vane a job over whatever page is showing. */
export function openVaneJob() {
  setOpen(true);
}

/** Jobs a person might give Vane from this module, to start from. */
const EXAMPLES: Record<string, string[]> = {
  books: [
    "Which invoices are more than 30 days overdue, and who owes the most?",
    "What did we spend each month this year, by expense type?",
  ],
  crm: [
    "Which quotes have waited more than a week without an answer?",
    "Which deals were won this month with no invoice yet?",
  ],
  retail: ["Which tills were short at cash-up this month, and on which shifts?", "What is running low and sold well last month?"],
  reports: ["Which reports did nobody open this month?", "What changed most in sales this month against last?"],
  people: ["Who is on leave next week?", "Which employees have no national ID number on file?"],
  schools: ["Which families owe more than one term's fees?", "Which classes had the lowest attendance this term?"],
  gold: ["How did this month's production compare with last month's, by shift?"],
};
const ANYWHERE = ["Look over what is overdue and tell me what to chase first.", "What needs my attention before Friday?"];

/**
 * Give Vane a job (PageVaneJob): from anywhere with Ctrl J. The box, jobs to
 * start from for the module on screen, and Give it to Vane (Ctrl ↵), which
 * queues the job (`POST /api/vane/jobs`): it shows in Working on at once.
 * Mounted once, in the shell.
 */
export function VaneJobHost() {
  const open = React.useSyncExternalStore(subscribe, () => isOpen, () => false);
  const pathname = usePathname();
  const { toast } = useToast();
  const { giveJob } = useVaneActions();
  const [text, setText] = React.useState("");
  const box = React.useRef<HTMLTextAreaElement>(null);

  useShortcut("Ctrl J", () => setOpen(true));
  // A link to it (`?job`) opens it over the page it names.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("job")) setOpen(true);
  }, [pathname]);

  const here = moduleForPath(pathname);
  const examples = (here && EXAMPLES[here]) || ANYWHERE;
  const ready = text.trim().length >= 3;

  const give = () => {
    if (!ready || giveJob.isPending) return;
    giveJob.mutate(text.trim(), {
      onSuccess: () => {
        toast({ title: "Vane has the job", description: "It is in Working on." });
        setText("");
        setOpen(false);
      },
      onError: (error) =>
        toast({
          title: "Vane did not get the job",
          description: getApiErrorMessage(error, "Check the connection and try again."),
          variant: "destructive",
        }),
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Kit contents>
          <Dialog.Overlay className="over is-fixed" />
          <div className="vn-dialog-place">
            <Dialog.Content
              className="dialog dialog-lg vn-job"
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                box.current?.focus();
              }}
            >
              <div className="dialog-head">
                <Dialog.Title asChild>
                  <h2>Give Vane a job</h2>
                </Dialog.Title>
                <span className="end">
                  <Dialog.Close asChild>
                    <Button variant="quiet" iconOnly icon="x" label="Close" />
                  </Dialog.Close>
                </span>
              </div>
              <form
                className="dialog-scroll"
                id="vn-job-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  give();
                }}
              >
                <label className="vn-job-label" htmlFor="vn-job-box">
                  What should Vane do?
                </label>
                <TextArea
                  id="vn-job-box"
                  ref={box}
                  className="vn-job-box"
                  rows={4}
                  maxLength={2000}
                  value={text}
                  placeholder="Say it the way you would to a colleague"
                  onChange={(event) => setText(event.target.value)}
                />
                <div className="vn-sec">
                  <span className="sec-title">To start from</span>
                  <div className="vn-examples">
                    {examples.map((example) => (
                      <button key={example} type="button" className="btn btn-quiet vn-example" onClick={() => setText(example)}>
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="vn-note">Vane reads and drafts. It never sends, pays or changes anything: a person presses that button.</p>
              </form>
              <div className="dialog-foot">
                <Dialog.Close asChild>
                  <Button>Cancel</Button>
                </Dialog.Close>
                <Button variant="primary" shortcut="Ctrl ↵" type="submit" form="vn-job-form" busy={giveJob.isPending} disabled={!ready}>
                  Give it to Vane
                </Button>
              </div>
            </Dialog.Content>
          </div>
        </Kit>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
