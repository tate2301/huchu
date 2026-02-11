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
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text>
        Actor: {actor} | Context: {contextLabel} | Module: {moduleLabel} | Company:{' '}
        {focusCompanyId ?? 'none'} | Mode: {readOnly ? 'read-only' : 'read-write'}
      </Text>
      <Text dimColor>↑/↓ modules  ←/→ pane  Enter select  / or p palette  g orgs  r mode  esc close  q quit</Text>
    </Box>
  );
}
