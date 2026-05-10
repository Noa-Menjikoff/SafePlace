import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCommunityScore, type CategoryBreakdown } from "@/lib/score";

export type StatsCommentRow = {
  id: string;
  text: string | null;
  category: string | null;
  is_toxic: boolean | null;
  published_at: string | null;
  video_title: string | null;
};

export type StatsBundle = {
  windowDays: number;
  comments: StatsCommentRow[];
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  topQuestions: TopicCount[];
  current: PeriodSummary;
  previous: PeriodSummary;
};

export type DailyPoint = {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  score: number | null;
};

export type HourlyPoint = {
  hour: number; // 0..23
  total: number;
};

export type TopicCount = {
  label: string;
  count: number;
};

export type PeriodSummary = {
  total: number;
  positive: number;
  negative: number;
  positiveRatio: number; // 0..1
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD UTC, good enough for grouping
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function isNegative(c: StatsCommentRow): boolean {
  return (
    c.is_toxic === true ||
    c.category === "constructive" ||
    c.category === "neutral"
  );
}

function isPositive(c: StatsCommentRow): boolean {
  return c.category === "positive";
}

function summarize(rows: StatsCommentRow[]): PeriodSummary {
  const total = rows.length;
  const positive = rows.filter(isPositive).length;
  const negative = rows.filter(isNegative).length;
  const denom = positive + negative;
  return {
    total,
    positive,
    negative,
    positiveRatio: denom > 0 ? positive / denom : 0,
  };
}

function dailyBreakdown(rows: StatsCommentRow[], windowDays: number): DailyPoint[] {
  const buckets = new Map<string, CategoryBreakdown>();
  for (const c of rows) {
    if (!c.published_at) continue;
    const key = dayKey(c.published_at);
    let b = buckets.get(key);
    if (!b) {
      b = {
        question: 0,
        positive: 0,
        constructive: 0,
        neutral: 0,
        toxic: 0,
        total: 0,
      };
      buckets.set(key, b);
    }
    b.total += 1;
    if (c.is_toxic) b.toxic += 1;
    if (c.category === "question") b.question += 1;
    else if (c.category === "positive") b.positive += 1;
    else if (c.category === "constructive") b.constructive += 1;
    else if (c.category === "neutral") b.neutral += 1;
  }

  const points: DailyPoint[] = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key);
    points.push({
      date: key,
      total: b?.total ?? 0,
      score: b ? computeCommunityScore(b) : null,
    });
  }
  return points;
}

function hourlyBreakdown(rows: StatsCommentRow[]): HourlyPoint[] {
  const counts = new Array(24).fill(0) as number[];
  for (const c of rows) {
    if (!c.published_at) continue;
    const h = new Date(c.published_at).getUTCHours();
    if (h >= 0 && h < 24) counts[h] += 1;
  }
  return counts.map((total, hour) => ({ hour, total }));
}

const STOP_WORDS = new Set([
  "le","la","les","un","une","des","du","de","et","ou","à","au","aux","en","sur","dans","par","pour","avec","sans","mais","que","qui","est","sont","ce","cet","cette","ces","si","ne","pas","plus","tu","te","ton","ta","tes","je","me","mon","ma","mes","on","nous","vous","ils","elles","il","elle","ça","cela","comme","tout","tous","toute","toutes","fait","fais","faire","y","quoi","comment","pourquoi","où","quand","quel","quelle","peux","peut","pouvez","pouvoir","oui","non","bonjour","salut","merci","stp","svp","really","the","a","an","is","are","was","were","be","been","of","to","in","for","on","at","by","with","this","that","it","i","you","we","they","he","she","please","do","does","did","what","why","how","when","where","can","could","would","should","there","their"
]);

function topQuestionTopics(rows: StatsCommentRow[], limit = 5): TopicCount[] {
  const tally = new Map<string, number>();
  for (const c of rows) {
    if (c.category !== "question" || !c.text) continue;
    const words = c.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    // Compte uniquement uniques par commentaire pour éviter qu'un même
    // commentaire pèse trop.
    for (const w of new Set(words)) {
      tally.set(w, (tally.get(w) ?? 0) + 1);
    }
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export async function fetchStats(
  supabase: SupabaseClient,
  channelIds: string[],
  windowDays: number
): Promise<StatsBundle> {
  if (channelIds.length === 0) {
    return {
      windowDays,
      comments: [],
      daily: dailyBreakdown([], windowDays),
      hourly: hourlyBreakdown([]),
      topQuestions: [],
      current: summarize([]),
      previous: summarize([]),
    };
  }

  const sinceCurrent = isoDaysAgo(windowDays);
  const sincePrevious = isoDaysAgo(windowDays * 2);

  const { data: rows } = await supabase
    .from("comments")
    .select("id, text, category, is_toxic, published_at, video_title")
    .in("channel_id", channelIds)
    .gte("published_at", sincePrevious)
    .order("published_at", { ascending: true })
    .limit(5000);

  const all = (rows ?? []) as StatsCommentRow[];

  const sinceCurrentMs = new Date(sinceCurrent).getTime();
  const current = all.filter(
    (c) => c.published_at && new Date(c.published_at).getTime() >= sinceCurrentMs
  );
  const previous = all.filter(
    (c) => c.published_at && new Date(c.published_at).getTime() < sinceCurrentMs
  );

  return {
    windowDays,
    comments: current,
    daily: dailyBreakdown(current, windowDays),
    hourly: hourlyBreakdown(current),
    topQuestions: topQuestionTopics(current),
    current: summarize(current),
    previous: summarize(previous),
  };
}
