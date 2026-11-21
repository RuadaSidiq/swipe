import { db } from "./db";
import type { Prisma } from "@prisma/client";

export const EVENT_TYPES = {
  "message.received": "A new direct message arrives",
  "comment.received": "A new comment or reply arrives",
  "post.failed": "A post fails to publish",
  "post.published": "A post is published",
  "conversation.assigned": "A conversation is assigned",
  "conversation.resolved": "A conversation is resolved",
  "campaign.created": "A campaign is created",
} as const;
export type EventType = keyof typeof EVENT_TYPES;

/** Durable outbox: automations run in the worker, so request handlers stay fast and failures are retryable. */
export async function emitEvent(workspaceId: string, type: EventType, payload: Record<string, unknown>) {
  await db.jobEvent.create({ data: { workspaceId, type, payload: payload as Prisma.InputJsonValue } });
}
