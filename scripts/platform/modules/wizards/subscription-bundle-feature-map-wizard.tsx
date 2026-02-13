import React from "react";
import { Text } from "ink";
import type { PlatformServices } from "../../types";

interface SubscriptionBundleFeatureMapWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export function SubscriptionBundleFeatureMapWizard(_props: SubscriptionBundleFeatureMapWizardProps) {
  return (
    <Text>
      Bundle Feature Mapping wizard not yet implemented. This feature allows configuring which features are included in a bundle.
    </Text>
  );
}
