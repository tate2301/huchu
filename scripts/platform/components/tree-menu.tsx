import React from "react";
import { Box, Text } from "ink";

export interface TreeMenuItem {
  id: string;
  label: string;
  description: string;
}

interface TreeMenuProps {
  title: string;
  items: TreeMenuItem[];
  cursorIndex: number;
  focused: boolean;
  emptyMessage?: string;
}

export function TreeMenu({ title, items, cursorIndex, focused, emptyMessage = "No menu items." }: TreeMenuProps) {
  return (
    <Box flexDirection="column">
      <Text bold color={focused ? "cyan" : undefined}>
        {title} {focused ? "[FOCUSED]" : "[idle]"}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {items.length ? (
          items.map((item, index) => {
            const selected = index === cursorIndex;
            return (
              <Text key={item.id} color={selected ? "green" : undefined}>
                {selected ? ">>" : "  "} {String(index + 1)}. {item.label} - {item.description}
              </Text>
            );
          })
        ) : (
          <Text dimColor>{emptyMessage}</Text>
        )}
      </Box>
    </Box>
  );
}
