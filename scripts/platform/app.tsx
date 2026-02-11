import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

import { CommandPalette } from './components/command-palette';
import { FooterBar } from './components/footer-bar';
import { InspectorPanel } from './components/inspector-panel';
import { MainContent } from './components/main-content';
import { ModuleNav } from './components/module-nav';
import type {
  AppPane,
  ModuleMount,
  PaletteCommand,
  PlatformModuleDefinition,
  PlatformModuleId,
} from './components/types';

const DEFAULT_MODULES: PlatformModuleDefinition[] = [
  {
    id: 'orgs',
    label: 'Organizations',
    description: 'Provisioning and tenant state controls.',
    shortcut: 'g',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    description: 'Billing plan and status management.',
  },
  {
    id: 'features',
    label: 'Features',
    description: 'Platform feature flag operations.',
  },
  {
    id: 'admins',
    label: 'Admins',
    description: 'Admin lifecycle and role controls.',
  },
  {
    id: 'audit',
    label: 'Audit',
    description: 'Operational trail and notes.',
  },
];

const PANE_ORDER: AppPane[] = ['nav', 'main', 'inspector'];
const PANE_LABEL: Record<AppPane, string> = {
  nav: 'Module Nav',
  main: 'Main Workspace',
  inspector: 'Inspector',
};

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
  onQuit?: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeModules(modules?: PlatformModuleDefinition[]) {
  if (modules && modules.length > 0) {
    return modules;
  }
  return DEFAULT_MODULES;
}

function isPrintableInput(input: string, key: { ctrl: boolean; meta: boolean }) {
  return !key.ctrl && !key.meta && input.length === 1 && input >= ' ';
}

