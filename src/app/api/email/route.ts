import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp, sanitizeErrorMessage } from "@/lib/security";
import { isAdminEmail } from "@/lib/admin";

// Lazy initialization to avoid build-time errors
let resend: Resend | null = null;
function getResend() {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

const emailSchema = z.object({
    to: z.string().email("Invalid email address"),
    subject: z.string().min(1, "Subject is required").max(200, "Subject too long"),
    html: z.string().min(1, "Email body is required"),
});

export async function POST(request: NextRequest) {
    try {
        // Authentication check - validate the JWT locally via getClaims (never getSession for trust).
        const supabase = await createClient();
        const { data: claims } = await supabase.auth.getClaims();
        if (!claims?.claims) {
            return NextResponse.json(
                { error: "Unauthorized - authentication required" },
                { status: 401 }
            );
        }

        // Admin-only: this endpoint sends arbitrary HTML email to any address. Restrict it to the
        // ADMIN_EMAILS allowlist so an ordinary signed-in user can never use it as an open relay.
        if (!isAdminEmail((claims.claims as { email?: string }).email)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Rate limiting - 10 emails per minute per IP
        const clientIp = getClientIp(request.headers);
        const rateLimitResult = await rateLimit(clientIp, 10, 60000);
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again later." },
                {
                    status: 429,
                    headers: getRateLimitHeaders(rateLimitResult),
                }
            );
        }

        // Check API key
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json(
                { error: "Email service not configured" },
                { status: 503 }
            );
        }

        const body = await request.json();
        const result = emailSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid request" },
                { status: 400 }
            );
        }

        const { to, subject, html } = result.data;

        const resendClient = getResend();
        if (!resendClient) {
            return NextResponse.json(
                { error: "Email service not initialized" },
                { status: 503 }
            );
        }

        const { data, error } = await resendClient.emails.send({
            from: process.env.EMAIL_FROM || "Site IQ <onboarding@resend.dev>",
            to: [to],
            subject,
            html,
        });

        if (error) {
            console.error("Resend error:", error);
            return NextResponse.json(
                { error: "Failed to send email" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, id: data?.id });
    } catch (error) {
        console.error("Email API error:", error);
        return NextResponse.json(
            { error: sanitizeErrorMessage(error, "Failed to send email") },
            { status: 500 }
        );
    }
}
