import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, REASON_FIELD, run } from "./words";

const FEATURES: [string, string] = ["feature", "features"];
const BUNDLES: [string, string] = ["bundle", "bundles"];
const VERTICALS: [string, string] = ["vertical", "verticals"];

/**
 * The words around a workspace's Verticals and features page and the
 * Catalogue: what each action asks before it runs, and what it says after.
 */
export const FEATURE_RUNS: Record<string, ListActionRun> = {
  "features-on": run(undefined, "switched on", FEATURES),
  "features-off": run(
    (count, rows) => ({
      title: `Switch off ${named(count, rows, FEATURES)}?`,
      body: `Members stop seeing ${count === 1 ? "its pages" : "their pages"} on their next click. Nothing they recorded is deleted, and switching ${count === 1 ? "it" : "them"} on again brings everything back.`,
      keep: "Keep on",
      go: "Switch off",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "switched off",
    FEATURES,
  ),
  "features-reset": run(
    (count, rows) => ({
      title: `Set ${named(count, rows, FEATURES)} back to what the verticals say?`,
      body: `The switch made by hand goes. Each feature is then on if a vertical or a bundle that is on carries it, and off if a vertical keeps it out. Members may gain or lose pages.`,
      keep: "Keep as it is",
      go: "Set back",
      fill: "action",
    }),
    "set back",
    FEATURES,
  ),
  "bundles-on": run(
    (count, rows) => ({
      title: `Turn on ${named(count, rows, BUNDLES)}?`,
      body: `${count === 1 ? "Its" : "Their"} features are switched on, and so are the bundles ${count === 1 ? "it needs" : "they need"}. It costs nothing more: a workspace pays for its verticals.`,
      keep: "Keep off",
      go: "Turn on",
      fill: "action",
    }),
    "turned on",
    BUNDLES,
  ),
  "bundles-off": run(
    (count, rows) => ({
      title: `Turn off ${named(count, rows, BUNDLES)}?`,
      body: `Features nothing else carries are switched off, and members stop seeing those pages. Records are kept; turning ${count === 1 ? "it" : "them"} on again brings them back.`,
      keep: "Keep on",
      go: "Turn off",
      fill: "bad",
    }),
    "turned off",
    BUNDLES,
  ),
  "verticals-remove": run(
    (count, rows) => ({
      title: `Remove ${named(count, rows, VERTICALS)}?`,
      body: `${count === 1 ? "Its" : "Their"} charge stops from the next bill. Features only ${count === 1 ? "it" : "they"} brought are switched off; ones another vertical carries stay on. Records are kept, and adding ${count === 1 ? "it" : "them"} again turns the features back on.`,
      keep: "Keep",
      go: "Remove",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "removed",
    VERTICALS,
  ),
  "catalogue-features-inactive": run(
    (count, rows) => ({
      title: `Mark ${named(count, rows, FEATURES)} inactive?`,
      body: `${count === 1 ? "It leaves" : "They leave"} every workspace's feature list and ${count === 1 ? "is" : "are"} off wherever nothing switched ${count === 1 ? "it" : "them"} on. Where switched on by hand, ${count === 1 ? "it stays" : "they stay"} on. You can mark ${count === 1 ? "it" : "them"} active again.`,
      keep: "Keep active",
      go: "Mark inactive",
      fill: "bad",
    }),
    "marked inactive",
    FEATURES,
  ),
  "catalogue-features-active": run(undefined, "marked active", FEATURES),
  "catalogue-bundles-retire": run(
    (count, rows) => ({
      title: `Retire ${named(count, rows, BUNDLES)}?`,
      body: `Workspaces that have ${count === 1 ? "it" : "them"} on keep ${count === 1 ? "it" : "them"}. No workspace can turn ${count === 1 ? "it" : "them"} on from now. You can bring ${count === 1 ? "it" : "them"} back.`,
      keep: "Keep in use",
      go: "Retire",
      fill: "bad",
    }),
    "retired",
    BUNDLES,
  ),
  "catalogue-bundles-restore": run(undefined, "brought back", BUNDLES),
};
