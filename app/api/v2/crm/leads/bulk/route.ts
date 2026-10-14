import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";
import { LEAD_BULK } from "@/lib/crm/registers/server/record-bulk";

export const POST = recordBulkHandler(LEAD_BULK);
