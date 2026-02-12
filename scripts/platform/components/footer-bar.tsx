import React from 'react';
import { Box, Text } from 'ink';

interface FooterBarProps {
  actor: string;
  contextLabel: string;
  moduleLabel: string;
  focusCompanyId: string | null;
  readOnly: boolean;
}

export function FooterBar({
  actor,
  contextLabel,
  moduleLabel,
  focusCompanyId,
  readOnly,
}: FooterBarProps) {
  return (
    <Box borderStyle="classic" paddingX={1} flexDirection="column">
      <Text>
        Actor: {actor} | Context: {contextLabel} | Module: {moduleLabel} | Company: {focusCompanyId ?? 'none'} |
        Mode: {readOnly ? 'read-only' : 'read-write'}
      </Text>
      <Text dimColor>
        Keys: Up/Down navigate | Left/Right panes | Enter open | / or p palette | f company picker | r mode |
        Esc back | q or Ctrl+C quit
      </Text>
    </Box>
  );
}
