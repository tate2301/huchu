/**
 * Record kinds (00-foundations 5.6.7), one file per area. An area adds its
 * file and one export line here.
 */
export type * from "./types";
export { bundleKind } from "./bundles";
export { customerKind } from "./customers";
export { promotionKind } from "./promotions";
export { orderKind, supplierKind } from "./buying";
export { saleKind, shiftKind } from "./floor";
export { productKind } from "./products";
export { requisitionKind } from "./requisitions";
export { countKind, transferKind } from "./stock";
export { voucherKind } from "./vouchers";
