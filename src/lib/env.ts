import { z } from "zod";

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Invalid Supabase URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Supabase anon key required"),

  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // Resend (server-side only; optional - transactional email primarily routes via n8n + Gmail)
  RESEND_API_KEY: z.string().optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default("http://localhost:3000"),

  // Server-side (optional; validated at boot via src/instrumentation.ts register()).
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  N8N_AUDIT_WEBHOOK_URL: z.string().url().optional(),
  N8N_CHAT_WEBHOOK_URL: z.string().url().optional(),
  N8N_CONTACT_WEBHOOK_URL: z.string().url().optional(),
  // Stays optional so builds without it don't fail; but if it IS set, reject an obviously-weak
  // value. Empty string is treated as "unset" so the refine never trips on a blank var.
  SIS_WEBHOOK_SECRET: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === "" || v.length >= 16, {
      message: "SIS_WEBHOOK_SECRET must be at least 16 characters when set",
    }),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CONTACT_EMAIL: z.string().email().optional(),
  // Operational kill-switches: set to "false" to instantly disable an expensive path without a
  // redeploy (read in the audit/chat routes). Default on.
  AUDITS_ENABLED: z.string().optional().default("true"),
  CHAT_ENABLED: z.string().optional().default("true"),
  // Global daily circuit-breaker on audits (cost ceiling across ALL users, any plan). Unset = none.
  GLOBAL_DAILY_AUDIT_CAP: z.coerce.number().int().positive().optional(),
  // Comma-separated admin allowlist; empty/unset means no admins (see src/lib/admin.ts).
  ADMIN_EMAILS: z.string().optional().default(""),
}).superRefine((val, ctx) => {
  // In production on Vercel, the server-side integration secrets are REQUIRED: a prod deploy missing
  // them should fail fast at boot (via instrumentation.ts register()), not silently at the first
  // audit/chat request. Gated on VERCEL_ENV==='production' so preview/local builds (which may not
  // carry these in scope) still pass.
  if (process.env.VERCEL_ENV !== "production") return;
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "N8N_AUDIT_WEBHOOK_URL", "SIS_WEBHOOK_SECRET"] as const) {
    if (!val[key]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production` });
    }
  }
});

// Validate environment variables
function validateEnv(): Env {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    N8N_AUDIT_WEBHOOK_URL: process.env.N8N_AUDIT_WEBHOOK_URL,
    N8N_CHAT_WEBHOOK_URL: process.env.N8N_CHAT_WEBHOOK_URL,
    N8N_CONTACT_WEBHOOK_URL: process.env.N8N_CONTACT_WEBHOOK_URL,
    SIS_WEBHOOK_SECRET: process.env.SIS_WEBHOOK_SECRET,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    EMAIL_FROM: process.env.EMAIL_FROM,
    CONTACT_EMAIL: process.env.CONTACT_EMAIL,
    AUDITS_ENABLED: process.env.AUDITS_ENABLED,
    CHAT_ENABLED: process.env.CHAT_ENABLED,
    GLOBAL_DAILY_AUDIT_CAP: process.env.GLOBAL_DAILY_AUDIT_CAP || undefined,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  });

  if (parsed.success) return parsed.data;

  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Invalid environment variables");
  }
  // Development with incomplete local config: fall back to the raw process.env so the app still
  // boots for partial setup. In production we throw above, so `env` is always fully validated there.
  return process.env as unknown as Env;
}

export const env = validateEnv();

// Type-safe environment access
export type Env = z.infer<typeof envSchema>;
