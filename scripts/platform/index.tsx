#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { render } from 'ink';

import { PlatformApp, type PlatformAppProps } from './app';

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('-')) {
    return null;
  }
  return value;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function isDirectRun() {
  const invokedPath = process.argv[1];
  if (!invokedPath) {
    return false;
  }
  return path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url));
}

export function runPlatformInkShell(overrides: Partial<PlatformAppProps> = {}) {
  const actor = overrides.actor ?? readArg('--actor') ?? process.env.PLATFORM_ACTOR ?? 'operator@local';
  const initialCompanyId = overrides.initialCompanyId ?? readArg('--company');
  const initialReadOnly = overrides.initialReadOnly ?? hasFlag('--read-only');
  const contextLabel = overrides.contextLabel ?? readArg('--context') ?? 'platform';

  return render(
    <PlatformApp
      actor={actor}
      initialCompanyId={initialCompanyId}
      initialReadOnly={initialReadOnly}
      contextLabel={contextLabel}
      modules={overrides.modules}
      moduleMounts={overrides.moduleMounts}
      initialModuleId={overrides.initialModuleId}
      onQuit={overrides.onQuit}
    />,
  );
}

if (isDirectRun()) {
  runPlatformInkShell();
}
