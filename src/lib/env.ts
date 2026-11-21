export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  demoMode: process.env.DEMO_MODE === "true",
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  adminEmails: (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  isProd: process.env.NODE_ENV === "production",
};
