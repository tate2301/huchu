import React from 'react';
import { Box, Text } from 'ink';

import type { AppPane, PlatformModuleDefinition, PlatformModuleId } from './types';

interface ModuleNavProps {
  modules: PlatformModuleDefinition[];
  selectedModuleId: PlatformModuleId;
  cursorIndex: number;
  activePane: AppPane;
}

export function ModuleNav({ modules, selectedModuleId, cursorIndex, activePane }: ModuleNavProps) {
  const isPaneFocused = activePane === 'nav';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={isPaneFocused ? 'cyan' : undefined}>
        Modules
      </Text>
      <Box marginTop={1} flexDirection="column">
        {modules.map((module, index) => {
          const isSelected = module.id === selectedModuleId;
          const isCursor = index === cursorIndex;
          const prefix = isCursor ? (isPaneFocused ? '>' : '*') : ' ';
          const marker = isSelected ? '●' : ' ';

          return (
            <Text key={module.id} color={isSelected ? 'green' : undefined}>
              {prefix} {module.label} {marker}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ to move and Enter to select</Text>
      </Box>
    </Box>
  );
}
