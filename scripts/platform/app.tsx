import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";

import { CommandPalette } from "./components/command-palette";
import { CompanyPicker } from "./components/company-picker";
import { FooterBar } from "./components/footer-bar";
import { InspectorPanel } from "./components/inspector-panel";
import { MainContent } from "./components/main-content";
import { ModuleNav } from "./components/module-nav";
import { TreeMenu, type TreeMenuItem } from "./components/tree-menu";
import type {
  AppPane,
  CompanyPickerItem,
  ModuleMount,
  PaletteCommand,
  PlatformModuleDefinition,
  PlatformModuleId,
} from "./components/types";
import { ACTION_TREE, findOperationById, type ActionDomain } from "./tree/action-tree";

type WorkspaceMode = "tree" | "operation";
type TreeLevel = "task" | "operation";

const DEFAULT_MODULES: PlatformModuleDefinition[] = [
  { id: "orgs", label: "Organizations", description: "Provisioning and tenant state controls.", shortcut: "g" },
  { id: "subscriptions", label: "Subscriptions", description: "Billing plan and status management." },
  { id: "features", label: "Features", description: "Platform feature flag operations." },
  { id: "admins", label: "Admins", description: "Admin lifecycle and role controls." },
  { id: "support", label: "Support", description: "Support requests and operator sessions." },
  { id: "contracts", label: "Contracts", description: "Warning and suspension enforcement." },
  { id: "health", label: "Health", description: "SLO snapshots and remediation incidents." },
  { id: "runbooks", label: "Runbooks", description: "Automation schedules and executions." },
  { id: "audit", label: "Audit", description: "Operational and compliance event trail." },
];

const PANE_ORDER: AppPane[] = ["nav", "main", "inspector"];

interface ResolvedPaletteCommand extends PaletteCommand {
  run: () => void;
}

