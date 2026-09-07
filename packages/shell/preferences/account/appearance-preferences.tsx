"use client";

import { Card, SegmentedControl } from "@corelithzw/react";

import {
  type AppearancePreference,
  useAppearance,
} from "../../providers/appearance-provider";

const appearanceOptions: Array<{
  value: AppearancePreference;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearancePreferences() {
  const { appearance, setAppearance } = useAppearance();

  return (
    <Card title="Theme preference">
      <div className="settings-section">
        <div className="settings-row">
          <div>
            <div className="t-label-sm">Appearance</div>
            <p className="t-caption t-muted">
              System follows this device. Light and dark override it for this browser.
            </p>
          </div>
          <SegmentedControl
            aria-label="Appearance preference"
            value={appearance}
            options={appearanceOptions}
            onValueChange={(next) => setAppearance(next as AppearancePreference)}
          />
        </div>
      </div>
    </Card>
  );
}