export function PlatformApp({
  actor,
  contextLabel = 'platform',
  modules,
  moduleMounts,
  initialModuleId,
  initialCompanyId = null,
  initialReadOnly = false,
  onQuit,
}: PlatformAppProps) {
  const { exit } = useApp();
  const activeModules = useMemo(() => normalizeModules(modules), [modules]);
  const moduleById = useMemo(() => {
    return new Map<PlatformModuleId, { module: PlatformModuleDefinition; index: number }>(
      activeModules.map((module, index) => [module.id, { module, index }]),
    );
  }, [activeModules]);

  const fallbackModuleId = activeModules[0].id;
  const initialSelection = initialModuleId && moduleById.has(initialModuleId) ? initialModuleId : fallbackModuleId;

  const [selectedModuleId, setSelectedModuleId] = useState<PlatformModuleId>(initialSelection);
  const [cursorIndex, setCursorIndex] = useState<number>(moduleById.get(initialSelection)?.index ?? 0);
  const [activePane, setActivePane] = useState<AppPane>('nav');
  const [focusCompanyId, setFocusCompanyId] = useState<string | null>(initialCompanyId);
  const [readOnly, setReadOnly] = useState<boolean>(initialReadOnly);
  const [statusMessage, setStatusMessage] = useState<string>('Ready. Press / to open the command palette.');
  const [isPaletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [paletteQuery, setPaletteQuery] = useState<string>('');
  const [paletteIndex, setPaletteIndex] = useState<number>(0);

  const maxCursorIndex = Math.max(0, activeModules.length - 1);
  const effectiveCursorIndex = clamp(cursorIndex, 0, maxCursorIndex);
  const selectedModule = moduleById.get(selectedModuleId)?.module ?? activeModules[effectiveCursorIndex] ?? activeModules[0];

  const quitShell = useCallback(() => {
    onQuit?.();
    exit();
  }, [exit, onQuit]);

  const selectModuleByIndex = useCallback(
    (index: number) => {
      const nextIndex = clamp(index, 0, activeModules.length - 1);
      const nextModule = activeModules[nextIndex];
      setCursorIndex(nextIndex);
      setSelectedModuleId(nextModule.id);
      setStatusMessage(`Selected ${nextModule.label}`);
    },
    [activeModules],
  );

  const selectModuleById = useCallback(
    (moduleId: PlatformModuleId) => {
      const lookup = moduleById.get(moduleId);
      if (!lookup) {
        return;
      }
      setSelectedModuleId(lookup.module.id);
      setCursorIndex(lookup.index);
      setStatusMessage(`Selected ${lookup.module.label}`);
    },
    [moduleById],
  );

  const movePane = useCallback((direction: -1 | 1) => {
    setActivePane((current) => {
      const currentIndex = PANE_ORDER.indexOf(current);
      const nextIndex = clamp(currentIndex + direction, 0, PANE_ORDER.length - 1);
      const nextPane = PANE_ORDER[nextIndex];
      if (nextPane !== current) {
        setStatusMessage(`Focus moved to ${PANE_LABEL[nextPane]}`);
      }
      return nextPane;
    });
  }, []);

  const toggleReadOnly = useCallback(() => {
    setReadOnly((current) => {
      const next = !current;
      setStatusMessage(next ? 'Switched to read-only mode' : 'Switched to read-write mode');
      return next;
    });
  }, []);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    setPaletteQuery('');
    setPaletteIndex(0);
    setStatusMessage('Command palette opened. Type to filter commands.');
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery('');
    setPaletteIndex(0);
    setStatusMessage('Command palette closed.');
  }, []);

  const normalizedQuery = paletteQuery.trim().toLowerCase();

  const paletteCommands = useMemo<ResolvedPaletteCommand[]>(() => {
    const commands: ResolvedPaletteCommand[] = activeModules.map((module) => ({
      id: `module:${module.id}`,
      title: `Go to ${module.label}`,
      detail: module.description,
      shortcut: module.shortcut,
      run: () => selectModuleById(module.id),
    }));

    commands.push({
      id: 'toggle:read-only',
      title: readOnly ? 'Switch to read-write mode' : 'Switch to read-only mode',
      detail: 'Toggle mutation lock',
      shortcut: 'r',
      run: toggleReadOnly,
    });

    commands.push({
      id: 'clear:company',
      title: 'Clear focused company',
      detail: 'Reset organization context',
      disabled: focusCompanyId === null,
      run: () => {
        setFocusCompanyId(null);
        setStatusMessage('Cleared focused company');
      },
    });

    if (normalizedQuery.length > 0) {
      const raw = paletteQuery.trim();
      commands.push({
        id: 'set:company',
        title: `Focus company "${raw}"`,
        detail: 'Use query as company slug or id',
        run: () => {
          setFocusCompanyId(raw);
          setStatusMessage(`Focused company ${raw}`);
        },
      });
    }

    commands.push({
      id: 'app:quit',
      title: 'Quit shell',
      shortcut: 'q',
      run: quitShell,
    });

    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = `${command.title} ${command.detail ?? ''} ${command.shortcut ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [
    activeModules,
    focusCompanyId,
    normalizedQuery,
    paletteQuery,
    quitShell,
    readOnly,
    selectModuleById,
    toggleReadOnly,
  ]);

  const maxPaletteIndex = Math.max(0, paletteCommands.length - 1);
  const effectivePaletteIndex = clamp(paletteIndex, 0, maxPaletteIndex);

  const runPaletteSelection = useCallback(() => {
    const command = paletteCommands[effectivePaletteIndex];
    if (!command) {
      setStatusMessage('No command is selected.');
      return;
    }
    if (command.disabled) {
      setStatusMessage('Selected command is currently unavailable.');
      return;
    }
    command.run();
    setPaletteOpen(false);
    setPaletteQuery('');
    setPaletteIndex(0);
  }, [effectivePaletteIndex, paletteCommands]);

  useInput((input, key) => {
    if ((key.ctrl && input === 'c') || input === 'q') {
      quitShell();
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
      if (input === '/') {
        return;
      }
      if (isPrintableInput(input, key)) {
        setPaletteQuery((current) => `${current}${input}`);
        return;
      }
      return;
    }

    if (input === '/' || input === 'p') {
      openPalette();
      return;
    }

    if (input === 'g') {
      selectModuleById('orgs');
      return;
    }

    if (input === 'r') {
      toggleReadOnly();
      return;
    }

    if (key.escape) {
      setActivePane('nav');
      setStatusMessage('Focus moved to Module Nav.');
      return;
    }

    if (key.leftArrow) {
      movePane(-1);
      return;
    }

    if (key.rightArrow) {
      movePane(1);
      return;
    }

    if (key.upArrow) {
      selectModuleByIndex(effectiveCursorIndex - 1);
      return;
    }

    if (key.downArrow) {
      selectModuleByIndex(effectiveCursorIndex + 1);
      return;
    }

    if (key.return) {
      selectModuleByIndex(effectiveCursorIndex);
    }
  });

  const palettePresentation: PaletteCommand[] = paletteCommands.map((command) => ({
    id: command.id,
    title: command.title,
    detail: command.detail,
    shortcut: command.shortcut,
    disabled: command.disabled,
  }));

  const activeMount = moduleMounts?.[selectedModule.id];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexGrow={1}>
        <Box width={32} borderStyle="classic">
          <ModuleNav
            modules={activeModules}
            selectedModuleId={selectedModule.id}
            cursorIndex={effectiveCursorIndex}
            activePane={activePane}
          />
        </Box>
        <Box flexGrow={1} borderStyle="classic" marginLeft={1}>
          <MainContent
            module={selectedModule}
            mount={activeMount}
            focusCompanyId={focusCompanyId}
            readOnly={readOnly}
            activePane={activePane}
          />
        </Box>
        <Box width={44} borderStyle="classic" marginLeft={1}>
          <InspectorPanel
            actor={actor}
            module={selectedModule}
            focusCompanyId={focusCompanyId}
            readOnly={readOnly}
            activePane={activePane}
            paletteOpen={isPaletteOpen}
            statusMessage={statusMessage}
          />
        </Box>
      </Box>
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
          moduleLabel={selectedModule.label}
          focusCompanyId={focusCompanyId}
          readOnly={readOnly}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{statusMessage}</Text>
      </Box>
    </Box>
  );
}
