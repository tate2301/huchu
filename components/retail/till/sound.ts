/**
 * What the till sounds like: a tick when a product lands on the sale, two low
 * blips for a code it does not know, two rising notes when the money is in.
 * Made by the browser (Web Audio), so there are no sound files to load. A
 * touch till also buzzes. One switch per device, in Till settings; on unless
 * it is turned off.
 */

export type Cue = "added" | "unknown" | "paid";

const NOTES: Record<Cue, Array<[hz: number, seconds: number]>> = {
  added: [[1760, 0.03]],
  unknown: [
    [233, 0.07],
    [196, 0.09],
  ],
  paid: [
    [660, 0.08],
    [990, 0.16],
  ],
};
const BUZZ: Record<Cue, number | number[]> = { added: 10, unknown: [30, 40, 30], paid: 20 };

const SOUNDS_KEY = "till:sounds";

export function soundsOn(): boolean {
  try {
    return window.localStorage.getItem(SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

const CHANGED = "till:sounds-changed";

export function setSoundsOn(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(SOUNDS_KEY);
    else window.localStorage.setItem(SOUNDS_KEY, "off");
  } catch {
    // Storage blocked: the switch goes back to on with the next reload.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** For `useSyncExternalStore`: the switch, as this tab and any other on the device change it. */
export function onSoundsChange(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
}

let audio: AudioContext | null = null;

export function cue(kind: Cue) {
  if (typeof window === "undefined" || !soundsOn()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    let at = audio.currentTime;
    for (const [hz, seconds] of NOTES[kind]) {
      const tone = audio.createOscillator();
      const level = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = hz;
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(0.16, at + 0.005);
      level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      tone.connect(level).connect(audio.destination);
      tone.start(at);
      tone.stop(at + seconds + 0.02);
      at += seconds + 0.03;
    }
  } catch {
    // No audio on this device: the screen still says it.
  }
  if (window.matchMedia("(pointer: coarse)").matches) navigator.vibrate?.(BUZZ[kind]);
}
