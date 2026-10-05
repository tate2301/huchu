import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Categories (20-products 4.1, 5.25; W-19): the shop's own categories, each
 * with its products, its VAT and age check, the margin it aims for and the
 * margin its last 30 days of sales made. A row opens the category's sheet;
 * there is no category record.
 */

const categories: ListSpec = {
  noun: "categories",
  read: [["retail.categories", "view"]],
  search: { placeholder: "Name", keys: ["name"] },
  filters: [
    {
      // "own" is the company's business type, "other" the other one; a hand-added
      // category matches either. Labels come from the loader.
      key: "shopType",
      label: "Shop type",
      type: "choice",
      any: "Any",
      optionsFromLoader: true,
      default: "own",
      primary: true,
    },
    {
      key: "vat",
      label: "VAT",
      type: "choice",
      any: "Any",
      options: [
        { value: "standard", label: "15% included", where: [{ column: "vat", op: "is", value: ["15% included"] }] },
        { value: "zero-rated", label: "Zero-rated", where: [{ column: "vat", op: "is", value: ["Zero-rated"] }] },
        { value: "exempt", label: "Exempt", where: [{ column: "vat", op: "is", value: ["Exempt"] }] },
      ],
    },
    {
      key: "ageCheck",
      label: "Age check",
      type: "choice",
      any: "Any",
      options: [
        { value: "yes", label: "Yes", where: [{ column: "ageCheck", op: "is", value: ["Yes"] }] },
        { value: "no", label: "No", where: [{ column: "ageCheck", op: "is", value: ["No"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "most-sold",
      label: "Most sold",
      rules: [
        { column: "sold30", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "margin",
      label: "Margin now, lowest first",
      rules: [
        { column: "marginNow", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["parent"],
  columns: [
    {
      key: "name",
      label: "Category",
      kind: "text",
      cell: "link",
      sortable: true,
      width: "minmax(170px,1.3fr)",
      align: "start",
      priority: 1,
    },
    { key: "products", label: "Products", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "vat", label: "VAT", kind: "text", cell: "muted", width: "110px", align: "start", priority: 2 },
    {
      key: "ageCheck",
      label: "Age check",
      kind: "status",
      cell: "state",
      tones: { Yes: "gold", No: "hollow" },
      width: "110px",
      align: "start",
      priority: 2,
    },
    { key: "targetMargin", label: "Target margin", kind: "text", cell: "mono", width: "120px", align: "end", priority: 3 },
    {
      key: "marginNow",
      label: "Margin now",
      kind: "number",
      cell: "num",
      percent: true,
      pillKey: "marginTone",
      total: "avg",
      ratio: { num: "profit30", den: "sold30" },
      sortable: true,
      width: "120px",
      align: "end",
      priority: 1,
    },
    {
      key: "sold30",
      label: "Sold, 30 days",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      sortable: true,
      width: "130px",
      align: "end",
      priority: 1,
    },
    // Group "Inside": the category a child sits in; top-level ones group as "None".
    { key: "parent", label: "Inside", kind: "text", cell: "muted", hidden: true, width: "130px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/products/categories?sheet=category-edit&id={id}",
  rowMenu: [
    { key: "edit", label: "Change it", requires: [["retail.categories", "update"]], do: { sheet: "category-edit" } },
    {
      key: "delete",
      label: "Delete category",
      tone: "bad",
      requires: [["retail.categories", "delete"]],
      do: { sheet: "category-delete" },
    },
  ],
  bulk: [
    { key: "vat", label: "Change VAT", requires: [["retail.categories", "update"]], do: { sheet: "category-vat" } },
    {
      key: "margin",
      label: "Set target margin",
      requires: [["retail.categories", "update"]],
      do: { sheet: "category-margin" },
    },
    { key: "merge", label: "Merge", requires: [["retail.categories", "delete"]], do: { sheet: "category-merge" } },
    { key: "export" },
  ],
  primary: { label: "New category", icon: "plus", requires: [["retail.categories", "create"]], sheet: "category-new" },
  card: { title: "name", figure: "sold30", meta: "{cardMeta}" },
  empty: {
    icon: "Folder",
    title: "No categories yet",
    line: "Categories set VAT, the 18+ check and the margin you aim for. A liquor store starts with seven.",
    primary: { label: "New category", sheet: "category-new", requires: [["retail.categories", "create"]] },
  },
  catalog: false,
};

const categoriesSource: ReportDefinition = {
  key: "retail-categories",
  title: "Categories",
  area: "Products",
  href: "/retail/products/categories",
  profiles: ["RETAIL"],
  params: [],
  columns: categories.columns,
  defaults: { sort: categories.sorts[0]!.rules },
  list: categories,
};

export const CATEGORY_REPORTS: ReportDefinition[] = [categoriesSource];
