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
        Keys: Up/Down modules | Left/Right panes | Enter select | / or p palette | g orgs | r mode | Esc nav |
        q or Ctrl+C quit
      </Text>
    </Box>
  );
}
