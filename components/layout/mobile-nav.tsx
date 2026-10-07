"use client";

import * as Dialog from "@radix-ui/react-dialog";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { useShell } from "@/components/layout/shell-state";

/**
 * The phone drawer (00-foundations 5.3.8): below 720px the rail and the module
 * panel slide in from the left, 296px wide over `--scrim`, from the header's
 * menu button. It closes on navigation.
 */
export function MobileNav() {
  const { width, drawerOpen, setDrawerOpen } = useShell();
  if (width !== "phone") return null;

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-[var(--scrim)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-[var(--z-overlay)] flex h-[100dvh] w-[296px] max-w-[calc(100vw-48px)] overflow-hidden bg-[var(--ground)] shadow-[var(--shadow-float)] outline-none"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <AppSidebar inDrawer />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
