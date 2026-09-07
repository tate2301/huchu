export type SavedResultMetadata = {
  createdId: string;
  source: string;
  createdAt?: string;
};

export type FormErrorSummaryItem = {
  field?: string;
  message: string;
};

export type FormSectionSchema = {
  id: string;
  title: string;
  description?: string;
};

export type DataListState = "loading" | "empty" | "error" | "ready";
