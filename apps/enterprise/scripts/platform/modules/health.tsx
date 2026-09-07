import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { HealthOperationWizard } from "./wizards/health-operation-wizard";

const SUPPORTED_OPERATIONS = ["health.record-metric", "health.remediate"] as const;

function isHealthOperation(
  operationId: string | undefined,
): operationId is "health.record-metric" | "health.remediate" {
  return operationId !== undefined && SUPPORTED_OPERATIONS.includes(operationId as (typeof SUPPORTED_OPERATIONS)[number]);
}

export function HealthModule(props: ModuleProps) {
  if (isHealthOperation(props.operationId)) {
    return (
      <HealthOperationWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Health"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
