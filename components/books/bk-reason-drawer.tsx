"use client";

import * as React from "react";

import { Banner, Button, Drawer, DrawerSection, Field, TextArea, type IconName } from "@/components/core";
import { getApiErrorMessage } from "@/lib/api-client";

/**
 * A move that needs a reason kept in the audit trail (Void, Reject, Reverse):
 * what will happen, the reason, and the button that does it. The caller's
 * `onConfirm` does the work; a refusal is shown in the drawer.
 */
export function ReasonDrawer({
  open,
  onOpenChange,
  title,
  sub,
  what,
  label,
  icon = "x",
  danger = true,
  placeholder,
  minLength = 3,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sub?: string;
  /** What pressing it does, in a sentence or two. */
  what?: React.ReactNode;
  label: string;
  icon?: IconName;
  danger?: boolean;
  placeholder?: string;
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setReason("");
    setShown(false);
    setError(null);
  }, [open]);

  const short = reason.trim().length < minLength;
  const go = async () => {
    setShown(true);
    if (short) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setBusy(false);
      onOpenChange(false);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "Nothing was changed. Check the connection and try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={title}
      sub={sub}
      width={480}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} icon={icon} shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={go}>
            {label}
          </Button>
        </>
      }
    >
      {what ? (
        <DrawerSection title="What happens">
          <Banner tone="warning" icon="warn">
            {what}
          </Banner>
        </DrawerSection>
      ) : null}
      <DrawerSection title="Why">
        <Field label="Reason" htmlFor="reason-text" error={shown && short ? "Say why, in a few words. It is kept in the audit trail." : undefined}>
          <TextArea id="reason-text" rows={2} value={reason} disabled={busy} placeholder={placeholder} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="error" style={{ marginTop: "var(--space-8)" }}>
            {error}
          </p>
        ) : null}
      </DrawerSection>
    </Drawer>
  );
}
