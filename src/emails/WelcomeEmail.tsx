/**
 * WelcomeEmail - React Email 5.0 Template
 *
 * Features:
 * - Dark mode support via CSS media queries
 * - Tailwind v4 compatible styles
 * - Accessible color contrast
 */
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";

interface WelcomeEmailProps {
    userName?: string;
    appName?: string;
    dashboardUrl?: string;
    unsubscribeUrl?: string;
    companyAddress?: string;
}

export function WelcomeEmail({
    userName = "there",
    appName = "Site IQ",
    dashboardUrl = "https://app.example.com/dashboard",
    unsubscribeUrl = "https://app.example.com/unsubscribe",
    companyAddress = "123 Main Street, San Francisco, CA 94102",
}: WelcomeEmailProps) {
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
            <Preview>Welcome to {appName} - Let&apos;s get started!</Preview>
            <Body style={main} className="email-body">
                <Container style={container} className="email-container">
                    <Heading style={heading} className="email-heading">
                        Welcome to {appName}!
                    </Heading>

                    <Text style={paragraph} className="email-text">
                        Hey {userName},
                    </Text>

                    <Text style={paragraph} className="email-text">
                        Thanks for signing up! We&apos;re excited to have you on board.
                        Your account is now ready and you can start exploring all the features.
                    </Text>

                    <Section style={buttonContainer}>
                        <Button style={button} href={dashboardUrl}>
                            Go to Dashboard
                        </Button>
                    </Section>

                    <Text style={paragraph} className="email-text">
                        If you have any questions, feel free to reply to this email.
                        We&apos;re here to help!
                    </Text>

                    <Hr style={hr} className="email-hr" />

                    <Text style={footer} className="email-footer">
                        You&apos;re receiving this email because you signed up for {appName}.
                        <br />
                        <Link href={dashboardUrl} style={link}>
                            Manage your account
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

export default WelcomeEmail;

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
    fontSize: "24px",
    fontWeight: "bold" as const,
    color: "#1a1a1a",
    marginBottom: "24px",
};

const paragraph = {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#525252",
};

const buttonContainer = {
    textAlign: "center" as const,
    margin: "32px 0",
};

const button = {
    backgroundColor: "#2563eb",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "bold" as const,
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 24px",
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

const link = {
    color: "#2563eb",
    textDecoration: "underline",
};

const addressFooter = {
    color: "#8c8c8c",
    fontSize: "11px",
    lineHeight: "16px",
    textAlign: "center" as const,
    marginTop: "16px",
};
