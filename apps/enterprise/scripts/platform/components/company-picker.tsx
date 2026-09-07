import React from "react";
import { Box, Text } from "ink";

import type { CompanyPickerItem } from "./types";

interface CompanyPickerProps {
  isOpen: boolean;
  query: string;
  rows: CompanyPickerItem[];
  selectedIndex: number;
  loading: boolean;
}

const WINDOW_SIZE = 8;

export function CompanyPicker({ isOpen, query, rows, selectedIndex, loading }: CompanyPickerProps) {
  if (!isOpen) return null;

  const start = Math.min(
    Math.max(0, selectedIndex - Math.floor(WINDOW_SIZE / 2)),
    Math.max(0, rows.length - WINDOW_SIZE),
  );
  const visible = rows.slice(start, start + WINDOW_SIZE);

  return (
    <Box marginTop={1} borderStyle="classic" flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Focus Company</Text>
      <Text dimColor>Search: {query || "(type to search companies)"} | Matches: {String(rows.length)}</Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {visible.length ? (
          visible.map((row, index) => {
            const absolute = start + index;
            const selected = absolute === selectedIndex;
            return (
              <Text key={row.id} color={selected ? "cyan" : undefined}>
                {selected ? ">>" : "  "} {row.name} ({row.slug})
              </Text>
            );
          })
        ) : (
          <Text dimColor>No matching companies.</Text>
        )}
      </Box>
      <Text dimColor>Keys: type search | Up/Down select | Enter focus | Backspace edit | Esc cancel</Text>
    </Box>
  );
}
