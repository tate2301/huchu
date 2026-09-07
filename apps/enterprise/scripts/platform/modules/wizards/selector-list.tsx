import React from "react";
import { Box, Text } from "ink";

interface SelectorListProps<TItem> {
  items: TItem[];
  selectedIndex: number;
  emptyMessage: string;
  render: (item: TItem, selected: boolean) => string;
}

const WINDOW = 10;

export function SelectorList<TItem>({ items, selectedIndex, emptyMessage, render }: SelectorListProps<TItem>) {
  if (!items.length) {
    return <Text dimColor>{emptyMessage}</Text>;
  }

  const start = Math.min(Math.max(0, selectedIndex - Math.floor(WINDOW / 2)), Math.max(0, items.length - WINDOW));
  const visible = items.slice(start, start + WINDOW);

  return (
    <Box flexDirection="column">
      {visible.map((item, offset) => {
        const absolute = start + offset;
        const selected = absolute === selectedIndex;
        return (
          <Text key={absolute} color={selected ? "cyan" : undefined}>
            {selected ? ">>" : "  "} {render(item, selected)}
          </Text>
        );
      })}
    </Box>
  );
}
