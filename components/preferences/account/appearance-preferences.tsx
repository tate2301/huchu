"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import { FormField, FormPage } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import {
  type AppearancePreference,
  useAppearance,
} from "@/components/providers/appearance-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { Warning } from "@/lib/icons";
import {
  fetchAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferences as AppearancePreferencesResponse,
} from "@/lib/preferences/api";
import {
  DISPLAY_PREFERENCE_DEFAULTS,
  normalizeDisplayPreference,
  type DisplayDensity,
  type DisplayOpenOn,
  type DisplayPreference,
} from "@/lib/preferences/display";

import styles from "./account.module.css";

const themes: Array<{ value: AppearancePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * The two selects, in the board's own order and wording.
 *
 * The values are `lib/preferences/display.ts`'s unions rather than strings
 * spelled again here: the route validates against the same two arrays, so a
 * fourth landing page is one edit in one file and a type error in this one if
 * it is missed.
 */
const densities: Array<{ value: DisplayDensity; label: string }> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const openOnOptions: Array<{ value: DisplayOpenOn; label: string }> = [
  { value: "last-page", label: "Last page" },
  { value: "dashboard", label: "Dashboard" },
  { value: "shift-report", label: "Shift report" },
];

function createDraft(
  preference: AppearancePreferencesResponse | undefined,
): DisplayPreference {
  return preference
    ? normalizeDisplayPreference(preference)
    : { ...DISPLAY_PREFERENCE_DEFAULTS };
}

/**
 * Appearance — `Appearance.dc.html`.
 *
 * Two halves that save differently, which is the board's own arrangement:
 *
 *   - **Theme.** Three cards, each a drawing of the window it produces, the
 *     current one outlined. It applies as it is picked and there is nothing to
 *     submit — light/dark/system has to be on the document before first paint
 *     or the page flashes the wrong one, so `AppearanceProvider` keeps it in
 *     `localStorage` and reads it synchronously. That is also why the theme is
 *     deliberately not in `UserDisplayPreference`: a fetch cannot be awaited in
 *     that position.
 *   - **Display.** Density, Open on and Reduce motion are a row on the user,
 *     read and written through `/api/preferences/appearance`, so they edit a
 *     draft and the board's Save/Cancel footer writes it. The board draws that
 *     footer under Display for exactly this reason.
 *
 * `FormPage` draws a footer only when it is given an `onSubmit`, so the page
 * grew one the moment it had something to submit.
 */
export function AppearancePreferences() {
  const { appearance, setAppearance } = useAppearance();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const displayQuery = useQuery({
    queryKey: ["preferences", "appearance"],
    queryFn: fetchAppearancePreferences,
  });

  const [draft, setDraft] = React.useState<DisplayPreference>(() =>
    createDraft(undefined),
  );

  React.useEffect(() => {
    if (displayQuery.data) {
      setDraft(createDraft(displayQuery.data));
    }
  }, [displayQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateAppearancePreferences,
    onSuccess: (next) => {
      queryClient.setQueryData(["preferences", "appearance"], next);
      toast({
        title: "Display updated",
        description: "Your display settings were saved.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update display settings",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const themeCards = (
    /*
      The three cards are one choice, so they are announced as one group.
      Without it each button reads as a bare "Light" / "Dark" / "System" with
      nothing saying what is being chosen — the board's visual grouping carries
      that for a sighted reader and nothing carried it otherwise.
    */
    <div className={styles.themes} role="group" aria-label="Theme">
      {themes.map((theme) => {
        const selected = theme.value === appearance;
        return (
          <button
            key={theme.value}
            type="button"
            aria-current={selected ? "true" : undefined}
            className={styles.themeCard}
            onClick={() => setAppearance(theme.value)}
          >
            <span
              className={styles.themePreview}
              data-theme={theme.value}
              aria-hidden="true"
            >
              {theme.value === "system" ? null : <span className={styles.themeSidebar} />}
            </span>
            <span className={styles.themeLabel}>{theme.label}</span>
          </button>
        );
      })}
    </div>
  );

  // The theme is local and always ready, so the cards draw while the row is in
  // flight or after it failed; only the Display section waits on the query.
  if (displayQuery.isLoading) {
    return (
      <PreferencesShell>
        <FormPage title="Appearance" className={styles.page}>
          {themeCards}
          <h3 className={styles.heading}>Display</h3>
          <div
            className={styles.skeleton}
            role="status"
            aria-label="Loading your display settings"
          >
            {[120, 260, 100, 260, 180].map((width, index) => (
              <span
                key={index}
                className={styles.skeletonBar}
                style={{ width: `${width}px` }}
              />
            ))}
          </div>
        </FormPage>
      </PreferencesShell>
    );
  }

  if (displayQuery.error || !displayQuery.data) {
    return (
      <PreferencesShell>
        <FormPage title="Appearance" className={styles.page}>
          {themeCards}
          <h3 className={styles.heading}>Display</h3>
          <p className={styles.failure}>
            <Warning />
            {getApiErrorMessage(displayQuery.error)}
          </p>
        </FormPage>
      </PreferencesShell>
    );
  }

  const saved = createDraft(displayQuery.data);

  return (
    <PreferencesShell>
      <FormPage
        title="Appearance"
        className={styles.page}
        busy={updateMutation.isPending}
        onCancel={() => setDraft(saved)}
        onSubmit={(event) => {
          event.preventDefault();
          updateMutation.mutate(draft);
        }}
      >
        {themeCards}

        <h3 className={styles.heading}>Display</h3>

        <FormField label="Density">
          {(id) => (
            <Select
              value={draft.density}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, density: value as DisplayDensity }))
              }
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {densities.map((density) => (
                  <SelectItem key={density.value} value={density.value}>
                    {density.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="Open on">
          {(id) => (
            <Select
              value={draft.openOn}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, openOn: value as DisplayOpenOn }))
              }
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {openOnOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className={styles.row}>
          {/*
            A real `<label>`, not a span with `aria-label` on the switch. The
            board draws the name as static text because a board is a drawing;
            here the name is the control's only visible label, so it has to be
            tied to it — that is what makes the whole row name clickable and
            what lets a screen reader read the switch by the name beside it.
            `cursor-pointer` is a Tailwind utility, which outranks the module's
            `@layer components`.
          */}
          <label
            htmlFor="appearance-reduce-motion"
            className={`${styles.rowName} cursor-pointer`}
          >
            Reduce motion
          </label>
          <Switch
            id="appearance-reduce-motion"
            checked={draft.reduceMotion}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                reduceMotion: event.target.checked,
              }))
            }
          />
        </div>
      </FormPage>
    </PreferencesShell>
  );
}
