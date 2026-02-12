import type { PlatformServices } from "../types";

export interface ModuleProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId?: string;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}
