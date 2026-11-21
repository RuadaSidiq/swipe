import type { Adapter } from "../types";
import type { PlatformId } from "../registry";
import { facebook, instagram, threads, whatsapp } from "./meta";
import { x, linkedin, youtube, tiktok, pinterest, reddit, telegram } from "./others";

export const ADAPTERS: Record<PlatformId, Adapter> = {
  facebook, instagram, threads, whatsapp, x, linkedin, youtube, tiktok, pinterest, reddit, telegram,
  snapchat: {}, // Partner-only API — intentionally no implementation.
};
