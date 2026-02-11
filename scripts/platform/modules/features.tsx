import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { FeatureSummary, PlatformServices } from "../types";

type EditingField = "companyId" | "reason";

interface FeaturesModuleProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
}

function applyTextInput(current: string, input: string, key: { backspace?: boolean; delete?: boolean }) {
  if (key.backspace || key.delete) return current.slice(0, -1);
  if (!input) return current;
  const code = input.charCodeAt(0);
  if (Number.isNaN(code) || code < 32 || code === 127) return current;
  return `${current}${input}`;
}

export function FeaturesModule({ actor, services, focusCompanyId, readOnly }: FeaturesModuleProps) {
  const [rows, setRows] = useState<FeatureSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [companyId, setCompanyId] = useState(focusCompanyId || "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [confirmDraft, setConfirmDraft] = useState("");

  const selected = rows[selectedIndex] ?? null;
  const actionLabel = pendingEnabled === null ? null : pendingEnabled ? "ENABLE" : "DISABLE";
  const expectedConfirmation = selected && actionLabel ? `CONFIRM ${actionLabel} ${selected.feature}` : "";

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await services.feature.list({
        companyId: companyId || undefined,
      });
      setRows(data);
      setSelectedIndex((current) => Math.min(current, Math.max(0, data.length - 1)));
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load features");
    } finally {
      setLoading(false);
    }
  }, [companyId, services.feature]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  const runSetFeature = useCallback(async () => {
    if (!selected || pendingEnabled === null) return;
    if (!companyId) {
      setErrorMessage("Set companyId first (press c).");
      return;
    }

    const result = await services.feature.set({
      companyId,
      featureKey: selected.feature,
      enabled: pendingEnabled,
      actor,
      reason: reason || undefined,
    });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setStatusMessage(`Feature ${result.resource.feature} set to ${String(result.resource.enabled)}`);
    setPendingEnabled(null);
    setConfirmDraft("");
    setRefreshToken((current) => current + 1);
  }, [actor, companyId, pendingEnabled, reason, selected, services.feature]);

  useInput((input, key) => {
    if (editingField) {
      if (key.escape) {
        setEditingField(null);
        setEditDraft("");
        return;
      }
      if (key.return) {
        const value = editDraft.trim();
        if (editingField === "companyId") {
          setCompanyId(value);
          setRefreshToken((current) => current + 1);
        } else {
          setReason(value);
        }
        setEditingField(null);
        setEditDraft("");
        return;
      }
      setEditDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (pendingEnabled !== null) {
      if (key.escape) {
        setPendingEnabled(null);
        setConfirmDraft("");
        return;
      }
      if (key.return) {
        if (confirmDraft.trim() === expectedConfirmation) {
          void runSetFeature();
        } else {
          setErrorMessage("Confirmation phrase does not match.");
        }
        return;
      }
      setConfirmDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(rows.length - 1, current + 1));
      return;
    }

    if (input === "l") {
      setRefreshToken((current) => current + 1);
      return;
    }
    if (input === "c") {
      setEditingField("companyId");
      setEditDraft(companyId);
      return;
    }
    if (input === "y") {
      setEditingField("reason");
      setEditDraft(reason);
      return;
    }
    if (input === "e" && !readOnly && selected) {
      setPendingEnabled(true);
      setConfirmDraft("");
      return;
    }
    if (input === "d" && !readOnly && selected) {
      setPendingEnabled(false);
      setConfirmDraft("");
      return;
    }
  });

  const visibleRows = rows.slice(Math.max(0, selectedIndex - 8), Math.max(0, selectedIndex - 8) + 16);
  const windowStart = Math.max(0, selectedIndex - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Features</Text>
      <Text dimColor>Company: {companyId || "none"} | Mode: {readOnly ? "read-only" : "read-write"} | Reason: {reason || "<none>"}</Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}

      <Box marginTop={1} flexDirection="column">
        {visibleRows.length ? (
          visibleRows.map((row, offset) => {
            const absoluteIndex = windowStart + offset;
            const isSelected = absoluteIndex === selectedIndex;
            const prefix = isSelected ? ">" : " ";
            return (
              <Text key={row.feature} color={isSelected ? "cyan" : undefined}>
                {prefix} {row.feature} | enabled {String(row.enabled)} | platformActive {String(row.platformActive)}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No features found.</Text>
        )}
      </Box>

      {pendingEnabled !== null && selected ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Confirm feature change</Text>
          <Text>Type: {expectedConfirmation}</Text>
          <Text>Input: {confirmDraft || "<waiting>"}</Text>
          <Text dimColor>Enter confirm, Esc cancel.</Text>
        </Box>
      ) : null}

      {editingField ? (
        <Text color="yellow">Editing {editingField}: {editDraft || "<empty>"} (Enter save, Esc cancel)</Text>
      ) : null}

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {statusMessage ? <Text color="green">{statusMessage}</Text> : null}

      <Text dimColor>Keys: Up/Down select | l reload | c company | y reason | e enable | d disable</Text>
    </Box>
  );
}
