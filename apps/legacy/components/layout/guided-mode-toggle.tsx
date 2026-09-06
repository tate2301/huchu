"use client";

import { HelpCircle } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { useGuidedMode } from "@/hooks/use-guided-mode";

export function GuidedModeToggle() {
  const { enabled, setGuidedMode } = useGuidedMode();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setGuidedMode(!enabled)}
      aria-pressed={enabled}
      title={enabled ? "Guided tips are on" : "Guided tips are off"}
    >
      <HelpCircle className="h-4 w-4" />
      {enabled ? "Guided Tips On" : "Guided Tips Off"}
    </Button>
  );
}
