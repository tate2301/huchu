import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { libraryItemsByIds } from "@/lib/library/bulk";
import { deleteLibraryItem } from "@/lib/library/store";

/** Library › Delete: drafts and retired items only. */
export const POST = bulkRoute("library.manage", (operator, { ids }) =>
  eachOf(ids, libraryItemsByIds, (item) => deleteLibraryItem(operator, item), "library item"),
);
