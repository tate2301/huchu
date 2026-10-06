import { PriceCheckScreen } from "@/components/retail/till/lookups";

/** Works before pairing (W-04 step 5), so it alone skips the till check. */
export default function TillPriceCheckPage() {
  return <PriceCheckScreen />;
}