export interface PlatformAppProps {
  actor: string;
  contextLabel?: string;
  modules?: PlatformModuleDefinition[];
  moduleMounts?: Record<string, ModuleMount | undefined>;
  initialModuleId?: PlatformModuleId;
  initialCompanyId?: string | null;
  initialReadOnly?: boolean;
  resolveCompanies?: (query: string, limit?: number) => Promise<CompanyPickerItem[]>;
  onQuit?: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeModules(modules?: PlatformModuleDefinition[]) {
  if (modules && modules.length > 0) return modules;
  return DEFAULT_MODULES;
}

function isPrintableInput(input: string, key: { ctrl: boolean; meta: boolean }) {
  return !key.ctrl && !key.meta && input.length === 1 && input >= " ";
}

function domainAsModule(domain: ActionDomain): PlatformModuleDefinition {
  return {
    id: domain.id,
    label: domain.label,
    description: domain.description,
  };
}

function createTaskCursorMap() {
  return Object.fromEntries(ACTION_TREE.map((domain) => [domain.id, 0])) as Record<string, number>;
}

function createOperationCursorMap() {
  return Object.fromEntries(
    ACTION_TREE.flatMap((domain) => domain.tasks.map((task) => [task.id, 0])),
  ) as Record<string, number>;
}

export function PlatformApp({
  actor,
  contextLabel = "platform",
  modules,
  moduleMounts,
  initialCompanyId = null,
  initialReadOnly = false,
  resolveCompanies,
  onQuit,
}: PlatformAppProps) {
  const { exit } = useApp();
  const moduleDefinitions = useMemo(() => normalizeModules(modules), [modules]);
  const moduleById = useMemo(
    () => new Map<PlatformModuleId, PlatformModuleDefinition>(moduleDefinitions.map((module) => [module.id, module])),
    [moduleDefinitions],
  );

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("tree");
  const [treeLevel, setTreeLevel] = useState<TreeLevel>("task");
  const [openedOperationId, setOpenedOperationId] = useState<string | null>(null);

  const [domainCursor, setDomainCursor] = useState(0);
  const [taskCursorByDomain, setTaskCursorByDomain] = useState<Record<string, number>>(createTaskCursorMap);
  const [operationCursorByTask, setOperationCursorByTask] = useState<Record<string, number>>(createOperationCursorMap);

  const [activePane, setActivePane] = useState<AppPane>("nav");
  const [focusCompanyId, setFocusCompanyId] = useState<string | null>(initialCompanyId);
  const [focusCompanyDisplay, setFocusCompanyDisplay] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState<boolean>(initialReadOnly);
  const [statusMessage, setStatusMessage] = useState<string>(
    "Ready. Pick a domain, then drill down section > action. Enter goes deeper, Esc goes back.",
  );
  const [isPaletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [paletteQuery, setPaletteQuery] = useState<string>("");
  const [paletteIndex, setPaletteIndex] = useState<number>(0);
  const [isInputLocked, setInputLocked] = useState(false);

  const [isCompanyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyRows, setCompanyRows] = useState<CompanyPickerItem[]>([]);
  const [companyPickerIndex, setCompanyPickerIndex] = useState(0);
  const [companyPickerLoading, setCompanyPickerLoading] = useState(false);

  const selectedDomain = ACTION_TREE[clamp(domainCursor, 0, ACTION_TREE.length - 1)] ?? ACTION_TREE[0];
  const taskCursor = clamp(
    taskCursorByDomain[selectedDomain.id] ?? 0,
    0,
    Math.max(0, selectedDomain.tasks.length - 1),
  );
  const selectedTask = selectedDomain.tasks[taskCursor] ?? null;
  const operationCursor = selectedTask
    ? clamp(
        operationCursorByTask[selectedTask.id] ?? 0,
        0,
        Math.max(0, selectedTask.operations.length - 1),
      )
    : 0;
  const selectedOperation = selectedTask?.operations[operationCursor] ?? null;

  const openedContext = openedOperationId ? findOperationById(openedOperationId) : null;
  const activeOperation = workspaceMode === "operation" ? openedContext?.operation ?? selectedOperation : selectedOperation;
  const activeTask = workspaceMode === "operation" ? openedContext?.task ?? selectedTask : selectedTask;
  const activeDomain = workspaceMode === "operation" ? openedContext?.domain ?? selectedDomain : selectedDomain;
  const selectedModule = activeOperation
    ? moduleById.get(activeOperation.moduleId) ?? moduleDefinitions[0]
    : moduleDefinitions[0];

  const mainTitle =
    workspaceMode === "operation" && activeOperation
      ? `${activeTask?.label || "Action"} > ${activeOperation.label}`
      : treeLevel === "task"
        ? `${selectedDomain.label} Sections`
        : `${selectedTask?.label ?? "Section"} Actions`;
  const mainDescription =
    workspaceMode === "operation" && activeOperation
      ? activeOperation.description
      : treeLevel === "task"
        ? "Control-panel navigation: choose a section to drill into."
        : "Choose an action to launch its wizard. Esc returns to section list.";

  useEffect(() => {
    let ignore = false;
    async function loadCompanies() {
      if (!isCompanyPickerOpen) return;
      if (!resolveCompanies) {
        setCompanyRows([]);
        return;
      }
      setCompanyPickerLoading(true);
      try {
        const rows = await resolveCompanies(companyQuery, 20);
        if (!ignore) {
          setCompanyRows(rows);
          setCompanyPickerIndex((current) => clamp(current, 0, Math.max(0, rows.length - 1)));
        }
      } catch {
        if (!ignore) setCompanyRows([]);
      } finally {
        if (!ignore) setCompanyPickerLoading(false);
      }
    }
    void loadCompanies();
    return () => {
      ignore = true;
    };
  }, [companyQuery, isCompanyPickerOpen, resolveCompanies]);

  const quitShell = useCallback(() => {
    onQuit?.();
    exit();
  }, [exit, onQuit]);

  const openCompanyPicker = useCallback(() => {
    setCompanyPickerOpen(true);
    setCompanyQuery("");
    setCompanyPickerIndex(0);
    setStatusMessage("Focus company picker opened. Type to search.");
  }, []);

  const closeCompanyPicker = useCallback(() => {
    setCompanyPickerOpen(false);
    setCompanyQuery("");
    setCompanyPickerIndex(0);
    setStatusMessage("Focus company picker closed.");
  }, []);

  const openSelectedOperation = useCallback(() => {
    if (!selectedOperation) {
      setStatusMessage("No operation selected.");
      return;
    }
    setOpenedOperationId(selectedOperation.id);
    setWorkspaceMode("operation");
    setActivePane("main");
    setStatusMessage(`Opened wizard: ${selectedOperation.label}`);
  }, [selectedOperation]);

  const backToTree = useCallback(() => {
    setWorkspaceMode("tree");
    setOpenedOperationId(null);
    setTreeLevel("operation");
    setStatusMessage("Returned to actions list.");
  }, []);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    setPaletteQuery("");
    setPaletteIndex(0);
    setStatusMessage("Command palette opened.");
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    setStatusMessage("Command palette closed.");
  }, []);

