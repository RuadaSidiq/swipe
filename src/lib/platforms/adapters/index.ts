import type { Adapter } from "../types";
import type { PlatformId } from "../registry";
import { facebook, instagram, threads, whatsapp } from "./meta";
import { x, linkedin, youtube, tiktok, pinterest, reddit, telegram } from "./others";
import { redditPoll, threadsPoll, xPoll, youtubePoll } from "./polling";

export const ADAPTERS: Record<PlatformId, Adapter> = {
  facebook, instagram, whatsapp, linkedin, tiktok, pinterest, telegram,
  threads: { ...threads, ...threadsPoll }, x: { ...x, ...xPoll }, youtube: { ...youtube, ...youtubePoll }, reddit: { ...reddit, ...redditPoll },
  snapchat: {}, // Partner-only API — intentionally no implementation.
};
