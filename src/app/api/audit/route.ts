import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitizeErrorMessage, getClientIp, isSameOriginRequest } from "@/lib/security";
import { env } from "@/lib/env";
import { rateLimit, getRateLimitHeaders, peekRateLimit } from "@/lib/rate-limit";
import { FREE_PLAN } from "@/lib/plan";
import { normalizeDomain } from "@/lib/domain";
import { isPrivateIp } from "@/lib/ssrf";
import * as Sentry from "@sentry/nextjs";
import { promises as dns } from "node:dns";

export const runtime = "nodejs";

/**
 * Mark a report as failed using the SERVICE-ROLE client (RLS-bypassing). reports.status is owned by the
 * backend: clients have no UPDATE policy on reports (migration 0012), which is what closes the
 * self-serve refund exploit (a client could otherwise PATCH status->error to fire the refund trigger).
 * This service-role write legitimately flips the row to 'error', which the refund trigger credits back.
 */
async function markReportError(reportId: string, message: string): Promise<void> {
  const admin = createServiceClient();
  if (!admin) {
    console.error("[/api/audit] service client unavailable - cannot mark report error", { reportId });
    return;
  }
  await admin.from("reports").update({ status: "error", error: message }).eq("id", reportId);
}

const bodySchema = z.object({
  domain: z.string().trim().min(3).max(255),
});

/**
 * POST /api/audit
 * Auth required. Creates a `reports` row (its id is the idempotency key) and triggers
 * the n8n "Site IQ - Audit" webhook. n8n runs the crawl/checks/score asynchronously and
 * writes progress + result back to Supabase; the client watches via Realtime.
 */
