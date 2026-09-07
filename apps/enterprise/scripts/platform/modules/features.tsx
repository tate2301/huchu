import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { FeatureToggleWizard } from "./wizards/feature-toggle-wizard";

const SUPPORTED_OPERATIONS = ["feature.enable", "feature.disable"] as const;

export function FeaturesModule(props: ModuleProps) {
  if (props.operationId === "feature.enable") {
    return (
      <FeatureToggleWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        enable={true}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "feature.disable") {
    return (
      <FeatureToggleWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        enable={false}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Features"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
