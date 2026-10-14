"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { dsConfirm } from "@/components/ui/ds-confirm";

/**
 * What every builder in Build does the same way: Ctrl S saves (without
 * publishing), leaving the page with changes not saved asks first, and Back
 * asks before it throws changes away. Returns Back.
 */
export function useBuilderKeys({ dirty, onSave, backHref }: { dirty: boolean; onSave: () => void; backHref: string }) {
  const router = useRouter();
  const save = React.useRef(onSave);
  React.useEffect(() => {
    save.current = onSave;
  });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save.current();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty]);

  return React.useCallback(async () => {
    if (dirty) {
      const leave = await dsConfirm({
        title: "Leave without saving",
        description: "The changes since it was last saved are lost.",
        confirmLabel: "Leave",
        variant: "danger",
      });
      if (!leave) return;
    }
    router.push(backHref);
  }, [backHref, dirty, router]);
}
