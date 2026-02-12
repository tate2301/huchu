import React from "react";
import { Box, Text } from "ink";

interface QuickGuideProps {
  workspaceMode: "tree" | "operation";
  treeLevel: "task" | "operation";
  hasFocusedCompany: boolean;
  readOnly: boolean;
}

export function QuickGuide({ workspaceMode, treeLevel, hasFocusedCompany, readOnly }: QuickGuideProps) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>How To Use</Text>
      {workspaceMode === "tree" ? (
        <>
          <Text dimColor>1. Use Up/Down in Module Nav to pick a domain.</Text>
          <Text dimColor>2. In Main pane, pick a section and press Enter.</Text>
          <Text dimColor>3. Drill into an action, then press Enter to open its wizard.</Text>
          <Text dimColor>
            4. Current step: {treeLevel === "task" ? "choosing section" : "choosing action"}.
          </Text>
        </>
      ) : (
        <>
          <Text dimColor>1. Wizard is active: type directly in highlighted fields.</Text>
          <Text dimColor>2. Enter moves forward or submits; Esc moves back.</Text>
          <Text dimColor>3. Esc on first wizard step returns to operation tree.</Text>
          <Text dimColor>4. Global hotkeys are paused while typing in wizard input.</Text>
        </>
      )}
      <Text dimColor>Company scope: {hasFocusedCompany ? "set" : "not set (press f in tree view)"}</Text>
      <Text dimColor>Mutation mode: {readOnly ? "read-only" : "read-write"}</Text>
    </Box>
  );
}
