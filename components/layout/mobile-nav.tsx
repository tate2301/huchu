"use client";

import * as Dialog from "@radix-ui/react-dialog";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { useShell } from "@/components/layout/shell-state";

/**
 * The phone's More (Phone.dc.html): the same tree as the sidebar, as a page
 * over everything but the bottom bar, 44px rows and group names that do not
 * fold. It opens from More in the bottom bar or the app bar's menu, and closes
 * on navigation, on More again, or on Esc.
 */
export function MobileNav() {
  const { width, drawerOpen, setDrawerOpen } = useShell();
  if (width !== "phone") return null;

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            // More in the bottom bar closes it itself; anything else outside is the bar too.
            if ((event.target as HTMLElement | null)?.closest("[data-phone-bar]")) event.preventDefault();
          }}
          className="fixed inset-x-0 top-0 z-[var(--z-overlay)] flex bg-[var(--ground)] outline-none"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
        >
          <Dialog.Title className="sr-only">More</Dialog.Title>
          <AppSidebar inDrawer />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
