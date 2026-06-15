import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EMOTION_COLORS,
  EMOTION_KEYS,
  EMOTION_LABELS,
  QUIET_DAY_COLOR,
  isEmotionKey,
  type EmotionKey,
} from "@/lib/emotion-palette";

type Props = {
  clientId: string;
  viewerRole: "client" | "advocate";
  title?: string;
};

type DayBucket = {
  dateKey: string; // YYYY-MM-DD local
  label: string;
  counts: Partial<Record<EmotionKey, number>>;
  total: number;
  dominant: EmotionKey | null;
  // Client-only: notes for that day. Always empty for advocates.
  notes: { text: string; at: string }[];
};

function toLocalKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildEmptyBuckets(days: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.push({
      dateKey: toLocalKey(d),
      label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      counts: {},
      total: 0,
      dominant: null,
      notes: [],
    });
  }
  return buckets;
}

function pickDominant(
  counts: Partial<Record<EmotionKey, number>>,
  latestPerEmotion: Partial<Record<EmotionKey, string>>,
): EmotionKey | null {
  let best: EmotionKey | null = null;
  let bestCount = 0;
  let bestLatest = "";
  for (const k of EMOTION_KEYS) {
    const c = counts[k] ?? 0;
    if (c === 0) continue;
    const latest = latestPerEmotion[k] ?? "";
    if (
      c > bestCount ||
      (c === bestCount && latest > bestLatest)
    ) {
      best = k;
      bestCount = c;
      bestLatest = latest;
    }
  }
  return best;
}

