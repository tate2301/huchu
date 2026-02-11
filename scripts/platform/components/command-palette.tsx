import React from 'react';
import { Box, Text } from 'ink';

import type { PaletteCommand } from './types';

interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  commands: PaletteCommand[];
  selectedIndex: number;
}

const WINDOW_SIZE = 8;

export function CommandPalette({ isOpen, query, commands, selectedIndex }: CommandPaletteProps) {
  if (!isOpen) {
    return null;
  }

  const start = Math.min(
    Math.max(0, selectedIndex - Math.floor(WINDOW_SIZE / 2)),
    Math.max(0, commands.length - WINDOW_SIZE),
  );
  const visible = commands.slice(start, start + WINDOW_SIZE);

  return (
    <Box marginTop={1} borderStyle="classic" flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Command Palette</Text>
      <Text dimColor>Filter: {query || '(type to filter)'}</Text>
      <Box marginTop={1} flexDirection="column">
        {visible.length > 0 ? (
          visible.map((command, index) => {
            const absoluteIndex = start + index;
            const isSelected = absoluteIndex === selectedIndex;
            const prefix = isSelected ? '>>' : '  ';
            const suffix = command.shortcut ? ` [${command.shortcut}]` : '';

            return (
              <Text key={command.id} color={command.disabled ? 'gray' : isSelected ? 'cyan' : undefined}>
                {prefix} {command.title}
                {suffix}
                {command.detail ? ` - ${command.detail}` : ''}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No matching commands.</Text>
        )}
      </Box>
      <Text dimColor>Keys: Up/Down move, Enter run, Esc close, Backspace edit</Text>
    </Box>
  );
}
