"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Input, TextArea } from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import { Button as WorkspaceButton } from "@/components/workspace/button";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { REASON_MAX, REASON_MIN } from "@/lib/books/core/undo-rules";

import { BkDialog, What } from "./undo-dialogs";

type Device = { id: string; name: string; deviceId: string | null; isTestDevice: boolean; isActive: boolean };
type Plan = { device: string; isTestDevice: boolean; remove: Array<{ kind: string; id: string; label: string }>; skipped: Array<{ id: string; label: string; why: string }>; fiscalDays: number };
type Purged = { device: string; purged: Array<{ label: string }>; skipped: Array<{ label: string; why: string }>; fiscalDaysRemoved: number };

const listed = (labels: string[]) => (labels.length > 6 ? `${labels.slice(0, 5).join(", ")} and ${labels.length - 5} more` : labels.join(", "));

/**
 * A test device (D18, books-final §2.5, §5.12) on Management's fiscal device
 * page, for the owner only: mark the device as registered against ZIMRA's
 * test environment, and purge what it signed. The confirm dialog lists what
 * will be removed and what is skipped, with why, before anything goes; each
 * document is deleted as permanent delete does, its snapshot in the audit
 * trail. Anyone else is answered 403 by the server, and nothing shows.
 */
export function TestDevicePurge() {
  const client = useQueryClient();
  const { toast } = useToast();
  const devices = useQuery({
    queryKey: ["books", "fiscal-devices"],
    queryFn: () => fetchJson<{ devices: Device[] }>("/api/books/core/fiscal-devices"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });
  const device = devices.data?.devices.find((row) => row.isActive) ?? devices.data?.devices[0] ?? null;
  const [asking, setAsking] = React.useState<"mark" | "unmark" | "purge" | null>(null);
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const plan = useQuery({
    queryKey: ["books", "purge-plan", device?.id],
    queryFn: () => fetchJson<Plan>(`/api/books/core/fiscal-devices/${device!.id}/purge`),
    enabled: asking === "purge" && Boolean(device),
  });

  React.useEffect(() => {
    if (asking) return;
    setReason("");
    setTyped("");
    setMissing(null);
    setError(null);
  }, [asking]);

  if (!device) return null;

  const run = async (work: () => Promise<void>) => {
    if (reason.trim().length < REASON_MIN) return setMissing("Say why, in a few words.");
    setMissing(null);
    setBusy(true);
    setError(null);
    try {
      await work();
      setAsking(null);
      await client.invalidateQueries({ queryKey: ["books"] });
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Nothing was changed; try again."));
    } finally {
      setBusy(false);
    }
  };

  const mark = (isTestDevice: boolean) =>
    run(async () => {
      await fetchJson(`/api/books/core/fiscal-devices/${device.id}`, { method: "PATCH", body: JSON.stringify({ isTestDevice, reason: reason.trim() }) });
      toast({ title: isTestDevice ? `${device.name} is marked as ZIMRA’s test environment` : `${device.name} is marked as live`, variant: "success" });
    });

  const purge = () =>
    run(async () => {
      if (typed.trim().toLowerCase() !== "purge") throw new Error('Type "purge" to purge the test device.');
      const done = await fetchJson<Purged>(`/api/books/core/fiscal-devices/${device.id}/purge`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), confirm: typed.trim() }) });
      toast({
        title: `${done.purged.length} ${done.purged.length === 1 ? "document" : "documents"} purged from ${done.device}`,
        description: `${done.fiscalDaysRemoved} fiscal ${done.fiscalDaysRemoved === 1 ? "day" : "days"} removed.${done.skipped.length ? ` ${done.skipped.length} skipped.` : ""}`,
        variant: "success",
      });
    });

  const why = (
    <div className="bk-fld">
      <label className="bk-lab" htmlFor="device-why">
        Why
      </label>
      <TextArea id="device-why" rows={2} maxLength={REASON_MAX} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
      {missing ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {missing}
        </span>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>
          Kept in the audit trail
        </span>
      )}
    </div>
  );
  const failed = error ? (
    <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>
      {error}
    </p>
  ) : null;
  const cancel = (
    <Button variant="quiet" disabled={busy} onClick={() => setAsking(null)}>
      Cancel
    </Button>
  );
  const data = plan.data;

  return (
    <>
      {device.isTestDevice ? (
        <>
          <WorkspaceButton onClick={() => setAsking("purge")}>Purge test data</WorkspaceButton>
          <WorkspaceButton onClick={() => setAsking("unmark")}>Mark as live</WorkspaceButton>
        </>
      ) : (
        <WorkspaceButton onClick={() => setAsking("mark")}>Mark as test device</WorkspaceButton>
      )}

      <BkDialog
        open={asking === "mark" || asking === "unmark"}
        onOpenChange={(open) => (open ? undefined : setAsking(null))}
        busy={busy}
        width={460}
        title={asking === "unmark" ? `${device.name} is live` : `${device.name} is a test device`}
        foot={
          <>
            {cancel}
            <Button variant="primary" icon="fiscal" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={() => void mark(asking !== "unmark")}>
              {asking === "unmark" ? "Mark as live" : "Mark as test device"}
            </Button>
          </>
        }
      >
        <p>
          {asking === "unmark"
            ? "What it signs is held by ZIMRA again, and is never deleted: it is voided with a fiscal credit note."
            : "Only for a device registered against ZIMRA’s test environment. What it signs can then be purged with the rest of the test data."}
        </p>
        {why}
        {failed}
      </BkDialog>

      <BkDialog
        open={asking === "purge"}
        onOpenChange={(open) => (open ? undefined : setAsking(null))}
        busy={busy}
        title={`Purge ${device.name}’s test data`}
        foot={
          <>
            {cancel}
            <Button variant="danger" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || !data || typed.trim().toLowerCase() !== "purge"} onClick={() => void purge()}>
              {data ? `Purge ${data.remove.length} ${data.remove.length === 1 ? "document" : "documents"}` : "Purge"}
            </Button>
          </>
        }
      >
        <p>ZIMRA’s test environment holds none of this, so it goes from Books. Each document is deleted as permanent delete does, its snapshot kept in the audit trail.</p>
        {data ? (
          <What
            items={[
              { icon: "x", text: data.remove.length ? `Removed: ${listed(data.remove.map((row) => row.label))}` : "Nothing it signed can be removed" },
              { icon: "fiscal", text: `${data.fiscalDays} fiscal ${data.fiscalDays === 1 ? "day goes" : "days go"} once nothing is left on ${data.fiscalDays === 1 ? "it" : "them"}` },
              ...data.skipped.slice(0, 6).map((row) => ({ icon: "lock" as const, text: `Skipped: ${row.label}. ${row.why}` })),
              ...(data.skipped.length > 6 ? [{ icon: "lock" as const, text: `And ${data.skipped.length - 6} more skipped` }] : []),
              { icon: "history", text: "One snapshot of the device, its days and every record is kept first" },
            ]}
          />
        ) : plan.isError ? (
          <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>
            {getApiErrorMessage(plan.error, "Could not read what a purge would remove.")}
          </p>
        ) : (
          <p className="muted">Reading what it signed…</p>
        )}
        {why}
        <div className="bk-fld">
          <label className="bk-lab" htmlFor="device-typed">
            Type “purge” to confirm
          </label>
          <Input id="device-typed" value={typed} disabled={busy} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
        </div>
        {failed}
      </BkDialog>
    </>
  );
}
