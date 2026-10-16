import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { libraryItemsByIds } from "@/lib/library/bulk";
import { unpublishLibraryItem } from "@/lib/library/store";

/** Library › Back to draft. */
export const POST = bulkRoute("library.manage", (operator, { ids }) =>
  eachOf(ids, libraryItemsByIds, (item) => unpublishLibraryItem(operator, item), "library item"),
);
