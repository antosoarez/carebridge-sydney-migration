/*
 * SAFETY INVARIANT — READ BEFORE EDITING.
 * This module powers a PRIVATE, ADVOCATE-SIDE nudge: when a client logs a
 * low-mood emotion on 3+ consecutive calendar days (within the last 7),
 * the advocate sees a "Needs attention" item so they can reach out.
 *
 * It is NOT a crisis-response system. It must NEVER be used to gate, delay,
 * hide, or replace the crisis support resources shown on /check-in. Those
 * resources render unconditionally on every visit from load #1. The two
 * systems must stay fully decoupled for client safety.
 */

export const LOW_MOOD = ["sad", "overwhelmed", "anxious"] as const;
export type LowMoodEmotion = (typeof LOW_MOOD)[number];

export type EmotionLogRow = {
  user_id: string | null;
  emotion: string;
  created_at: string;
};

export type LowMoodFlag = {
  streak: number;
  lastDate: string; // YYYY-MM-DD (local)
};

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

/**
 * Returns a map of user_id -> { streak, lastDate } for every user who has
 * 3+ consecutive calendar days of low-mood check-ins within the last 7 days.
 */
export function computeLowMoodFlags(
  rows: EmotionLogRow[],
  now: Date = new Date(),
): Map<string, LowMoodFlag> {
  const sevenDaysAgo = now.getTime() - 7 * 86400000;
  const lowSet = new Set<string>(LOW_MOOD);

  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.user_id) continue;
    if (!lowSet.has(r.emotion)) continue;
    const t = new Date(r.created_at).getTime();
    if (isNaN(t) || t < sevenDaysAgo) continue;
    const key = toLocalDateKey(r.created_at);
    let s = byUser.get(r.user_id);
    if (!s) {
      s = new Set();
      byUser.set(r.user_id, s);
    }
    s.add(key);
  }

  const flags = new Map<string, LowMoodFlag>();
  for (const [userId, dateSet] of byUser) {
    const dates = Array.from(dateSet).sort();
    let bestRun = 1;
    let bestEnd = dates[0];
    let curRun = 1;
    for (let i = 1; i < dates.length; i++) {
      curRun = dayDiff(dates[i - 1], dates[i]) === 1 ? curRun + 1 : 1;
      if (curRun > bestRun) {
        bestRun = curRun;
        bestEnd = dates[i];
      }
    }
    if (bestRun >= 3) flags.set(userId, { streak: bestRun, lastDate: bestEnd });
  }
  return flags;
}
