import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "accounts.connect", "accounts.manage",
  "posts.create", "posts.edit", "posts.schedule", "posts.publish", "posts.approve", "posts.delete",
  "inbox.view", "inbox.reply", "inbox.assign",
  "analytics.view", "media.manage", "campaigns.manage", "contacts.manage",
  "automations.manage", "team.manage", "billing.manage", "workspace.settings", "ai.use", "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const matrix: Record<Role, Set<Permission>> = {
  OWNER: ALL,
  ADMIN: new Set([...PERMISSIONS].filter((p) => p !== "billing.manage")),
  MANAGER: new Set<Permission>([
    "accounts.connect", "accounts.manage", "posts.create", "posts.edit", "posts.schedule", "posts.publish", "posts.approve",
    "posts.delete", "inbox.view", "inbox.reply", "inbox.assign", "analytics.view", "media.manage", "campaigns.manage",
    "contacts.manage", "automations.manage", "ai.use", "audit.view",
  ]),
  CREATOR: new Set<Permission>(["posts.create", "posts.edit", "media.manage", "ai.use", "analytics.view"]),
  SUPPORT: new Set<Permission>(["inbox.view", "inbox.reply", "contacts.manage", "ai.use"]),
  ANALYST: new Set<Permission>(["analytics.view"]),
  APPROVER: new Set<Permission>(["posts.approve", "posts.edit", "analytics.view", "inbox.view"]),
};

export const can = (role: Role, p: Permission) => matrix[role].has(p);
export const permissionsFor = (role: Role) => [...matrix[role]];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner", ADMIN: "Administrator", MANAGER: "Social media manager", CREATOR: "Content creator",
  SUPPORT: "Customer support agent", ANALYST: "Analyst", APPROVER: "Approver",
};

export class ForbiddenError extends Error {
  constructor(public permission: string) { super(`You don't have permission to do this (${permission}).`); }
}