  const toggleReadOnly = useCallback(() => {
    setReadOnly((current) => {
      const next = !current;
      setStatusMessage(next ? "Switched to read-only mode" : "Switched to read-write mode");
      return next;
    });
  }, []);

  const normalizedQuery = paletteQuery.trim().toLowerCase();

  const paletteCommands = useMemo<ResolvedPaletteCommand[]>(() => {
    const commands: ResolvedPaletteCommand[] = [];

    for (const [domainIndex, domain] of ACTION_TREE.entries()) {
      commands.push({
        id: `domain:${domain.id}`,
        title: `Open ${domain.label}`,
        detail: domain.description,
        run: () => {
          setDomainCursor(domainIndex);
          setTreeLevel("task");
          setWorkspaceMode("tree");
          setActivePane("main");
          setStatusMessage(`Opened ${domain.label}.`);
        },
      });

      for (const [taskIndex, task] of domain.tasks.entries()) {
        commands.push({
          id: `task:${task.id}`,
          title: `${domain.label}: ${task.label}`,
          detail: task.description,
          run: () => {
            setDomainCursor(domainIndex);
            setTaskCursorByDomain((current) => ({ ...current, [domain.id]: taskIndex }));
            setTreeLevel("operation");
            setWorkspaceMode("tree");
            setActivePane("main");
            setStatusMessage(`Opened task ${task.label}.`);
          },
        });

        for (const [operationIndex, operation] of task.operations.entries()) {
          commands.push({
            id: `operation:${operation.id}`,
            title: operation.label,
            detail: `${task.label} - ${operation.description}`,
            run: () => {
              setDomainCursor(domainIndex);
              setTaskCursorByDomain((current) => ({ ...current, [domain.id]: taskIndex }));
              setOperationCursorByTask((current) => ({ ...current, [task.id]: operationIndex }));
              setOpenedOperationId(operation.id);
              setWorkspaceMode("operation");
              setActivePane("main");
              setStatusMessage(`Opened wizard: ${operation.label}`);
            },
          });
        }
      }
    }

    commands.push({
      id: "focus:company",
      title: "Set focused company",
      detail: "Search and select company from list",
      shortcut: "f",
      run: openCompanyPicker,
    });

    commands.push({
      id: "focus:clear",
      title: "Clear focused company",
      detail: "Reset company context",
      disabled: focusCompanyId === null,
      run: () => {
        setFocusCompanyId(null);
        setFocusCompanyDisplay(null);
        setStatusMessage("Cleared focused company.");
      },
    });

    commands.push({
      id: "toggle:read-only",
      title: readOnly ? "Switch to read-write mode" : "Switch to read-only mode",
      detail: "Toggle mutation lock",
      shortcut: "r",
      run: toggleReadOnly,
    });

    if (workspaceMode === "operation") {
      commands.push({
        id: "workspace:back",
        title: "Back to operation tree",
        detail: "Return to task/operation selection",
        shortcut: "esc",
        run: backToTree,
      });
    }

    commands.push({
      id: "app:quit",
      title: "Quit shell",
      shortcut: "q",
      run: quitShell,
    });

    if (!normalizedQuery) return commands;
    return commands.filter((command) => {
      const haystack = `${command.title} ${command.detail ?? ""} ${command.shortcut ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [backToTree, focusCompanyId, normalizedQuery, openCompanyPicker, quitShell, readOnly, toggleReadOnly, workspaceMode]);

  const effectivePaletteIndex = clamp(paletteIndex, 0, Math.max(0, paletteCommands.length - 1));
  const runPaletteSelection = useCallback(() => {
    const command = paletteCommands[effectivePaletteIndex];
    if (!command) {
      setStatusMessage("No command selected.");
      return;
    }
    if (command.disabled) {
      setStatusMessage("Command is unavailable.");
      return;
    }
    command.run();
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
  }, [effectivePaletteIndex, paletteCommands]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      quitShell();
      return;
    }

    if (isCompanyPickerOpen) {
      if (key.escape) {
        closeCompanyPicker();
        return;
      }
      if (key.upArrow) {
        setCompanyPickerIndex((current) => clamp(current - 1, 0, Math.max(0, companyRows.length - 1)));
        return;
      }
      if (key.downArrow) {
        setCompanyPickerIndex((current) => clamp(current + 1, 0, Math.max(0, companyRows.length - 1)));
        return;
      }
      if (key.return) {
        const selected = companyRows[companyPickerIndex];
        if (!selected) {
          setStatusMessage("No company selected.");
          return;
        }
        setFocusCompanyId(selected.id);
        setFocusCompanyDisplay(`${selected.name} (${selected.slug})`);
        setCompanyPickerOpen(false);
        setCompanyQuery("");
        setCompanyPickerIndex(0);
        setStatusMessage(`Focused company ${selected.name} (${selected.slug})`);
        return;
      }
      if (key.backspace || key.delete) {
        setCompanyQuery((current) => current.slice(0, -1));
        return;
      }
      if (isPrintableInput(input, key)) {
        setCompanyQuery((current) => `${current}${input}`);
      }
      return;
    }

    if (isPaletteOpen) {
      if (key.escape) {
        closePalette();
        return;
      }
      if (key.upArrow) {
        setPaletteIndex((current) => clamp(current - 1, 0, Math.max(0, paletteCommands.length - 1)));
        return;
      }
      if (key.downArrow) {
        setPaletteIndex((current) => clamp(current + 1, 0, Math.max(0, paletteCommands.length - 1)));
        return;
      }
      if (key.return) {
        runPaletteSelection();
        return;
      }
      if (key.backspace || key.delete) {
        setPaletteQuery((current) => current.slice(0, -1));
        return;
      }
      if (input === "/") return;
      if (isPrintableInput(input, key)) {
        setPaletteQuery((current) => `${current}${input}`);
      }
      return;
    }

    if (isInputLocked) return;

    if (input === "q") {
      quitShell();
      return;
    }
    if (input === "/" || input === "p") {
      openPalette();
      return;
    }
    if (input === "f") {
      openCompanyPicker();
      return;
    }
    if (input === "r") {
      toggleReadOnly();
      return;
    }

    if (key.leftArrow) {
      setActivePane((current) => PANE_ORDER[clamp(PANE_ORDER.indexOf(current) - 1, 0, PANE_ORDER.length - 1)]);
      return;
    }
    if (key.rightArrow) {
      setActivePane((current) => PANE_ORDER[clamp(PANE_ORDER.indexOf(current) + 1, 0, PANE_ORDER.length - 1)]);
      return;
    }

    if (workspaceMode === "operation") {
      if (key.escape) {
        backToTree();
        return;
      }
      if (activePane === "nav") {
        if (key.upArrow) {
          setDomainCursor((current) => clamp(current - 1, 0, ACTION_TREE.length - 1));
          return;
        }
        if (key.downArrow) {
          setDomainCursor((current) => clamp(current + 1, 0, ACTION_TREE.length - 1));
          return;
        }
      }
      return;
    }

    if (key.escape) {
      if (activePane === "main" && treeLevel === "operation") {
        setTreeLevel("task");
        setStatusMessage("Back to section list.");
        return;
      }
      setActivePane("nav");
      return;
    }

    if (activePane === "nav") {
      if (key.upArrow) {
        setDomainCursor((current) => clamp(current - 1, 0, ACTION_TREE.length - 1));
        return;
      }
      if (key.downArrow) {
        setDomainCursor((current) => clamp(current + 1, 0, ACTION_TREE.length - 1));
        return;
      }
      if (key.return) {
        setActivePane("main");
        setTreeLevel("task");
        setStatusMessage(`Selected ${selectedDomain.label}. Pick a section to continue.`);
      }
      return;
    }

    if (activePane === "main") {
      if (treeLevel === "task") {
        if (key.upArrow) {
          setTaskCursorByDomain((current) => ({
            ...current,
            [selectedDomain.id]: clamp(
              (current[selectedDomain.id] ?? 0) - 1,
              0,
              Math.max(0, selectedDomain.tasks.length - 1),
            ),
          }));
          return;
        }
        if (key.downArrow) {
          setTaskCursorByDomain((current) => ({
            ...current,
            [selectedDomain.id]: clamp(
              (current[selectedDomain.id] ?? 0) + 1,
              0,
              Math.max(0, selectedDomain.tasks.length - 1),
            ),
          }));
          return;
        }
        if (key.return && selectedTask) {
          setTreeLevel("operation");
          setStatusMessage(`Opened ${selectedTask.label}. Pick an action.`);
          return;
        }
      } else {
        if (key.upArrow) {
          if (!selectedTask) return;
          setOperationCursorByTask((current) => ({
            ...current,
            [selectedTask.id]: clamp(
              (current[selectedTask.id] ?? 0) - 1,
              0,
              Math.max(0, selectedTask.operations.length - 1),
            ),
          }));
          return;
        }
        if (key.downArrow) {
          if (!selectedTask) return;
          setOperationCursorByTask((current) => ({
            ...current,
            [selectedTask.id]: clamp(
              (current[selectedTask.id] ?? 0) + 1,
              0,
              Math.max(0, selectedTask.operations.length - 1),
            ),
          }));
          return;
        }
        if (key.return) {
          openSelectedOperation();
        }
      }
    }
  });

  useEffect(() => {
    setTreeLevel("task");
  }, [domainCursor]);

  const activeMount = selectedModule ? moduleMounts?.[selectedModule.id] : undefined;
  const palettePresentation: PaletteCommand[] = paletteCommands.map((command) => ({
    id: command.id,
    title: command.title,
    detail: command.detail,
    shortcut: command.shortcut,
    disabled: command.disabled,
  }));

  const taskItems: TreeMenuItem[] = selectedDomain.tasks.map((task) => ({
    id: task.id,
    label: task.label,
    description: task.description,
  }));
  const operationItems: TreeMenuItem[] = (selectedTask?.operations ?? []).map((operation) => ({
    id: operation.id,
    label: operation.label,
    description: operation.description,
  }));
  const drillItems = treeLevel === "task" ? taskItems : operationItems;
  const drillTitle =
    treeLevel === "task"
      ? `Sections in ${selectedDomain.label}`
      : `Actions in ${selectedTask?.label ?? "selected section"}`;
  const drillEmptyMessage =
    treeLevel === "task" ? "No sections in this domain." : "No actions in this section.";
  const drillCursor = treeLevel === "task" ? taskCursor : operationCursor;

  const domainModules = ACTION_TREE.map(domainAsModule);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexGrow={1}>
        <Box width={36} borderStyle="classic">
          <ModuleNav
            modules={domainModules}
            selectedModuleId={selectedDomain.id}
            cursorIndex={domainCursor}
            activePane={activePane}
          />
        </Box>
        <Box flexGrow={1} borderStyle="classic" marginLeft={1}>
          <Box flexDirection="column" paddingX={1} paddingY={1}>
            <Text bold color={activePane === "main" ? "cyan" : undefined}>
              {mainTitle} {activePane === "main" ? "[FOCUSED]" : "[idle]"}
            </Text>
            <Text dimColor>{mainDescription}</Text>
            <Box marginTop={1} flexDirection="column">
              {workspaceMode === "tree" ? (
                <Box flexDirection="column">
                  <TreeMenu
                    title={drillTitle}
                    items={drillItems}
                    cursorIndex={drillCursor}
                    focused={activePane === "main"}
                    emptyMessage={drillEmptyMessage}
                  />
                  <Box marginTop={1} flexDirection="column">
                    <Text dimColor>
                      Path: {selectedDomain.label}
                      {treeLevel === "operation" ? ` / ${selectedTask?.label ?? "none"}` : ""}
                    </Text>
                    <Text dimColor>
                      Flow: Enter drills down. Esc moves one level up. Enter on action opens wizard.
                    </Text>
                  </Box>
                </Box>
              ) : selectedModule && activeOperation ? (
                <MainContent
                  module={selectedModule}
                  mount={activeMount}
                  focusCompanyId={focusCompanyId}
                  readOnly={readOnly}
                  activePane={activePane}
                  operationId={activeOperation.id}
                  setInputLocked={setInputLocked}
                  onBackToTree={backToTree}
                />
              ) : (
                <Text dimColor>No module available for selected operation.</Text>
              )}
            </Box>
          </Box>
        </Box>
        <Box width={44} borderStyle="classic" marginLeft={1}>
          <InspectorPanel
            actor={actor}
            module={
              workspaceMode === "operation" && selectedModule
                ? selectedModule
                : {
                    id: selectedDomain.id,
                    label: `${selectedDomain.label} > ${selectedTask?.label ?? "none"}`,
                    description: "Tree navigation mode",
                  }
            }
            focusCompanyId={focusCompanyId}
            readOnly={readOnly}
            activePane={activePane}
            paletteOpen={isPaletteOpen || isCompanyPickerOpen}
            statusMessage={statusMessage}
            focusCompanyDisplay={focusCompanyDisplay}
            workspaceMode={workspaceMode}
            treeLevel={treeLevel}
          />
        </Box>
      </Box>
      <CompanyPicker
        isOpen={isCompanyPickerOpen}
        query={companyQuery}
        rows={companyRows}
        selectedIndex={companyPickerIndex}
        loading={companyPickerLoading}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        query={paletteQuery}
        commands={palettePresentation}
        selectedIndex={effectivePaletteIndex}
      />
      <Box marginTop={1}>
        <FooterBar
          actor={actor}
          contextLabel={contextLabel}
          moduleLabel={
            workspaceMode === "operation"
              ? `${activeDomain?.label ?? "Domain"} > ${activeTask?.label ?? "Task"} > ${activeOperation?.label ?? "Operation"}`
              : `${selectedDomain.label} > ${selectedTask?.label ?? "Task"}`
          }
          focusCompanyId={focusCompanyDisplay ?? focusCompanyId}
          readOnly={readOnly}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{statusMessage}</Text>
      </Box>
      <Box marginTop={0}>
        <Text dimColor>
          Next:{" "}
          {workspaceMode === "tree"
            ? treeLevel === "task"
              ? "Choose a section in Main pane and press Enter."
              : "Choose an action and press Enter to open wizard (Esc goes back)."
            : "Complete wizard, or press Esc to return to actions list."}
        </Text>
      </Box>
    </Box>
  );
}
