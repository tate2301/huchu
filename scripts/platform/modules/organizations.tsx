import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices } from "../types";

type OrgAction = "SUSPEND" | "ACTIVATE" | "DISABLE";
type EditingField = "search" | "reason";
type ProvisionField = "name" | "slug" | "adminEmail" | "adminName" | "adminPassword";

interface OrganizationsModuleProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
}

const PROVISION_FIELDS: ProvisionField[] = ["name", "slug", "adminEmail", "adminName", "adminPassword"];

function applyTextInput(current: string, input: string, key: { backspace?: boolean; delete?: boolean }) {
  if (key.backspace || key.delete) return current.slice(0, -1);
  if (!input) return current;
  const code = input.charCodeAt(0);
  if (Number.isNaN(code) || code < 32 || code === 127) return current;
  return `${current}${input}`;
}

export function OrganizationsModule({ actor, services, focusCompanyId, readOnly }: OrganizationsModuleProps) {
  const [rows, setRows] = useState<OrganizationListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [search, setSearch] = useState("");
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [pendingAction, setPendingAction] = useState<OrgAction | null>(null);
  const [confirmationDraft, setConfirmationDraft] = useState("");
  const [reason, setReason] = useState("");

  const [showProvision, setShowProvision] = useState(false);
  const [provisionField, setProvisionField] = useState<ProvisionField>("name");
  const [provisionDraft, setProvisionDraft] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminName: "",
    adminPassword: "",
  });

  const selected = rows[selectedIndex] ?? null;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await services.org.list({
        search,
        limit: 100,
      });
      setRows(data);
      setSelectedIndex((current) => Math.min(current, Math.max(0, data.length - 1)));
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [search, services.org]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  const focusedSelected = useMemo(() => {
    if (!focusCompanyId || !rows.length) return selected;
    return rows.find((row) => row.id === focusCompanyId || row.slug === focusCompanyId) ?? selected;
  }, [focusCompanyId, rows, selected]);

  const expectedConfirmation = useMemo(() => {
    if (!pendingAction || !focusedSelected) return "";
    return `CONFIRM ${pendingAction} ${focusedSelected.slug}`;
  }, [pendingAction, focusedSelected]);

  const runStatusChange = useCallback(
    async (action: OrgAction) => {
      if (!focusedSelected) return;
      const actionFn =
        action === "ACTIVATE" ? services.org.activate : action === "DISABLE" ? services.org.disable : services.org.suspend;

      setStatusMessage(`Running ${action.toLowerCase()} for ${focusedSelected.slug}...`);
      setErrorMessage(null);
      const result = await actionFn({
        companyId: focusedSelected.id,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setStatusMessage(`${action} completed for ${focusedSelected.slug}`);
      setPendingAction(null);
      setConfirmationDraft("");
      setReason("");
      setRefreshToken((current) => current + 1);
    },
    [actor, focusedSelected, reason, services.org],
  );

  const runProvision = useCallback(async () => {
    setStatusMessage("Provisioning organization...");
    setErrorMessage(null);
    const result = await services.org.provision({
      ...provisionDraft,
      actor,
    });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setStatusMessage(`Provisioned ${result.resource.company.slug}`);
    setShowProvision(false);
    setProvisionField("name");
    setProvisionDraft({ name: "", slug: "", adminEmail: "", adminName: "", adminPassword: "" });
    setRefreshToken((current) => current + 1);
  }, [actor, provisionDraft, services.org]);

  useInput((input, key) => {
    if (showProvision) {
      if (key.escape) {
        setShowProvision(false);
        return;
      }
      if (key.tab) {
        const nextIndex = (PROVISION_FIELDS.indexOf(provisionField) + 1) % PROVISION_FIELDS.length;
        setProvisionField(PROVISION_FIELDS[nextIndex]);
        return;
      }
      if (key.return) {
        if (provisionField !== "adminPassword") {
          const nextIndex = (PROVISION_FIELDS.indexOf(provisionField) + 1) % PROVISION_FIELDS.length;
          setProvisionField(PROVISION_FIELDS[nextIndex]);
          return;
        }
        if (!readOnly) {
          void runProvision();
        }
        return;
      }
      setProvisionDraft((current) => ({
        ...current,
        [provisionField]: applyTextInput(current[provisionField], input, key),
      }));
      return;
    }

    if (editingField) {
      if (key.escape) {
        setEditingField(null);
        setEditDraft("");
        return;
      }
      if (key.return) {
        if (editingField === "search") {
          setSearch(editDraft.trim());
          setRefreshToken((current) => current + 1);
        } else {
          setReason(editDraft.trim());
        }
        setEditingField(null);
        setEditDraft("");
        return;
      }
      setEditDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (pendingAction) {
      if (key.escape) {
        setPendingAction(null);
        setConfirmationDraft("");
        setReason("");
        return;
      }
      if (key.return) {
        if (confirmationDraft.trim() === expectedConfirmation) {
          void runStatusChange(pendingAction);
        } else {
          setErrorMessage("Confirmation phrase does not match.");
        }
        return;
      }
      setConfirmationDraft((current) => applyTextInput(current, input, key));
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
    if (input === "/") {
      setEditingField("search");
      setEditDraft(search);
      return;
    }
    if (input === "p" && !readOnly) {
      setShowProvision(true);
      return;
    }
    if ((input === "s" || input === "a" || input === "x") && !readOnly && focusedSelected) {
      const action: OrgAction = input === "a" ? "ACTIVATE" : input === "x" ? "DISABLE" : "SUSPEND";
      setPendingAction(action);
      setConfirmationDraft("");
      setReason("");
      return;
    }
      if (input === "y") {
        setEditingField("reason");
        setEditDraft(reason);
      }
  });

  const visibleRows = rows.slice(Math.max(0, selectedIndex - 8), Math.max(0, selectedIndex - 8) + 16);
  const windowStart = Math.max(0, selectedIndex - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Organizations</Text>
      <Text dimColor>Search: {search || "none"} | Focus: {focusCompanyId || "none"} | Mode: {readOnly ? "read-only" : "read-write"}</Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}

      <Box marginTop={1} flexDirection="column">
        {visibleRows.length ? (
          visibleRows.map((row, offset) => {
            const absoluteIndex = windowStart + offset;
            const selectedRow = absoluteIndex === selectedIndex;
            const prefix = selectedRow ? ">" : " ";
            return (
              <Text key={row.id} color={selectedRow ? "cyan" : undefined}>
                {prefix} {row.slug} | {row.status} | users {String(row.activeUserCount)}/{String(row.userCount)} | sites {String(row.activeSiteCount)}/{String(row.siteCount)}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No organizations found.</Text>
        )}
      </Box>

      {focusedSelected ? (
        <Box marginTop={1} flexDirection="column">
          <Text>Selected: {focusedSelected.name} ({focusedSelected.slug})</Text>
          <Text>Status: {focusedSelected.status} | Provisioned: {String(focusedSelected.isProvisioned)}</Text>
        </Box>
      ) : null}

      {showProvision ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Provision Organization</Text>
          <Text color={provisionField === "name" ? "cyan" : undefined}>name: {provisionDraft.name || "<required>"}</Text>
          <Text color={provisionField === "slug" ? "cyan" : undefined}>slug: {provisionDraft.slug || "<auto>"}</Text>
          <Text color={provisionField === "adminEmail" ? "cyan" : undefined}>adminEmail: {provisionDraft.adminEmail || "<required>"}</Text>
          <Text color={provisionField === "adminName" ? "cyan" : undefined}>adminName: {provisionDraft.adminName || "<required>"}</Text>
          <Text color={provisionField === "adminPassword" ? "cyan" : undefined}>adminPassword: {provisionDraft.adminPassword ? "***" : "<required>"}</Text>
          <Text dimColor>Tab next field, Enter submit on password, Esc cancel.</Text>
        </Box>
      ) : null}

      {pendingAction && focusedSelected ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Confirm {pendingAction}</Text>
          <Text>Type: {expectedConfirmation}</Text>
          <Text>Input: {confirmationDraft || "<waiting>"}</Text>
          <Text>Reason: {reason || "<none>"}</Text>
          <Text dimColor>Press y to edit reason before confirming. Enter confirms, Esc cancels.</Text>
        </Box>
      ) : null}

      {editingField ? (
        <Text color="yellow">
          Editing {editingField}: {editDraft || "<empty>"} (Enter save, Esc cancel)
        </Text>
      ) : null}

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {statusMessage ? <Text color="green">{statusMessage}</Text> : null}

      <Text dimColor>Keys: Up/Down select | / search | l reload | p provision | s suspend | a activate | x disable | y reason</Text>
    </Box>
  );
}
