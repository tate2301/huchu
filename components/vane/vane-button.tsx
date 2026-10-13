"use client";

import { usePathname, useRouter } from "next/navigation";

import { useShell } from "@/components/layout/shell-state";

import { useVaneStatus } from "./use-vane";
import { VaneButtonView } from "./vane-button-view";
import { isVanePath } from "./vane-nav";

/**
 * The top bar's Vane button, with this person's count; it opens and closes
 * the panel. On Vane's own pages, which are the panel's content at full
 * size, it goes to For you instead.
 */
export function VaneButton() {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useVaneStatus();
  const onVane = isVanePath(pathname);
  return (
    <VaneButtonView
      open={shell.vaneOpen && !onVane}
      count={data?.open ?? 0}
      working={Boolean(data?.working)}
      onClick={() => (onVane ? router.push("/vane") : shell.setVaneOpen(!shell.vaneOpen))}
    />
  );
}
