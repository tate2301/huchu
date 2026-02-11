import React from 'react';
import { Box, Text } from 'ink';

import type { AppPane, PlatformModuleDefinition } from './types';

interface InspectorPanelProps {
  actor: string;
  module: PlatformModuleDefinition;
  focusCompanyId: string | null;
  readOnly: boolean;
  activePane: AppPane;
  paletteOpen: boolean;
  statusMessage: string;
}

export function InspectorPanel({
  actor,
  module,
  focusCompanyId,
  readOnly,
  activePane,
  paletteOpen,
  statusMessage,
}: InspectorPanelProps) {
  const isPaneFocused = activePane === 'inspector';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={isPaneFocused ? 'cyan' : undefined}>
        Inspector
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Actor: {actor}</Text>
        <Text>Module: {module.label}</Text>
        <Text>Module ID: {module.id}</Text>
        <Text>Company: {focusCompanyId ?? 'none'}</Text>
        <Text>Mode: {readOnly ? 'read-only' : 'read-write'}</Text>
        <Text>Palette: {paletteOpen ? 'open' : 'closed'}</Text>
        <Text>Status: {statusMessage}</Text>
      </Box>
    </Box>
  );
}
