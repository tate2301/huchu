"use client";

import { useShell } from "@/components/layout/shell-state";

import { useVaneStatus } from "./use-vane";
import { VaneButtonView } from "./vane-button-view";

/** The top bar's Vane button, with this person's count; it opens and closes the panel. */
export function VaneButton() {
  const shell = useShell();
  const { data } = useVaneStatus();
  return (
    <VaneButtonView
      open={shell.vaneOpen}
      count={data?.open ?? 0}
      working={Boolean(data?.working)}
      onClick={() => shell.setVaneOpen(!shell.vaneOpen)}
    />
  );
}
