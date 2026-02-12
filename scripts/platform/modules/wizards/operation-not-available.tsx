import React from "react";
import { Box, Text, useInput } from "ink";

interface OperationNotAvailableProps {
  moduleLabel: string;
  operationId?: string;
  supportedOperations: string[];
  onBackToTree?: () => void;
}

export function OperationNotAvailable({
  moduleLabel,
  operationId,
  supportedOperations,
  onBackToTree,
}: OperationNotAvailableProps) {
  useInput((_input, key) => {
    if (key.escape || key.return) {
      onBackToTree?.();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">No wizard mapped for this operation.</Text>
      <Text>Module: {moduleLabel}</Text>
      <Text>Operation: {operationId || "<none>"}</Text>
      <Text dimColor>Supported operations in this module:</Text>
      {supportedOperations.map((operation) => (
        <Text key={operation} dimColor>
          - {operation}
        </Text>
      ))}
      <Text dimColor>Press Enter or Esc to return to the operation tree.</Text>
    </Box>
  );
}
