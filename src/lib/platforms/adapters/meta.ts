import { api, PlatformError } from "../http";
import type { Adapter, AdapterAccount, PublishInput, MetricPoint } from "../types";

export const GRAPH = "https://graph.facebook.com/v21.0";
const tok = (a: AdapterAccount) => { if (!a.accessToken) throw new PlatformError("Missing access token", { auth: true }); return a.accessToken; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const day = () => { const end = new Date(); return { periodStart: new Date(end.getTime() - 86400_000), periodEnd: end }; };

// ── Facebook Pages ──
export const facebook: Adapter = {
  async publish(acc, input: PublishInput) {
    const t = tok(acc); const page = acc.externalId;
    const images = input.media.filter((m) => m.kind !== "video");
    const video = input.media.find((m) => m.kind === "video");
    if (video) {
      const r = await api(`${GRAPH}/${page}/videos`, { method: "POST", form: { file_url: video.publicUrl, description: input.body, access_token: t }, timeoutMs: 120_000 }, "Facebook");
      return { externalId: r.id, url: `https://www.facebook.com/${r.id}` };
    }
    if (images.length === 1) {
      const r = await api(`${GRAPH}/${page}/photos`, { method: "POST", form: { url: images[0].publicUrl, caption: input.body, access_token: t } }, "Facebook");
      return { externalId: r.post_id ?? r.id, url: `https://www.facebook.com/${r.post_id ?? r.id}` };
    }
    const form: Record<string, string> = { message: input.body, access_token: t };
    if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images) {
        const r = await api(`${GRAPH}/${page}/photos`, { method: "POST", form: { url: img.publicUrl, published: "false", access_token: t } }, "Facebook");
        ids.push(r.id);
      }
      ids.forEach((id, i) => (form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    } else if (input.link) form.link = input.link;
    const r = await api(`${GRAPH}/${page}/feed`, { method: "POST", form }, "Facebook");
    return { externalId: r.id, url: `https://www.facebook.com/${r.id}` };
  },
  async reply(acc, input) {
    const t = tok(acc);
    if (input.conversationKind === "dm") {
      const r = await api(`${GRAPH}/${acc.externalId}/messages`, { method: "POST", json: { recipient: { id: input.recipientId }, messaging_type: "RESPONSE", message: { text: input.body }, access_token: t } }, "Messenger");
      return { externalId: r.message_id };
    }
    const r = await api(`${GRAPH}/${input.replyToExternalId ?? input.externalThreadId}/comments`, { method: "POST", form: { message: input.body, access_token: t } }, "Facebook");
    return { externalId: r.id };
  },
  async metrics(acc): Promise<MetricPoint[]> {
    const r = await api(`${GRAPH}/${acc.externalId}?fields=followers_count,fan_count&access_token=${tok(acc)}`, {}, "Facebook");
    const p = day(); const src = "Facebook Graph API v21.0 /{page}?fields=followers_count";
    return [{ metric: "followers", value: r.followers_count ?? r.fan_count ?? 0, ...p, source: src }];
  },
};

// ── Instagram (Graph API via Facebook Login) ──
async function waitForContainer(id: string, t: string, base = GRAPH, label = "Instagram") {
  for (let i = 0; i < 40; i++) {
    const s = await api(`${base}/${id}?fields=status_code,status&access_token=${t}`, {}, label);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new PlatformError(`${label}: media processing failed (${s.status ?? s.status_code})`);
    await sleep(i < 5 ? 2000 : 5000);
  }
  throw new PlatformError(`${label}: media processing timed out`, { retryable: true });
}

export const instagram: Adapter = {
  async publish(acc, input) {
    const t = tok(acc); const ig = acc.externalId;
    if (!input.media.length) throw new PlatformError("Instagram requires media");
    const item = async (m: PublishInput["media"][number], carousel: boolean) => {
      const form: Record<string, string> = { access_token: t };
      if (m.kind === "video") { form.media_type = carousel ? "VIDEO" : "REELS"; form.video_url = m.publicUrl; }
      else { form.image_url = m.publicUrl; if (m.altText && !carousel) form.alt_text = m.altText; }
      if (carousel) form.is_carousel_item = "true"; else form.caption = input.body;
      const r = await api(`${GRAPH}/${ig}/media`, { method: "POST", form }, "Instagram");
      if (m.kind === "video") await waitForContainer(r.id, t);
      return r.id as string;
    };
    let creation: string;
    if (input.media.length === 1) creation = await item(input.media[0], false);
    else {
      const children = [];
      for (const m of input.media) children.push(await item(m, true));
      const r = await api(`${GRAPH}/${ig}/media`, { method: "POST", form: { media_type: "CAROUSEL", children: children.join(","), caption: input.body, access_token: t } }, "Instagram");
      await waitForContainer(r.id, t);
      creation = r.id;
    }
    const pub = await api(`${GRAPH}/${ig}/media_publish`, { method: "POST", form: { creation_id: creation, access_token: t } }, "Instagram");
    let url: string | undefined;
    try { url = (await api(`${GRAPH}/${pub.id}?fields=permalink&access_token=${t}`, {}, "Instagram")).permalink; } catch { /* optional */ }
    if (input.options.firstComment) {
      try { await api(`${GRAPH}/${pub.id}/comments`, { method: "POST", form: { message: String(input.options.firstComment), access_token: t } }, "Instagram"); } catch { /* non-fatal */ }
    }
    return { externalId: pub.id, url };
  },
  async reply(acc, input) {
    const t = tok(acc);
    if (input.conversationKind === "dm") {
      const pageId = acc.meta.pageId;
      const r = await api(`${GRAPH}/${pageId}/messages`, { method: "POST", json: { recipient: { id: input.recipientId }, message: { text: input.body }, access_token: t } }, "Instagram DM");
      return { externalId: r.message_id };
    }
    const r = await api(`${GRAPH}/${input.replyToExternalId ?? input.externalThreadId}/replies`, { method: "POST", form: { message: input.body, access_token: t } }, "Instagram");
    return { externalId: r.id };
  },
  async metrics(acc) {
    const r = await api(`${GRAPH}/${acc.externalId}?fields=followers_count,media_count&access_token=${tok(acc)}`, {}, "Instagram");
    const p = day(); const src = "Instagram Graph API v21.0 /{ig-user}?fields=followers_count";
    return [{ metric: "followers", value: r.followers_count ?? 0, ...p, source: src }];
  },
};

// ── Threads ──
const TH = "https://graph.threads.net/v1.0";
export const threads: Adapter = {
  async publish(acc, input) {
    const t = tok(acc); const uid = acc.externalId;
    const mk = async (form: Record<string, string>, video: boolean) => {
      const r = await api(`${TH}/${uid}/threads`, { method: "POST", form: { ...form, access_token: t } }, "Threads");
      if (video || form.media_type === "CAROUSEL") await waitForContainer(r.id, t, TH, "Threads"); else await sleep(1500);
      return r.id as string;
    };
    let creation: string;
    if (input.media.length === 0) creation = await mk({ media_type: "TEXT", text: input.body }, false);
    else if (input.media.length === 1) {
      const m = input.media[0];
      creation = await mk(m.kind === "video" ? { media_type: "VIDEO", video_url: m.publicUrl, text: input.body } : { media_type: "IMAGE", image_url: m.publicUrl, text: input.body }, m.kind === "video");
    } else {
      const kids = [];
      for (const m of input.media) kids.push(await mk(m.kind === "video" ? { media_type: "VIDEO", video_url: m.publicUrl, is_carousel_item: "true" } : { media_type: "IMAGE", image_url: m.publicUrl, is_carousel_item: "true" }, m.kind === "video"));
      creation = await mk({ media_type: "CAROUSEL", children: kids.join(","), text: input.body }, false);
    }
    const r = await api(`${TH}/${uid}/threads_publish`, { method: "POST", form: { creation_id: creation, access_token: t } }, "Threads");
    let url: string | undefined;
    try { url = (await api(`${TH}/${r.id}?fields=permalink&access_token=${t}`, {}, "Threads")).permalink; } catch { /* optional */ }
    return { externalId: r.id, url };
  },
  async metrics(acc) {
    const r = await api(`${TH}/${acc.externalId}/threads_insights?metric=followers_count&access_token=${tok(acc)}`, {}, "Threads");
    const v = r.data?.[0]?.total_value?.value ?? 0;
    return [{ metric: "followers", value: v, ...day(), source: "Threads Insights API v1.0 followers_count" }];
  },
  async refresh(acc) {
    const r = await api(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${tok(acc)}`, {}, "Threads");
    return { accessToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── WhatsApp Business Cloud API ──
export const whatsapp: Adapter = {
  async reply(acc, input) {
    const r = await api(`${GRAPH}/${acc.externalId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${tok(acc)}` },
      json: { messaging_product: "whatsapp", recipient_type: "individual", to: input.recipientId, type: "text", text: { body: input.body, preview_url: true } },
    }, "WhatsApp");
    return { externalId: r.messages?.[0]?.id };
  },
};
