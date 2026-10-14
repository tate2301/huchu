"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useLiveStream } from "@/hooks/use-live-stream";

/**
 * The shell's one live connection (`app/api/live`): when this person's
 * notifications move, or Vane's cards, jobs, plans or state do, the queries
 * that show them read again. The Vane button's dot and count, Working on and
 * the panel follow without a reload. Draws nothing.
 */
export function LiveStream() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  useLiveStream(
    {
      notifications: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      vane: () => void queryClient.invalidateQueries({ queryKey: ["vane"] }),
    },
    status === "authenticated",
  );
  return null;
}
