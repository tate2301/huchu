import { BIN_LIST_RUNS } from "./bin";
import { PRODUCT_LIST_RUNS } from "./products";
import { STOCK_LIST_RUNS } from "./stock";
import type { ListActionRun } from "./runs";

/**
 * Asks: the words of every confirmation (00-foundations 5.8), one file per
 * area. An area adds its file and one export line here.
 */
export { BIN_KEEP_DAYS, binAsk, restorableUntil } from "./frame";
export { binItem, deleteForGoodAsk, restoredToast } from "./bin";
export { cancelRequisitionAsk, closeShortAsk, removeOrderAsk } from "./buying";
export { categoryDeleteAsk, categoryMergeAsk } from "./categories";
export { archiveAsk, archiveManyAsk } from "./products";
export { closeSiteAsk } from "./sites";
export { unpairAsk } from "./tills";
export { cancelTransferAsk, cancelTransfersAsk, reverseMovementsAsk } from "./stock";
export type { ListActionRun } from "./runs";

/** Every list action that posts, by its `run` key; each area adds its own. */
export const LIST_ACTION_RUNS: Readonly<Record<string, ListActionRun>> = { ...PRODUCT_LIST_RUNS, ...STOCK_LIST_RUNS, ...BIN_LIST_RUNS };
