/*
 * Shared palette for the check-in emotion picker and the 14-day wave chart.
 * These hex values must match the ring colours used in src/pages/CheckIn.tsx
 * exactly so that the chart and picker stay visually in lockstep.
 */

export const EMOTION_KEYS = [
  "calm",
  "happy",
  "tired",
  "anxious",
  "overwhelmed",
  "sad",
] as const;

export type EmotionKey = (typeof EMOTION_KEYS)[number];

export const EMOTION_COLORS: Record<EmotionKey, string> = {
  calm: "#a8c8ad",
  happy: "#e9c98a",
  tired: "#b7afdc",
  anxious: "#c4bca5",
  overwhelmed: "#dcb1a8",
  sad: "#a8bdd0",
};

export const EMOTION_LABELS: Record<EmotionKey, string> = {
  calm: "Calm",
  happy: "Happy",
  tired: "Tired",
  anxious: "Anxious",
  overwhelmed: "Overwhelmed",
  sad: "Sad",
};

// Soft faded ocean tone used for days with no check-in. The wave gently dips
// toward this colour rather than breaking the line.
export const QUIET_DAY_COLOR = "#cfdce4";

export function isEmotionKey(value: string | null | undefined): value is EmotionKey {
  return !!value && (EMOTION_KEYS as readonly string[]).includes(value);
}
