"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { useToast } from "@/components/ui/use-toast";
import { ArrowsClockwise } from "@/lib/icons";

/**
 * Catalogue › Sync from code: writes every feature, bundle and plan the code
 * defines into the database, then says what was new. Adds and updates only;
 * nothing is deleted, so it is safe to run at any time.
 */
export function SyncFromCodeButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sync = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/platform-admin/catalogue/sync", { method: "POST" });
      const answer = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        toast({ title: answer?.error ?? "The sync did not run. Nothing was changed; try again.", variant: "destructive" });
        return;
      }
      toast({ title: answer?.message ?? "Synced from code.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button loading={busy} startIcon={<ArrowsClockwise aria-hidden="true" />} onClick={sync}>
      Sync from code
    </Button>
  );
}
