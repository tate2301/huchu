import React from "react";
import { Text } from "ink";
import type { PlatformServices } from "../../types";

interface SubscriptionBundleUpsertWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export function SubscriptionBundleUpsertWizard(_props: SubscriptionBundleUpsertWizardProps) {
  return (
    <Text>
      Bundle Upsert wizard not yet implemented. This feature allows creating or updating subscription bundles.
    </Text>
  );
}
