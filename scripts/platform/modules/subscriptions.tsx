import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

import { SUBSCRIPTION_STATUSES, type PlatformServices, type SubscriptionStatusValue, type SubscriptionSummary } from "../types";

type EditingField = "companyId" | "status" | "reason";

interface SubscriptionsModuleProps {
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

export function SubscriptionsModule({ actor, services, focusCompanyId, readOnly }: SubscriptionsModuleProps) {
  const [rows, setRows] = useState<SubscriptionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [companyIdFilter, setCompanyIdFilter] = useState(focusCompanyId || "");
  const [targetStatus, setTargetStatus] = useState<SubscriptionStatusValue>("ACTIVE");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmMode, setConfirmMode] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState("");

  const selected = rows[selectedIndex] ?? null;
  const expectedConfirmation = selected ? `CONFIRM SET_STATUS ${selected.companySlug || selected.companyId}` : "";

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await services.subscription.list({
        companyId: companyIdFilter || undefined,
        limit: 100,
      });
      setRows(data);
      setSelectedIndex((current) => Math.min(current, Math.max(0, data.length - 1)));
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [companyIdFilter, services.subscription]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  const runSetStatus = useCallback(async () => {
    if (!selected) return;
    const result = await services.subscription.setStatus({
      companyId: selected.companyId,
      status: targetStatus,
      actor,
      reason: reason || undefined,
    });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setStatusMessage(`Updated ${result.resource.companySlug} to ${result.resource.afterStatus}`);
    setConfirmMode(false);
    setConfirmDraft("");
    setRefreshToken((current) => current + 1);
  }, [actor, reason, selected, services.subscription, targetStatus]);

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
          setCompanyIdFilter(value);
          setRefreshToken((current) => current + 1);
        } else if (editingField === "status") {
          const normalized = value.toUpperCase() as SubscriptionStatusValue;
          if (SUBSCRIPTION_STATUSES.includes(normalized)) {
            setTargetStatus(normalized);
          } else {
            setErrorMessage(`Invalid status: ${value}`);
          }
        } else if (editingField === "reason") {
          setReason(value);
        }
        setEditingField(null);
        setEditDraft("");
        return;
      }
      setEditDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (confirmMode) {
      if (key.escape) {
        setConfirmMode(false);
        setConfirmDraft("");
        return;
      }
      if (key.return) {
        if (confirmDraft.trim() === expectedConfirmation) {
          void runSetStatus();
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
      setEditDraft(companyIdFilter);
      return;
    }
    if (input === "t") {
      setEditingField("status");
      setEditDraft(targetStatus);
      return;
    }
    if (input === "y") {
      setEditingField("reason");
      setEditDraft(reason);
      return;
    }
    if (input === "s" && !readOnly && selected) {
      setConfirmMode(true);
      setConfirmDraft("");
    }
  });

  const visibleRows = rows.slice(Math.max(0, selectedIndex - 8), Math.max(0, selectedIndex - 8) + 16);
  const windowStart = Math.max(0, selectedIndex - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Subscriptions</Text>
      <Text dimColor>Filter company: {companyIdFilter || "all"} | Target status: {targetStatus} | Mode: {readOnly ? "read-only" : "read-write"}</Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}

      <Box marginTop={1} flexDirection="column">
        {visibleRows.length ? (
          visibleRows.map((row, offset) => {
            const absoluteIndex = windowStart + offset;
            const isSelected = absoluteIndex === selectedIndex;
            const prefix = isSelected ? ">" : " ";
            return (
              <Text key={row.id} color={isSelected ? "cyan" : undefined}>
                {prefix} {row.companySlug || row.companyId} | {row.status} | plan {row.planCode || "CUSTOM"} | updated {row.updatedAt || "-"}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No subscriptions found.</Text>
        )}
      </Box>

      {selected ? (
        <Box marginTop={1} flexDirection="column">
          <Text>Selected: {selected.companyName || selected.companySlug || selected.companyId}</Text>
          <Text>Status: {selected.status} | Period start: {selected.currentPeriodStart || "-"}</Text>
          <Text>Reason: {reason || "<none>"}</Text>
        </Box>
      ) : null}

      {editingField ? (
        <Text color="yellow">Editing {editingField}: {editDraft || "<empty>"} (Enter save, Esc cancel)</Text>
      ) : null}

      {confirmMode && selected ? (
        <Box flexDirection="column">
          <Text color="yellow">Confirm status change</Text>
          <Text>Type: {expectedConfirmation}</Text>
          <Text>Input: {confirmDraft || "<waiting>"}</Text>
          <Text dimColor>Enter confirm, Esc cancel.</Text>
        </Box>
      ) : null}

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {statusMessage ? <Text color="green">{statusMessage}</Text> : null}

      <Text dimColor>Keys: Up/Down select | l reload | c company | t target status | y reason | s apply status</Text>
    </Box>
  );
}
