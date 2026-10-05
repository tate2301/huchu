import { SettingsFrame } from "@/components/settings-frame/settings-frame";

/**
 * Setup › Payments (W-05, board PaymentsSettings): the tenders the shop
 * takes, today's ZiG rate and how ZiG change rounds, and its EcoCash
 * merchant, on the SettingsFrame. The owner changes it; the manager changes
 * the rate only; the bookkeeper reads it.
 */
export default function PaymentsSettingsPage() {
  return <SettingsFrame page="payments" />;
}
