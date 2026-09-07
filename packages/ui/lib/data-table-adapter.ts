export type LegacyListResponse<TData> = {
  data: TData[];
};

export type PaginatedListResponse<TData> = {
  data: TData[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TableFetchMode = "all" | "paginated";

export type DataTableQueryState = {
  mode: TableFetchMode;
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export type DataTableSource<TData> = {
  rows: TData[];
  mode: TableFetchMode;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  supportsServerPagination: boolean;
};

export type ListResponse<TData> = LegacyListResponse<TData> | PaginatedListResponse<TData>;

function hasPageMetadata<TData>(
  response: ListResponse<TData>,
): response is PaginatedListResponse<TData> {
  return (
    typeof (response as Partial<PaginatedListResponse<TData>>).page === "number" &&
    typeof (response as Partial<PaginatedListResponse<TData>>).pageSize === "number" &&
    typeof (response as Partial<PaginatedListResponse<TData>>).total === "number" &&
    typeof (response as Partial<PaginatedListResponse<TData>>).totalPages === "number"
  );
}

export function adaptDataTableResponse<TData>(
  response: ListResponse<TData>,
  queryState: DataTableQueryState,
): DataTableSource<TData> {
  if (hasPageMetadata(response)) {
    return {
      rows: response.data,
      mode: queryState.mode,
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalPages: response.totalPages,
      supportsServerPagination: true,
    };
  }

  const total = response.data.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / Math.max(queryState.pageSize, 1)));

  return {
    rows: response.data,
    mode: queryState.mode,
    page: queryState.page,
    pageSize: queryState.pageSize,
    total,
    totalPages,
    supportsServerPagination: false,
  };
}

export function buildDataTableSearchParams(queryState: DataTableQueryState) {
  const params = new URLSearchParams();

  params.set("mode", queryState.mode);

  if (queryState.mode === "paginated") {
    params.set("page", String(queryState.page));
    params.set("pageSize", String(queryState.pageSize));
  }

  if (queryState.search) {
    params.set("search", queryState.search);
  }

  if (queryState.sort) {
    params.set("sort", queryState.sort);
  }

  if (queryState.order) {
    params.set("order", queryState.order);
  }

  return params;
}
