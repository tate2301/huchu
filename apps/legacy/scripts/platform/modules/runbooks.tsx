import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { RunbookOperationWizard } from "./wizards/runbook-operation-wizard";

const SUPPORTED_OPERATIONS = ["runbook.create", "runbook.execute"] as const;

function isRunbookOperation(
  operationId: string | undefined,
): operationId is "runbook.create" | "runbook.execute" {
  return operationId !== undefined && SUPPORTED_OPERATIONS.includes(operationId as (typeof SUPPORTED_OPERATIONS)[number]);
}

export function RunbooksModule(props: ModuleProps) {
  if (isRunbookOperation(props.operationId)) {
    return (
      <RunbookOperationWizard
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
      moduleLabel="Runbooks"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
