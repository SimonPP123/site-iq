import { Resend } from "resend";

/**
 * Lazy-initialized Resend client
 * Prevents build-time errors when API key is not available
 */
let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
    if (!resendClient && process.env.RESEND_API_KEY) {
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return resendClient;
}

export interface EmailOptions {
    to: string;
    subject: string;
    react?: React.ReactNode;
    html?: string;
}

export interface EmailResult {
    success: boolean;
    id?: string;
    error?: string;
}

/**
 * Send an email using Resend
 * Supports both React components and raw HTML
 */
export async function sendEmail({
    to,
    subject,
    react,
    html,
}: EmailOptions): Promise<EmailResult> {
    if (!process.env.RESEND_API_KEY) {
        console.warn("[Email] RESEND_API_KEY is not set. Email not sent.");
        return { success: false, error: "Email service not configured" };
    }

    const client = getResendClient();
    if (!client) {
        return { success: false, error: "Failed to initialize email client" };
    }

    try {
        // Build email payload based on content type
        const baseOptions = {
            from: process.env.EMAIL_FROM || "Site IQ <onboarding@resend.dev>",
            to,
            subject,
        };

        let sendResult;

        // Prefer React component, fall back to HTML
        if (react) {
            sendResult = await client.emails.send({
                ...baseOptions,
                react,
            });
        } else if (html) {
            sendResult = await client.emails.send({
                ...baseOptions,
                html,
            });
        } else {
            return { success: false, error: "Email body is required (react or html)" };
        }

        const { data, error } = sendResult;

        if (error) {
            console.error("[Email] Send failed:", error);
            return { success: false, error: error.message };
        }

        return { success: true, id: data?.id };
    } catch (error) {
        console.error("[Email] Unexpected error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
