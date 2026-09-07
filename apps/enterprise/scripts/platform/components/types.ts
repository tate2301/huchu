import type { ReactNode } from 'react';

export type PlatformModuleId =
  | 'orgs'
  | 'subscriptions'
  | 'features'
  | 'admins'
  | 'user-management'
  | 'sites'
  | 'support'
  | 'runbooks'
  | 'health'
  | 'contracts'
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
  operationId?: string;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export type ModuleMount = (props: ModuleRenderProps) => ReactNode;

export interface PaletteCommand {
  id: string;
  title: string;
  detail?: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface CompanyPickerItem {
  id: string;
  name: string;
  slug: string;
}
