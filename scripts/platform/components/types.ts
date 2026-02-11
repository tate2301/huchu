import type { ReactNode } from 'react';

export type PlatformModuleId =
  | 'orgs'
  | 'subscriptions'
  | 'features'
  | 'admins'
  | 'audit'
  | (string & {});

export interface PlatformModuleDefinition {
  id: PlatformModuleId;
  label: string;
  description: string;
  shortcut?: string;
}

export type AppPane = 'nav' | 'main' | 'inspector';

export interface ModuleRenderProps {
  module: PlatformModuleDefinition;
  focusCompanyId: string | null;
  readOnly: boolean;
  activePane: AppPane;
}

export type ModuleMount = (props: ModuleRenderProps) => ReactNode;

export interface PaletteCommand {
  id: string;
  title: string;
  detail?: string;
  shortcut?: string;
  disabled?: boolean;
}
