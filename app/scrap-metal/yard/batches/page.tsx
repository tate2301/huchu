import { redirect } from "next/navigation";

export default function LegacyScrapYardBatchesRedirectPage() {
  redirect("/scrap-metal/batches");
}
