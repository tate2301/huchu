import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';

import type { AppPane, ModuleMount, PlatformModuleDefinition } from './types';

interface MainContentProps {
  module: PlatformModuleDefinition;
  mount?: ModuleMount;
  focusCompanyId: string | null;
  readOnly: boolean;
  activePane: AppPane;
}

export function MainContent({
  module,
  mount,
  focusCompanyId,
  readOnly,
  activePane,
}: MainContentProps) {
  const isPaneFocused = activePane === 'main';

  let mountedContent: ReactNode = null;
  let mountError: string | null = null;

  if (mount) {
    try {
      mountedContent = mount({
        module,
        focusCompanyId,
        readOnly,
        activePane,
      });
    } catch (error) {
      mountError = error instanceof Error ? error.message : 'Unknown mount error';
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={isPaneFocused ? 'cyan' : undefined}>
        Main Workspace {isPaneFocused ? '[FOCUSED]' : '[idle]'}
      </Text>
      <Text>{module.label}</Text>
      <Text dimColor>{module.description}</Text>
      <Box marginTop={1} flexDirection="column">
        {mountError ? (
          <>
            <Text color="red">Module mount failed.</Text>
            <Text>{mountError}</Text>
          </>
        ) : mountedContent ? (
          mountedContent
        ) : (
          <>
            <Text>No module UI is mounted for this module.</Text>
            <Text dimColor>{`Mount key: moduleMounts["${module.id}"]`}</Text>
            <Text dimColor>This is valid when services are not attached in this shell session.</Text>
            <Text dimColor>Focused company: {focusCompanyId ?? 'none'}</Text>
            <Text dimColor>Access mode: {readOnly ? 'read-only' : 'read-write'}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
