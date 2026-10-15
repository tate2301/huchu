import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { libraryItemsByIds } from "@/lib/library/bulk";
import { duplicateLibraryItem } from "@/lib/library/store";

/** Library › Make copies: a draft copy of each, with its own address. */
export const POST = bulkRoute("library.manage", (operator, { ids }) =>
  eachOf(ids, libraryItemsByIds, (item) => duplicateLibraryItem(operator, item.id), "library item"),
);
