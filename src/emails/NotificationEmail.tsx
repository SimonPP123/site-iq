/**
 * NotificationEmail - React Email 5.0 Template
 *
 * Features:
 * - Dark mode support via CSS media queries
 * - Tailwind v4 compatible styles
 * - Accessible color contrast
 */
import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Text,
} from "@react-email/components";

interface NotificationEmailProps {
    title?: string;
    message?: string;
    ctaText?: string;
    ctaUrl?: string;
    appName?: string;
    unsubscribeUrl?: string;
    preferencesUrl?: string;
    companyAddress?: string;
}

export function NotificationEmail({
    title = "New Notification",
    message = "You have a new notification.",
    ctaText,
    ctaUrl,
    appName = "Site IQ",
    unsubscribeUrl = "https://app.example.com/unsubscribe",
    preferencesUrl = "https://app.example.com/preferences",
    companyAddress = "123 Main Street, San Francisco, CA 94102",
}: NotificationEmailProps) {
    return (
        <Html>
            <Head>
                {/* React Email 5.0: Dark mode support */}
                <style>
                    {`
                        @media (prefers-color-scheme: dark) {
                            .email-body { background-color: #0a0a0a !important; }
                            .email-container { background-color: #171717 !important; }
                            .email-heading { color: #fafafa !important; }
                            .email-text { color: #a3a3a3 !important; }
                            .email-hr { border-color: #262626 !important; }
                            .email-footer { color: #737373 !important; }
                        }
                    `}
                </style>
            </Head>
            <Preview>{title}</Preview>
            <Body style={main} className="email-body">
                <Container style={container} className="email-container">
                    <Heading style={heading} className="email-heading">{title}</Heading>

                    <Text style={paragraph} className="email-text">{message}</Text>

                    {ctaText && ctaUrl && (
                        <Text style={paragraph} className="email-text">
                            <Link href={ctaUrl} style={link}>
                                {ctaText}
                            </Link>
                        </Text>
                    )}

                    <Hr style={hr} className="email-hr" />

                    <Text style={footer} className="email-footer">
                        This notification was sent by {appName}.
                        <br />
                        <Link href={preferencesUrl} style={link}>
                            Notification preferences
                        </Link>
                        {" | "}
                        <Link href={unsubscribeUrl} style={link}>
                            Unsubscribe
                        </Link>
                    </Text>

                    {/* CAN-SPAM Compliance: Physical address */}
                    <Text style={addressFooter} className="email-footer">
                        {companyAddress}
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}

export default NotificationEmail;

// Light mode styles (default)
const main = {
    backgroundColor: "#f6f9fc",
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "40px",
    marginBottom: "64px",
    borderRadius: "8px",
    maxWidth: "600px",
};

const heading = {
    fontSize: "20px",
    fontWeight: "bold" as const,
    color: "#1a1a1a",
    marginBottom: "16px",
};

const paragraph = {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#525252",
};

const link = {
    color: "#2563eb",
    textDecoration: "underline",
};

const hr = {
    borderColor: "#e5e5e5",
    margin: "32px 0",
};

const footer = {
    color: "#8c8c8c",
    fontSize: "12px",
    lineHeight: "20px",
};

const addressFooter = {
    color: "#8c8c8c",
    fontSize: "11px",
    lineHeight: "16px",
    textAlign: "center" as const,
    marginTop: "16px",
};
