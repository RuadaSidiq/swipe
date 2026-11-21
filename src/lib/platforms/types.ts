import type { PlatformId } from "./registry";

export interface AdapterAccount {
  id: string; platform: PlatformId; externalId: string; accountType: string;
  accessToken: string | null; refreshToken: string | null; meta: Record<string, any>;
}
export interface AdapterMedia { id: string; kind: string; mimeType: string; publicUrl: string; filePath: string; sizeBytes: number; altText?: string }
export interface PublishInput { body: string; title?: string | null; link?: string | null; media: AdapterMedia[]; options: Record<string, any> }
export interface PublishResult { externalId: string; url?: string; raw?: unknown }
export interface MetricPoint { metric: string; value: number; periodStart: Date; periodEnd: Date; source: string }
export interface ReplyInput { conversationKind: string; externalThreadId: string; recipientId?: string; replyToExternalId?: string; body: string }
export interface TokenSet { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; refreshExpiresAt?: Date | null; scopes?: string[] }

export interface Adapter {
  publish?(acc: AdapterAccount, input: PublishInput): Promise<PublishResult>;
  reply?(acc: AdapterAccount, input: ReplyInput): Promise<{ externalId: string }>;
  metrics?(acc: AdapterAccount): Promise<MetricPoint[]>;
  /** Lifetime engagement for one published item. */
  postMetrics?(acc: AdapterAccount, externalId: string, publishedAt: Date): Promise<MetricPoint[]>;
  refresh?(acc: AdapterAccount): Promise<TokenSet>;
}
