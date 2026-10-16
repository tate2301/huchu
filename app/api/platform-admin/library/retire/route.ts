import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { libraryItemsByIds } from "@/lib/library/bulk";
import { retireLibraryItem } from "@/lib/library/store";

/** Library › Retire. */
export const POST = bulkRoute("library.manage", (operator, { ids }) =>
  eachOf(ids, libraryItemsByIds, (item) => retireLibraryItem(operator, item), "library item"),
);
