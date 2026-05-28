import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizeErrorMessage, getClientIp, isSameOriginRequest } from "@/lib/security";
import { env } from "@/lib/env";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { FREE_PLAN } from "@/lib/plan";
import * as Sentry from "@sentry/nextjs";
import { parseAuditResult } from "@/lib/audit/contract";

export const runtime = "nodejs";

const bodySchema = z.object({
  reportId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

/** Compact, plain-text scorecard from the structured result so the chat agent can answer questions
 *  about the audit itself (scores, grade, what to fix) - not just the crawled page content. The
 *  result is validated by the shared parseAuditResult contract, never blindly cast. */
function buildScorecard(raw: unknown): string {
  const r = parseAuditResult(raw);
  if (!r) return "";
  const dims = r.dimensions
    .map((d) => `${d.label} ${d.score}/100${d.capped ? " (capped by a critical issue)" : ""}`)
    .join("; ");
  const top = r.actionPlan.slice(0, 6).map((a) => `- ${a.finding} [${a.severity}]`).join("\n");
  return `Overall: ${r.overall}/100 (grade ${r.grade}).\nDimensions: ${dims}.\nTop findings to fix:\n${top}`;
}

/**
 * POST /api/chat
 * Auth required. Answers a question about a single report via the n8n "Site IQ - Chat" RAG
 * workflow (vector search over the report's crawled pages, scoped by report_id).
 *
 * Two layers of tenant isolation: (1) we confirm the caller owns the report under RLS before
 * forwarding, and (2) the n8n vector-store tool filters retrieval to metadata.report_id. The
 * request is synchronous - the agent answers in one round-trip.
 */
export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  if (env.CHAT_ENABLED === "false") {
    return NextResponse.json(
      { error: "Chat is temporarily paused for maintenance. Please try again shortly." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "reportId and a non-empty message are required" }, { status: 400 });
  }
  const { reportId, message } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit per user AND per IP (the chat agent calls an LLM on every turn); the stricter wins.
  const userId = String(claims.claims.sub ?? "");
  const ip = getClientIp(req.headers);
  const [userRl, ipRl] = await Promise.all([
    rateLimit(`chat:${userId}`, 30, 60_000),
    rateLimit(`chat-ip:${ip}`, 60, 60_000),
  ]);
  const rl = userRl.success ? ipRl : userRl;
  if (!rl.success) {
    return NextResponse.json(
      { error: "You are sending messages too quickly. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) },
    );
  }

  // Ownership gate: RLS only returns this row if it belongs to the caller.
  const { data: report } = await supabase
    .from("reports")
    .select("id, status, result")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.status !== "done") {
    return NextResponse.json({ error: "The report is not ready to chat yet" }, { status: 409 });
  }

  // Corpus guard: a report can be 'done' (its score is valid) while its page embeddings failed or
  // were never written - the embed step in n8n runs AFTER the status flips and is non-blocking, so
  // an embed failure leaves status='done' with zero documents. Chat is a RAG over those embeddings;
  // with no corpus it would "answer" blind from only the scorecard. Tell the user the page content
  // is unavailable instead of pretending to answer from the pages. (RLS scopes the count to the
  // caller's own report; text-compare policy from migration 0020.)
  const { count: docCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .filter("metadata->>report_id", "eq", reportId);
  if (!docCount || docCount === 0) {
    return NextResponse.json(
      { error: "Chat for this report isn't available yet - its page content could not be indexed. Try re-running the audit." },
      { status: 409 },
    );
  }

  // Free-plan per-audit message cap, consumed ATOMICALLY. consume_chat_message locks the report row,
  // counts existing user messages, and inserts THIS user message in one transaction, returning the
  // new message id (>0), -1 over cap, or 0 if the caller does not own the report. This closes the
  // read-then-write overspend where N concurrent requests all passed an under-cap read before any
  // insert landed and all fired the paid LLM call. A failed LLM turn below still counts the message
  // (it was sent) - acceptable for cost control, and chat_messages has no user DELETE policy to
  // refund through anyway.
  const { data: reserved, error: capErr } = await supabase.rpc("consume_chat_message", {
    p_report_id: reportId,
    p_content: message,
    p_max: FREE_PLAN.chatMessagesPerAudit,
  });
  if (capErr) {
    console.error("[/api/chat] consume_chat_message failed", capErr);
    return NextResponse.json({ error: "Could not verify your chat usage" }, { status: 500 });
  }
  const reservedId = Number(reserved);
  if (reservedId === -1) {
    return NextResponse.json(
      { error: `You have used all ${FREE_PLAN.chatMessagesPerAudit} chat messages for this audit on the free plan.` },
      { status: 429 },
    );
  }
  if (!reservedId || reservedId <= 0) {
    // 0 = not the owner (shouldn't happen - ownership gated above - but never proceed without a slot).
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Compact scorecard so the agent can answer "why did I get a B / what should I fix?" from the real
  // numbers (not just the crawled page text). Built from the structured result.
  const scorecard = buildScorecard(report.result);

  // Conversational memory is handled inside the n8n workflow by a Simple Memory node keyed by reportId
  // (it persists the turn-by-turn history across messages), so we don't pass prior turns here.
  const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;
  const webhookSecret = process.env.SIS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) {
    console.error("[/api/chat] missing N8N_CHAT_WEBHOOK_URL or SIS_WEBHOOK_SECRET");
    return NextResponse.json({ error: "The assistant is not configured" }, { status: 500 });
  }
  try {
    // We forward the user's question as-is (already zod-trimmed + length-capped above) - no regex
    // scrubbing, which would mangle legitimate questions for little gain. Prompt-injection defense
    // lives primarily in the n8n workflow's system prompt, which is the authoritative fence that
    // constrains the agent's tools and scope regardless of what the message text contains.
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "X-SIS-Secret": webhookSecret },
      body: JSON.stringify({ reportId, message, scorecard }),
      signal: AbortSignal.timeout(45_000), // bound the server wait; the client also times out at 60s
    });
    if (!res.ok) throw new Error(`n8n chat webhook responded ${res.status}`);
    const data = (await res.json().catch(() => null)) as { answer?: string } | null;
    const answer = data?.answer?.trim();
    if (!answer) throw new Error("The assistant returned an empty answer");

    // The USER message was already persisted atomically by consume_chat_message (the cap reservation);
    // persist only the assistant reply now so the conversation continues across visits.
    const { error: persistErr } = await supabase
      .from("chat_messages")
      .insert([{ report_id: reportId, role: "assistant", content: answer }]);
    if (persistErr) console.error("[/api/chat] assistant persist failed", persistErr);

    return NextResponse.json({ answer });
  } catch (err) {
    // Log the real cause server-side; the client only ever sees the sanitized message.
    console.error("[/api/chat] failed", { reportId, err });
    Sentry.captureException(err);
    return NextResponse.json(
      { error: sanitizeErrorMessage(err, "The assistant is unavailable right now") },
      { status: 502 },
    );
  }
}
