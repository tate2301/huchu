export type OperationManifest = Record<string, string[]>;

export type CompanyWorkspace = {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
};

export type AdminMetricCard = {
  id: string;
  label: string;
  value: number;
  hint?: string;
};
