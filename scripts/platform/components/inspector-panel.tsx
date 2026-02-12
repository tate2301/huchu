import React from 'react';
import { Box, Text } from 'ink';

import { QuickGuide } from './quick-guide';
import type { AppPane, PlatformModuleDefinition } from './types';

interface InspectorPanelProps {
  actor: string;
  module: PlatformModuleDefinition;
  focusCompanyId: string | null;
  focusCompanyDisplay?: string | null;
  readOnly: boolean;
  activePane: AppPane;
  paletteOpen: boolean;
  statusMessage: string;
  workspaceMode: "tree" | "operation";
  treeLevel: "task" | "operation";
}

export function InspectorPanel({
  actor,
  module,
  focusCompanyId,
  focusCompanyDisplay,
  readOnly,
  activePane,
  paletteOpen,
  statusMessage,
  workspaceMode,
  treeLevel,
}: InspectorPanelProps) {
  const isPaneFocused = activePane === 'inspector';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={isPaneFocused ? 'cyan' : undefined}>
        Inspector {isPaneFocused ? '[FOCUSED]' : '[idle]'}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Actor: {actor}</Text>
        <Text>Active Pane: {activePane}</Text>
        <Text>Module: {module.label}</Text>
        <Text>Module ID: {module.id}</Text>
        <Text>Focused Company: {focusCompanyDisplay ?? focusCompanyId ?? 'none'}</Text>
        <Text>Access Mode: {readOnly ? 'read-only' : 'read-write'}</Text>
        <Text>Palette State: {paletteOpen ? 'open' : 'closed'}</Text>
        <Text>Status: {statusMessage}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Pane keys: Left/Right changes focus, Esc jumps to Module Nav</Text>
        <Text dimColor>Palette keys: / or p opens, Enter runs, Esc closes</Text>
      </Box>
      <QuickGuide
        workspaceMode={workspaceMode}
        treeLevel={treeLevel}
        hasFocusedCompany={Boolean(focusCompanyId)}
        readOnly={readOnly}
      />
    </Box>
  );
}
