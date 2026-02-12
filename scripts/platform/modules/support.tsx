import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { SupportOperationWizard } from "./wizards/support-operation-wizard";

const SUPPORTED_OPERATIONS = [
  "support.request",
  "support.approve",
  "support.start-session",
  "support.end-session",
] as const;

function isSupportOperation(
  operationId: string | undefined,
): operationId is
  | "support.request"
  | "support.approve"
  | "support.start-session"
  | "support.end-session" {
  return operationId !== undefined && SUPPORTED_OPERATIONS.includes(operationId as (typeof SUPPORTED_OPERATIONS)[number]);
}

export function SupportModule(props: ModuleProps) {
  if (isSupportOperation(props.operationId)) {
    return (
      <SupportOperationWizard
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
      moduleLabel="Support"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
