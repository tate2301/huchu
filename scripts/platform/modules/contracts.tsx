import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { ContractsOperationWizard } from "./wizards/contracts-operation-wizard";

const SUPPORTED_OPERATIONS = ["contract.enforce", "contract.override"] as const;

function isContractOperation(
  operationId: string | undefined,
): operationId is "contract.enforce" | "contract.override" {
  return operationId !== undefined && SUPPORTED_OPERATIONS.includes(operationId as (typeof SUPPORTED_OPERATIONS)[number]);
}

export function ContractsModule(props: ModuleProps) {
  if (isContractOperation(props.operationId)) {
    return (
      <ContractsOperationWizard
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
      moduleLabel="Contracts"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