export async function POST(req: Request) {
  // Defense-in-depth CSRF: reject cross-origin cookie-authenticated mutations (don't rely solely on
  // the implicit SameSite=Lax cookie default).
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  if (env.AUDITS_ENABLED === "false") {
    return NextResponse.json(
      { error: "Audits are temporarily paused for maintenance. Please try again shortly." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid domain is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit on TWO dimensions - per user AND per IP - so an account farm behind one host is
  // still throttled. Each audit is an expensive n8n run (Firecrawl + OpenAI); the stricter wins.
  const userId = String(claims.claims.sub ?? "");
  const ip = getClientIp(req.headers);
  const [userRl, ipRl] = await Promise.all([
    rateLimit(`audit:${userId}`, 10, 60_000),
    rateLimit(`audit-ip:${ip}`, 20, 60_000),
  ]);
  const rl = userRl.success ? ipRl : userRl;
  if (!rl.success) {
    return NextResponse.json(
      { error: "You are starting audits too quickly. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) },
    );
  }

  // Validate + normalize the website first (an invalid domain must not burn a free-plan credit).
  const norm = normalizeDomain(parsed.data.domain);
  if (!norm.ok) {
    return NextResponse.json({ error: norm.error }, { status: 400 });
  }
  const { domain, rootUrl } = norm;

  // A syntactically-valid domain can still be non-existent: a fake TLD (e.g. "тест.цом" -> xn--e1aybc.
  // xn--l1adx), a typo, or a dead site. Resolve it via DNS BEFORE spending a free-plan credit + a
  // ~2-minute audit on something that can't be crawled. Fail open on a slow/transient resolver so a
  // real domain is never blocked by a DNS hiccup.
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let addresses: { address: string; family: number }[] = [];
  try {
    addresses = await Promise.race([
      dns.lookup(domain, { all: true }),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error("dns-timeout")), 3000);
      }),
    ]);
  } catch (err) {
    if ((err as Error).message !== "dns-timeout") {
      return NextResponse.json(
        { error: "We couldn't find that domain - please check the spelling (e.g. example.com)." },
        { status: 400 },
      );
    }
  } finally {
    if (dnsTimer) clearTimeout(dnsTimer);
  }

  // SSRF guard: normalizeDomain() rejects literal IPs and localhost, but a *public hostname* can still
  // resolve to an internal address (e.g. evil.example.com -> 169.254.169.254 cloud metadata, or
  // 127.0.0.1). Refuse the audit when ANY resolved address is non-public, since the crawler fetches
  // this host server-side. (On a dns-timeout we resolved nothing and fail open above; a determined
  // attacker could still DNS-rebind to a private IP after this check - the n8n crawler should also
  // refuse non-public targets as defense-in-depth.)
  if (addresses.length > 0 && addresses.some((a) => isPrivateIp(a.address))) {
    return NextResponse.json(
      { error: "That domain resolves to a private or reserved address, so it can't be audited." },
      { status: 400 },
    );
  }

  // Global daily circuit-breaker: a hard ceiling on total audits/day across ALL users, independent of
  // per-account quotas, so abuse or a viral spike can't run up an unbounded Firecrawl/OpenAI bill. We
  // only GATE here (read the current count); the slot is consumed once the audit actually starts (after
  // the n8n ack, below), so rejected attempts (user at quota) and failures (insert / n8n) never erode it.
  if (env.GLOBAL_DAILY_AUDIT_CAP) {
    // failClosed: a null count means the shared Postgres counter is unreachable - DENY rather than risk
    // an unbounded bill (the global cap must not silently disappear).
    const used = await peekRateLimit("global:audits", 86_400_000);
    if (used === null || used >= env.GLOBAL_DAILY_AUDIT_CAP) {
      return NextResponse.json(
        { error: "Site IQ is experiencing very high demand right now. Please try again later." },
        { status: 503 },
      );
    }
  }

  // Free-plan cap: atomically consume one audit credit for this UTC month (all users are Free today).
  // consume_audit_credit() increments the immutable `audit_usage` counter and returns the new count, or
  // -1 when the cap is already reached; the single UPDATE...RETURNING makes the check race-safe. It is
  // the only writer that INCREMENTS the counter. A credit is given back only by the refund trigger, on a
  // genuine reports.status -> 'error' transition written by the backend (this route via service-role, or
  // n8n) - clients have no UPDATE policy on reports (migration 0012), so a user can't fake a refund.
  const { data: newCount, error: capErr } = await supabase.rpc("consume_audit_credit", {
    p_max: FREE_PLAN.auditsPerMonth,
  });
  if (capErr) {
    console.error("[/api/audit] consume_audit_credit failed", capErr);
    return NextResponse.json({ error: "Could not verify your plan usage" }, { status: 500 });
  }
  if (newCount === -1) {
    return NextResponse.json(
      { error: `You have used all ${FREE_PLAN.auditsPerMonth} free audits this month. Your limit resets on the 1st.` },
      { status: 429 },
    );
  }

  // Pre-create the report row (user_id defaults to auth.uid() under RLS).
  const { data: report, error: insertErr } = await supabase
    .from("reports")
    .insert({ domain, root_url: rootUrl, status: "queued" })
    .select("id")
    .single();
  if (insertErr || !report) {
    console.error("[/api/audit] report insert failed", insertErr);
    // A credit was already consumed above, but the report row never existed - so the status->'error'
    // refund trigger can't fire. Refund the credit directly via service-role so a transient insert
    // failure doesn't silently cost the user one of their free audits. (period = current UTC month.)
    const admin = createServiceClient();
    if (admin) {
      await admin
        .rpc("refund_audit_credit", { p_user: userId, p_period: new Date().toISOString().slice(0, 7) })
        .then(({ error }) => {
          if (error) console.error("[/api/audit] credit refund after insert failure failed", error);
        });
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(insertErr, "Could not create the report") },
      { status: 500 },
    );
  }

  // Trigger the n8n audit workflow. Trust model: this is the only app -> n8n call; it carries a
  // static shared secret over TLS (X-SIS-Secret) that n8n verifies. n8n writes results straight back
  // to Supabase under its own service-role credential, gated by RLS - there is no inbound webhook
  // into this app, so nothing here needs body-signing.
  const webhookUrl = process.env.N8N_AUDIT_WEBHOOK_URL;
  const webhookSecret = process.env.SIS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) {
    console.error("[/api/audit] missing N8N_AUDIT_WEBHOOK_URL or SIS_WEBHOOK_SECRET");
    await markReportError(report.id, "Audit service is not configured");
    return NextResponse.json({ error: "The audit service is not configured" }, { status: 500 });
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "X-SIS-Secret": webhookSecret },
      body: JSON.stringify({ reportId: report.id, rootUrl, domain }),
      signal: AbortSignal.timeout(15_000), // the webhook acks fast (202); don't hang on a slow n8n
    });
    if (!res.ok) throw new Error(`n8n webhook responded ${res.status}`);
  } catch (err) {
    console.error("[/api/audit] n8n trigger failed", { reportId: report.id, err });
    Sentry.captureException(err);
    await markReportError(report.id, "Could not start the audit");
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "Could not start the audit") },
      { status: 502 },
    );
  }

  // The audit has actually started (n8n acked) - consume the global daily slot now. Counting only
  // started audits (not rejected/failed attempts) keeps the ceiling honest; a small over-count under
  // a concurrent burst is acceptable for a soft safety cap. Best-effort: the result is intentionally
  // not checked, so a counter blip can never fail an audit that already started. failClosed=true makes
  // an unreachable counter a clean no-op here, rather than a per-instance in-memory tally that would
  // diverge across serverless instances - the peek gate above is the real ceiling.
  if (env.GLOBAL_DAILY_AUDIT_CAP) {
    await rateLimit("global:audits", env.GLOBAL_DAILY_AUDIT_CAP, 86_400_000, true);
  }

  return NextResponse.json({ reportId: report.id }, { status: 202 });
}
