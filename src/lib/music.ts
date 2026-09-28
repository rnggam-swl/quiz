"use client";

import { isMuted } from "./sound";

/**
 * Lobby music (P5-10): a soft synthesized arpeggio loop, no audio files. Starts only
 * after a click (browser autoplay rules) and follows the global mute.
 */

// I–V–vi–IV in C, as arpeggios of 4 notes per chord.
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25],
  [196.0, 246.94, 293.66, 392.0],
  [220.0, 261.63, 329.63, 440.0],
  [174.61, 220.0, 261.63, 349.23],
];
const STEP_S = 0.22;

export function startLobbyMusic(): () => void {
  if (typeof window === "undefined" || isMuted()) return () => {};
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return () => {};
  }
  const master = context.createGain();
  master.gain.value = 0.05;
  master.connect(context.destination);

  let step = 0;
  let nextAt = context.currentTime + 0.05;
  function schedule() {
    // Keep ~1 s of notes queued ahead of the clock.
    while (nextAt < context.currentTime + 1) {
      const chord = CHORDS[Math.floor(step / 4) % CHORDS.length]!;
      const freq = chord[step % 4]!;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, nextAt);
      gain.gain.exponentialRampToValueAtTime(1, nextAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, nextAt + STEP_S * 0.95);
      osc.connect(gain).connect(master);
      osc.start(nextAt);
      osc.stop(nextAt + STEP_S);
      step++;
      nextAt += STEP_S;
    }
  }
  schedule();
  const timer = setInterval(schedule, 250);
  return () => {
    clearInterval(timer);
    void context.close();
  };
}
