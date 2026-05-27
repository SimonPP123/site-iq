import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp, sanitizeErrorMessage } from "@/lib/security";
import { isDisposableEmail } from "@/lib/disposable-email";
import { sendEmail } from "@/lib/email";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(200),
  message: z.string().trim().min(10, "Please add a few words").max(2000),
  plan: z.enum(["pro", "agency"]).optional(), // pre-filled from ?plan= on the pricing CTAs
  company: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(60).optional(), // user-selected reason for contacting
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * POST /api/contact - public contact / sales form (Pro & Agency enquiries, general contact).
 * No auth. The submission is persisted to `contact_requests` (so a lead is never lost even when
 * transactional email is off), then a best-effort notification email is sent via Resend if
 * CONTACT_EMAIL + RESEND_API_KEY are configured.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(`contact:${getClientIp(req.headers)}`, 5, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a moment and try again." },
      { status: 429, headers: getRateLimitHeaders(rl) },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please fill in all fields correctly." },
      { status: 400 },
    );
  }
  const { name, email, message, plan, company, topic } = parsed.data;

  // Reject disposable / throwaway email domains (trims casual spam). Durable controls are the
  // per-IP rate limit above + the global caps; this just removes the obvious noise.
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a permanent email address - disposable addresses are not accepted." },
      { status: 400 },
    );
  }

  // 1) Persist (the source of truth - never lose a lead). Anonymous insert is allowed by RLS.
  const supabase = await createClient();
  const { error: insertErr } = await supabase
    .from("contact_requests")
    .insert({ name, email, message, plan: plan ?? null, company: company ?? null, topic: topic ?? null });
  if (insertErr) {
    console.error("[/api/contact] insert failed", insertErr);
    Sentry.captureException(insertErr);
    return NextResponse.json(
      { error: sanitizeErrorMessage(insertErr, "Could not submit your message. Please try again.") },
      { status: 500 },
    );
  }

  // 2) Notify the team. Prefer the n8n "Site IQ - Contact" workflow (-> Gmail) when configured;
  //    fall back to a direct Resend email. Best-effort: the lead is already saved, so a failure here
  //    never fails the request (and if n8n is unreachable we still try Resend).
  const subject = topic
    ? `Site IQ - ${topic} - from ${name}`
    : plan
      ? `Site IQ - ${plan} plan enquiry from ${name}`
      : `Site IQ - contact from ${name}`;
  const text =
    `New Site IQ contact${topic ? ` (${topic})` : plan ? ` (${plan} plan)` : ""}\n\n` +
    `From: ${name} (${email})\n` +
    (company ? `Company: ${company}\n` : "") +
    (plan ? `Plan: ${plan}\n` : "") +
    `\n${message}`;
  const html = `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>${
    company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ""
  }${topic ? `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` : ""}${
    plan ? `<p><strong>Plan:</strong> ${plan}</p>` : ""
  }<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  let notified = false;
  const n8nUrl = process.env.N8N_CONTACT_WEBHOOK_URL;
  const n8nSecret = process.env.SIS_WEBHOOK_SECRET;
  if (n8nUrl && n8nSecret) {
    try {
      const res = await fetch(n8nUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "X-SIS-Secret": n8nSecret },
        body: JSON.stringify({ name, email, message, plan: plan ?? null, company: company ?? null, topic: topic ?? null, subject, text }),
        signal: AbortSignal.timeout(8000),
      });
      notified = res.ok;
    } catch (err) {
      console.warn("[/api/contact] n8n contact webhook failed (lead is saved)", err);
    }
  }
  if (!notified && process.env.CONTACT_EMAIL) {
    try {
      await sendEmail({ to: process.env.CONTACT_EMAIL, subject, html });
    } catch (err) {
      console.warn("[/api/contact] notification email failed (lead is saved)", err);
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
