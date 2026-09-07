/** Reserve the next document or record number for an entity, from the kernel's id service. */
import { fetchJson } from "../api-client";

export type ReserveIdEntity =
  | "SITE"
  | "DEPARTMENT"
  | "JOB_GRADE"
  | "DOWNTIME_CODE"
  | "EQUIPMENT"
  | "CHART_OF_ACCOUNT"
  | "COST_CENTER"
  | "TAX_CODE"
  | "INVENTORY_ITEM"
  | "STOCK_LOCATION"
  | "STOCK_MOVEMENT"
  | "GOLD_POUR"
  | "GOLD_RECEIPT"
  | "GOLD_PURCHASE"
  | "RETAIL_REGISTER"
  | "RETAIL_PURCHASE_ORDER"
  | "RETAIL_GOODS_RECEIPT"
  | "RETAIL_SHIFT"
  | "RETAIL_HELD_CART"
  | "RETAIL_SALE"
  | "RETAIL_PROMOTION";

export async function reserveEntityId(
  entity: ReserveIdEntity,
  options: { siteId?: string } = {},
) {
  return fetchJson<{ entity: ReserveIdEntity; code: string; prefix: string }>(
    "/api/ids/reserve",
    {
      method: "POST",
      body: JSON.stringify({
        entity,
        siteId: options.siteId,
      }),
    },
  );
}
