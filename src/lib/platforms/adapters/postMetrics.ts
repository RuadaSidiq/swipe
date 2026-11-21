import { api } from "../http";
import type { AdapterAccount, MetricPoint } from "../types";
import { GRAPH } from "./meta";

const pts = (o: Record<string, number | undefined>, from: Date, source: string): MetricPoint[] =>
  Object.entries(o).filter(([, v]) => typeof v === "number" && !Number.isNaN(v)).map(([metric, value]) => ({ metric, value: value!, periodStart: from, periodEnd: new Date(), source }));
const bearer = (a: AdapterAccount) => ({ Authorization: `Bearer ${a.accessToken}` });

export const postMetrics: Record<string, (a: AdapterAccount, id: string, from: Date) => Promise<MetricPoint[]>> = {
  facebook: async (a, id, from) => {
    const r = await api(`${GRAPH}/${id}?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&access_token=${a.accessToken}`, {}, "Facebook");
    return pts({ likes: r.reactions?.summary?.total_count, comments: r.comments?.summary?.total_count, shares: r.shares?.count ?? 0 }, from, "Facebook Graph API post fields (lifetime)");
  },
  instagram: async (a, id, from) => {
    const r = await api(`${GRAPH}/${id}?fields=like_count,comments_count&access_token=${a.accessToken}`, {}, "Instagram");
    const out = pts({ likes: r.like_count, comments: r.comments_count }, from, "Instagram Graph API media fields (lifetime)");
    try {
      const ins = await api(`${GRAPH}/${id}/insights?metric=reach,saved,shares,views&access_token=${a.accessToken}`, {}, "Instagram");
      for (const m of ins.data ?? []) out.push({ metric: m.name === "saved" ? "saves" : m.name, value: m.values?.[0]?.value ?? 0, periodStart: from, periodEnd: new Date(), source: "Instagram media insights (lifetime)" });
    } catch { /* insights need instagram_manage_insights */ }
    return out;
  },
  threads: async (a, id, from) => {
    const r = await api(`https://graph.threads.net/v1.0/${id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${a.accessToken}`, {}, "Threads");
    const o: Record<string, number> = {};
    for (const m of r.data ?? []) o[m.name === "replies" ? "comments" : m.name === "reposts" ? "shares" : m.name] = m.values?.[0]?.value ?? 0;
    return pts(o, from, "Threads media insights (lifetime)");
  },
  x: async (a, id, from) => {
    const r = await api(`https://api.x.com/2/tweets/${id}?tweet.fields=public_metrics`, { headers: bearer(a) }, "X");
    const m = r.data?.public_metrics ?? {};
    return pts({ likes: m.like_count, comments: m.reply_count, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), impressions: m.impression_count }, from, "X API v2 public_metrics (lifetime)");
  },
  youtube: async (a, id, from) => {
    const r = await api(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}`, { headers: bearer(a) }, "YouTube");
    const s = r.items?.[0]?.statistics ?? {};
    return pts({ views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0) }, from, "YouTube Data API videos.statistics (lifetime)");
  },
  reddit: async (a, id, from) => {
    const r = await api(`https://oauth.reddit.com/api/info?id=${id}`, { headers: { ...bearer(a), "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:orbit" } }, "Reddit");
    const d = r.data?.children?.[0]?.data ?? {};
    return pts({ likes: d.score, comments: d.num_comments }, from, "Reddit /api/info score & num_comments");
  },
  pinterest: async (a, id, from) => {
    const start = new Date(Math.max(from.getTime(), Date.now() - 89 * 86400_000)).toISOString().slice(0, 10);
    const r = await api(`https://api.pinterest.com/v5/pins/${id}/analytics?start_date=${start}&end_date=${new Date().toISOString().slice(0, 10)}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`, { headers: bearer(a) }, "Pinterest");
    const t = r.all?.lifetime_metrics ?? r.all?.summary_metrics ?? {};
    return pts({ impressions: t.IMPRESSION, saves: t.SAVE, clicks: (t.PIN_CLICK ?? 0) + (t.OUTBOUND_CLICK ?? 0) }, from, "Pinterest pin analytics (last ≤90 days)");
  },
};
