"use client";

import * as React from "react";

import { Segmented } from "@/components/workspace/segmented";
import { Teams } from "@/components/teams/teams-root";

import { K1 } from "./k1";
import { K2 } from "./k2";
import { K3 } from "./k3";
import { K3b } from "./k3b";
import { K4 } from "./k4";
import { K4b } from "./k4b";
import { K5 } from "./k5";
import { K6 } from "./k6";
import { K7 } from "./k7";

import "./teams-sheet.css";

const BOARDS = ["K1", "K2", "K3", "K3b", "K4", "K4b", "K5", "K6", "K7"] as const;

type ThemeChoice = "corelith" | "tender" | "corelith-dark";

/** Every part of the Teams kit with its states: the boards K1 to K9 (design/teams/boards). */
export function TeamsSheet() {
  const [theme, setTheme] = React.useState<ThemeChoice | null>(null);
  React.useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const before = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (before) root.dataset.theme = before;
    };
  }, [theme]);

  return (
    <Teams>
      <div className="tk" id="teams-kit">
        <div className="tk-nav">
          <span className="tk-label">Teams</span>
          {BOARDS.map((id) => (
            <a key={id} href={`#${id.toLowerCase()}`}>
              {id}
            </a>
          ))}
          <span className="spacer" />
          <Segmented
            aria-label="Theme"
            value={theme}
            onValueChange={setTheme}
            items={[
              { value: "corelith", label: "Corelith" },
              { value: "tender", label: "Tender" },
              { value: "corelith-dark", label: "Dark" },
            ]}
          />
        </div>
        <K1 />
        <K2 />
        <K3 />
        <K3b />
        <K4 />
        <K4b />
        <K5 />
        <K6 />
        <K7 />
      </div>
    </Teams>
  );
}
