"use client";

/**
 * Tiny synthesized sound effects (Web Audio) — no audio files to download.
 * Browsers only allow audio after a user gesture, so the context is created
 * lazily on the first play (which always follows a tap or key press).
 */

const MUTE_KEY = "quiz:muted";

export type Sound = "correct" | "partial" | "wrong" | "tap" | "fanfare";

type Note = { freq: number; at: number; duration: number; type?: OscillatorType; gain?: number };

const NOTES: Record<Sound, Note[]> = {
  tap: [{ freq: 660, at: 0, duration: 0.05, type: "triangle", gain: 0.08 }],
  correct: [
    { freq: 660, at: 0, duration: 0.1, type: "triangle" },
    { freq: 990, at: 0.09, duration: 0.18, type: "triangle" },
  ],
  partial: [
    { freq: 520, at: 0, duration: 0.12, type: "triangle" },
    { freq: 620, at: 0.1, duration: 0.14, type: "triangle" },
  ],
  wrong: [
    { freq: 220, at: 0, duration: 0.14, type: "sawtooth", gain: 0.06 },
    { freq: 165, at: 0.12, duration: 0.22, type: "sawtooth", gain: 0.06 },
  ],
  fanfare: [
    { freq: 523, at: 0, duration: 0.12, type: "triangle" },
    { freq: 659, at: 0.12, duration: 0.12, type: "triangle" },
    { freq: 784, at: 0.24, duration: 0.12, type: "triangle" },
    { freq: 1047, at: 0.36, duration: 0.35, type: "triangle" },
  ],
};

let context: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage blocked (private mode, sandboxed iframe): mute just won't persist.
  }
}

export function playSound(sound: Sound): void {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    for (const note of NOTES[sound]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.freq;
      const peak = note.gain ?? 0.1;
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(peak, start + note.at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.duration);
      osc.connect(gain).connect(context.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.duration + 0.02);
    }
  } catch {
    // No audio support — silently skip.
  }
}
