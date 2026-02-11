import type { ReactNode } from "react";

import { PrimaryActionBar } from "@/components/shared/primary-action-bar";

type DataTableFloatingActionsProps = {
  children: ReactNode;
  hint?: string;
  className?: string;
};

export function DataTableFloatingActions(props: DataTableFloatingActionsProps) {
  return <PrimaryActionBar {...props} />;
}
