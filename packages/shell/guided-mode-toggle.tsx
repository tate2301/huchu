"use client";

import { HelpCircle } from "@corelithzw/ui/lib/icons";

import { Button } from "@corelithzw/ui/components/button";
import { useGuidedMode } from "@corelithzw/ui/hooks/use-guided-mode";

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