function buildSummary(buckets: DayBucket[], viewerRole: "client" | "advocate"): string {
  const totals: Partial<Record<EmotionKey, number>> = {};
  let quietDays = 0;
  for (const b of buckets) {
    if (b.dominant) totals[b.dominant] = (totals[b.dominant] ?? 0) + 1;
    else quietDays += 1;
  }
  const sorted = (Object.entries(totals) as [EmotionKey, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return viewerRole === "client"
      ? "No check-ins yet this fortnight. Whenever you're ready, a quick check-in is a kind thing to do for yourself."
      : "No check-ins logged in the last fortnight.";
  }

  const [topKey, topCount] = sorted[0];
  const second = sorted[1];
  const topLabel = EMOTION_LABELS[topKey].toLowerCase();

  let lead: string;
  if (topCount >= 6) lead = `Mostly ${topLabel} this fortnight`;
  else if (topCount >= 3) lead = `A lot of ${topLabel} days this fortnight`;
  else lead = `A gentle mix — a few ${topLabel} days`;

  let tail = "";
  if (second && second[1] >= 2) {
    tail = ` — with some ${EMOTION_LABELS[second[0]].toLowerCase()} days too`;
  } else if (quietDays >= 5) {
    tail = ` — and several quiet days`;
  }

  const closer = viewerRole === "client"
    ? ". Thank you for checking in with yourself."
    : ".";

  return `${lead}${tail}${closer}`;
}

// Catmull–Rom to cubic Bezier path
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function EmotionWaveCard({ clientId, viewerRole, title }: Props) {
  const [buckets, setBuckets] = useState<DayBucket[]>(() => buildEmptyBuckets(14));
  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const empty = buildEmptyBuckets(14);
      const keyIndex = new Map(empty.map((b, i) => [b.dateKey, i]));
      const latestPerEmotionPerDay: Record<string, Partial<Record<EmotionKey, string>>> = {};

      if (viewerRole === "client") {
        const sinceIso = new Date(Date.now() - 14 * 86400000).toISOString();
        const { data, error } = await supabase
          .from("emotion_logs")
          .select("emotion, optional_note, created_at")
          .eq("user_id", clientId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        if (!error && data) {
          for (const row of data) {
            if (!isEmotionKey(row.emotion)) continue;
            const key = toLocalKey(new Date(row.created_at as string));
            const idx = keyIndex.get(key);
            if (idx === undefined) continue;
            const b = empty[idx];
            b.counts[row.emotion] = (b.counts[row.emotion] ?? 0) + 1;
            b.total += 1;
            const note = (row.optional_note as string | null)?.trim();
            if (note) b.notes.push({ text: note, at: row.created_at as string });
            const latestMap = latestPerEmotionPerDay[key] ?? (latestPerEmotionPerDay[key] = {});
            const prev = latestMap[row.emotion] ?? "";
            if ((row.created_at as string) > prev) latestMap[row.emotion] = row.created_at as string;
          }
        }
      } else {
        const { data, error } = await supabase.rpc("get_client_emotion_summary", {
          _client_id: clientId,
          _days: 14,
        });
        if (cancelled) return;
        if (!error && data) {
          for (const row of data as { day: string; emotion: string; count: number }[]) {
            if (!isEmotionKey(row.emotion)) continue;
            // RPC's day is a UTC date; treat as local-key for charting buckets.
            const key = row.day;
            const idx = keyIndex.get(key);
            if (idx === undefined) continue;
            const b = empty[idx];
            b.counts[row.emotion] = (b.counts[row.emotion] ?? 0) + row.count;
            b.total += row.count;
            const latestMap = latestPerEmotionPerDay[key] ?? (latestPerEmotionPerDay[key] = {});
            // No timestamp granularity from RPC — use day key as ordering proxy
            latestMap[row.emotion] = key;
          }
        }
      }

      for (const b of empty) {
        b.dominant = pickDominant(b.counts, latestPerEmotionPerDay[b.dateKey] ?? {});
      }
      setBuckets(empty);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, viewerRole]);

  // Layout the wave
  const W = 600;
  const H = 140;
  const padX = 24;
  const padY = 22;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;

  // Map each emotion to a y position so dominant colour also corresponds to a
  // visual height (calm/happy = higher, sad/overwhelmed = lower). Quiet days
  // sit gently near the midline.
  const yFor: Record<EmotionKey | "quiet", number> = useMemo(
    () => ({
      happy: padY + innerH * 0.10,
      calm: padY + innerH * 0.22,
      tired: padY + innerH * 0.45,
      anxious: padY + innerH * 0.58,
      overwhelmed: padY + innerH * 0.72,
      sad: padY + innerH * 0.85,
      quiet: padY + innerH * 0.55,
    }),
    [innerH],
  );

  const points = buckets.map((b, i) => ({
    x: padX + i * stepX,
    y: b.dominant ? yFor[b.dominant] : yFor.quiet,
  }));

  const linearGradStops = buckets.map((b, i) => {
    const offset = buckets.length > 1 ? (i / (buckets.length - 1)) * 100 : 0;
    const colour = b.dominant ? EMOTION_COLORS[b.dominant] : QUIET_DAY_COLOR;
    return { offset, colour };
  });

  const pathD = smoothPath(points);
  const gradientId = `wave-gradient-${clientId.slice(0, 8)}`;
  const areaPath = pathD
    ? `${pathD} L ${padX + (buckets.length - 1) * stepX} ${H - padY} L ${padX} ${H - padY} Z`
    : "";

  // Soft left-to-right reveal on first render
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    // Force reflow
    void path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 1600ms cubic-bezier(0.22, 0.61, 0.36, 1)";
    path.style.strokeDashoffset = "0";
  }, [pathD]);

  const summary = useMemo(() => buildSummary(buckets, viewerRole), [buckets, viewerRole]);
  const totals = useMemo(() => {
    const t: Partial<Record<EmotionKey, number>> = {};
    for (const b of buckets) if (b.dominant) t[b.dominant] = (t[b.dominant] ?? 0) + 1;
    return t;
  }, [buckets]);

  const heading = title ?? (viewerRole === "client" ? "Your last two weeks 🌊" : "Last two weeks");

  return (
    <section className="glass-card p-5 sm:p-6" aria-label="Two-week emotion check-in chart">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg text-primary-deep">{heading}</h3>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[140px] sm:h-[180px]"
          role="img"
          aria-label="Wave showing dominant emotion per day over the last 14 days"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              {linearGradStops.map((s, i) => (
                <stop key={i} offset={`${s.offset}%`} stopColor={s.colour} />
              ))}
            </linearGradient>
            <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={QUIET_DAY_COLOR} stopOpacity="0.35" />
              <stop offset="100%" stopColor={QUIET_DAY_COLOR} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {areaPath && (
            <path d={areaPath} fill={`url(#${gradientId}-fill)`} stroke="none" />
          )}
          {pathD && (
            <path
              ref={pathRef}
              d={pathD}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Day dots + thumb-friendly hit areas */}
          {buckets.map((b, i) => {
            const cx = points[i].x;
            const cy = points[i].y;
            const colour = b.dominant ? EMOTION_COLORS[b.dominant] : QUIET_DAY_COLOR;
            return (
              <g key={b.dateKey}>
                <circle cx={cx} cy={cy} r={b.dominant ? 4.5 : 3} fill={colour} stroke="white" strokeWidth={1.5} />
                <Popover open={openDay === b.dateKey} onOpenChange={(o) => setOpenDay(o ? b.dateKey : null)}>
                  <PopoverTrigger asChild>
                    <rect
                      x={cx - stepX / 2}
                      y={padY - 8}
                      width={Math.max(stepX, 28)}
                      height={innerH + 16}
                      fill="transparent"
                      className="cursor-pointer focus:outline-none"
                      aria-label={`${b.label}: ${b.dominant ? EMOTION_LABELS[b.dominant] : "no check-in"}`}
                    />
                  </PopoverTrigger>
                  <PopoverContent side="top" className="w-60 p-3 rounded-2xl border-[#dbe6df] bg-white/95 backdrop-blur shadow-soft">
                    <p className="text-xs font-medium text-[#5b6b60] mb-1">{b.label}</p>
                    {b.dominant ? (
                      <>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: EMOTION_COLORS[b.dominant] }}
                          />
                          <span className="text-sm text-[#1C2B3A]">
                            {EMOTION_LABELS[b.dominant]}
                            {b.total > 1 ? ` · ${b.total} check-ins` : ""}
                          </span>
                        </div>
                        {viewerRole === "client" && b.notes.length > 0 && (
                          <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
                            {b.notes.map((n, idx) => (
                              <li key={idx} className="text-xs text-[#3b4a3f] leading-snug rounded-xl bg-[#eef4ee] px-2.5 py-1.5">
                                {n.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-[#5b6b60]">A quiet day — no check-in.</p>
                    )}
                  </PopoverContent>
                </Popover>
              </g>
            );
          })}

          {/* Minimal date markers */}
          {[0, Math.floor(buckets.length / 2), buckets.length - 1].map((i) => (
            <text
              key={i}
              x={padX + i * stepX}
              y={H - 4}
              textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}
              className="fill-[#5b6b60]"
              style={{ fontSize: 11 }}
            >
              {i === buckets.length - 1 ? "today" : i === 0 ? "14 days ago" : "7 days ago"}
            </text>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {EMOTION_KEYS.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5 text-xs text-[#3b4a3f]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: EMOTION_COLORS[k] }}
            />
            {EMOTION_LABELS[k]}
            {totals[k] ? <span className="text-[#5b6b60]">· {totals[k]}d</span> : null}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 text-xs text-[#5b6b60]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: QUIET_DAY_COLOR }} />
          Quiet day
        </li>
      </ul>

      <p className="mt-3 text-sm text-[#1C2B3A] leading-relaxed">{summary}</p>
    </section>
  );
}

export default EmotionWaveCard;
