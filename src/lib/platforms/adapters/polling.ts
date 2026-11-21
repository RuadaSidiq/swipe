import { api, PlatformError } from "../http";
import type { Adapter, AdapterAccount, PolledItem } from "../types";

const bearer = (a: AdapterAccount) => ({ Authorization: `Bearer ${a.accessToken}` });
const redditUA = () => process.env.REDDIT_USER_AGENT || "web:orbit:0.1";

/** YouTube: new top-level comments and replies across the channel's videos. Cursor = ISO time of newest seen. */
export const youtubePoll: Required<Pick<Adapter, "poll" | "reply">> = {
  async poll(acc, cursor) {
    const since = cursor ? new Date(cursor) : new Date(Date.now() - 3 * 86400_000);
    const r = await api(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${acc.externalId}&order=time&maxResults=50&textFormat=plainText`, { headers: bearer(acc) }, "YouTube");
    const items: PolledItem[] = []; let newest = since;
    for (const th of r.items ?? []) {
      const top = th.snippet.topLevelComment; const vid = th.snippet.videoId;
      const all = [top, ...(th.replies?.comments ?? [])];
      for (const c of all) {
        const sn = c.snippet; const at = new Date(sn.publishedAt);
        if (at <= since) continue;
        if (at > newest) newest = at;
        items.push({ kind: "comment", threadId: top.id, subject: `Video ${vid}`, externalId: c.id, at,
          author: { id: sn.authorChannelId?.value ?? sn.authorDisplayName, name: sn.authorDisplayName, avatar: sn.authorProfileImageUrl },
          body: sn.textDisplay ?? sn.textOriginal ?? "", fromSelf: sn.authorChannelId?.value === acc.externalId });
      }
    }
    return { items, cursor: newest.toISOString() };
  },
  async reply(acc, input) {
    const r = await api("https://www.googleapis.com/youtube/v3/comments?part=snippet", { method: "POST", headers: bearer(acc), json: { snippet: { parentId: input.externalThreadId, textOriginal: input.body } } }, "YouTube");
    return { externalId: r.id };
  },
};

/** Reddit: unread private messages and replies to your posts/comments. Marks them read after ingesting. */
export const redditPoll: Required<Pick<Adapter, "poll" | "reply">> = {
  async poll(acc) {
    const h = { ...bearer(acc), "User-Agent": redditUA() };
    const r = await api("https://oauth.reddit.com/message/unread?limit=100&raw_json=1", { headers: h }, "Reddit");
    const items: PolledItem[] = [];
    const names: string[] = [];
    for (const ch of r.data?.children ?? []) {
      const d = ch.data; names.push(d.name);
      const isPm = ch.kind === "t4";
      items.push({ kind: isPm ? "dm" : d.type === "username_mention" ? "mention" : "comment", threadId: isPm ? (d.first_message_name ?? d.name) : d.name,
        subject: isPm ? d.subject : d.link_title, externalId: d.name, at: new Date(d.created_utc * 1000), author: { id: d.author ?? "unknown", name: `u/${d.author}`, handle: d.author }, body: d.body ?? "" });
    }
    if (names.length) await api("https://oauth.reddit.com/api/read_message", { method: "POST", headers: h, form: { id: names.join(",") } }, "Reddit");
    return { items, cursor: null };
  },
  async reply(acc, input) {
    const r = await api("https://oauth.reddit.com/api/comment", { method: "POST", headers: { ...bearer(acc), "User-Agent": redditUA() },
      form: { thing_id: input.replyToExternalId ?? input.externalThreadId, text: input.body, api_type: "json" } }, "Reddit");
    const errs = r.json?.errors; if (errs?.length) throw new PlatformError(`Reddit: ${errs.map((e: string[]) => e.join(" ")).join("; ")}`);
    return { externalId: r.json?.data?.things?.[0]?.data?.name ?? "" };
  },
};

/** X: mentions of the account (includes replies to your posts). Cursor = since_id. */
export const xPoll: Required<Pick<Adapter, "poll" | "reply">> = {
  async poll(acc, cursor) {
    const q = new URLSearchParams({ max_results: "50", expansions: "author_id", "user.fields": "username,name,profile_image_url", "tweet.fields": "created_at,conversation_id,in_reply_to_user_id" });
    if (cursor) q.set("since_id", cursor); else q.set("start_time", new Date(Date.now() - 86400_000).toISOString());
    const r = await api(`https://api.x.com/2/users/${acc.externalId}/mentions?${q}`, { headers: bearer(acc) }, "X");
    const users = new Map<string, any>((r.includes?.users ?? []).map((u: any) => [u.id, u]));
    const items: PolledItem[] = (r.data ?? []).map((t: any) => { const u = users.get(t.author_id) ?? {};
      return { kind: t.in_reply_to_user_id === acc.externalId ? "reply" : "mention", threadId: t.conversation_id ?? t.id, externalId: t.id, at: new Date(t.created_at),
        author: { id: t.author_id, name: u.name ?? "X user", handle: u.username, avatar: u.profile_image_url }, body: t.text } as PolledItem; });
    return { items, cursor: r.meta?.newest_id ?? cursor };
  },
  async reply(acc, input) {
    const r = await api("https://api.x.com/2/tweets", { method: "POST", headers: bearer(acc), json: { text: input.body, reply: { in_reply_to_tweet_id: input.replyToExternalId ?? input.externalThreadId } } }, "X");
    return { externalId: r.data.id };
  },
};

/** Threads: replies on the account's recent posts. Cursor = ISO time of newest seen. */
export const threadsPoll: Required<Pick<Adapter, "poll" | "reply">> = {
  async poll(acc, cursor) {
    const since = cursor ? new Date(cursor) : new Date(Date.now() - 3 * 86400_000);
    const posts = await api(`https://graph.threads.net/v1.0/${acc.externalId}/threads?fields=id,text,timestamp&limit=15&access_token=${acc.accessToken}`, {}, "Threads");
    const items: PolledItem[] = []; let newest = since;
    for (const p of posts.data ?? []) {
      const rep = await api(`https://graph.threads.net/v1.0/${p.id}/replies?fields=id,text,username,timestamp,is_reply_owned_by_me&access_token=${acc.accessToken}`, {}, "Threads");
      for (const c of rep.data ?? []) {
        const at = new Date(c.timestamp);
        if (at <= since || c.is_reply_owned_by_me) continue;
        if (at > newest) newest = at;
        items.push({ kind: "comment", threadId: c.id, subject: (p.text ?? "").slice(0, 80), externalId: c.id, at, author: { id: c.username, name: c.username, handle: c.username }, body: c.text ?? "" });
      }
    }
    return { items, cursor: newest.toISOString() };
  },
  async reply(acc, input) {
    const base = `https://graph.threads.net/v1.0/${acc.externalId}`;
    const c = await api(`${base}/threads`, { method: "POST", form: { media_type: "TEXT", text: input.body, reply_to_id: input.replyToExternalId ?? input.externalThreadId, access_token: acc.accessToken! } }, "Threads");
    await new Promise((r) => setTimeout(r, 1500));
    const p = await api(`${base}/threads_publish`, { method: "POST", form: { creation_id: c.id, access_token: acc.accessToken! } }, "Threads");
    return { externalId: p.id };
  },
};
