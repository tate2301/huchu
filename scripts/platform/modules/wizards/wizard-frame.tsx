import React, { type ReactNode } from "react";
import { Box, Text } from "ink";

interface WizardFrameProps {
  title: string;
  description: string;
  step: number;
  steps: string[];
  body: ReactNode;
  statusMessage?: string | null;
  errorMessage?: string | null;
  successMessage?: string | null;
  hints?: string[];
}

export function WizardFrame({
  title,
  description,
  step,
  steps,
  body,
  statusMessage,
  errorMessage,
  successMessage,
  hints,
}: WizardFrameProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Text dimColor>{description}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">
          Step {String(step + 1)} / {String(steps.length)}: {steps[step]}
        </Text>
        <Text dimColor>{steps.map((item, index) => `${index === step ? ">" : " "} ${String(index + 1)}. ${item}`).join(" | ")}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {body}
      </Box>

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {successMessage ? <Text color="green">{successMessage}</Text> : null}
      {statusMessage ? <Text dimColor>{statusMessage}</Text> : null}
      {hints && hints.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          {hints.map((hint, index) => (
            <Text key={`${index}:${hint}`} dimColor>
              {hint}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
