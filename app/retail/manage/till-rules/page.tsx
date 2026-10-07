import { SettingsFrame } from "@/components/settings-frame/settings-frame";

/**
 * Setup › Till rules (W-64, board TillRules): when a refund, a void, a
 * discount or the drawer needs a manager's PIN, the reasons a cashier picks
 * from, how a sale is paid, the cash-drop prompt and how long a till sells
 * offline, on the SettingsFrame. Owners and managers change it; the server
 * enforces it on every sale, refund, void and drawer opening.
 */
export default function TillRulesSettingsPage() {
  return <SettingsFrame page="till-rules" />;
}
