import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";
import { DEAL_BULK } from "@/lib/crm/registers/server/record-bulk";

export const POST = recordBulkHandler(DEAL_BULK);
