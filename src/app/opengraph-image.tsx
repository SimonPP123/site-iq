import { ImageResponse } from "next/og";

// Branded social-share card (1200x630). Auto-applied as og:image + twitter:image for the site.
export const alt = "Site IQ - Website Intelligence Reports";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a0b0d 0%, #111418 100%)",
          color: "#f5f6f7",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9999,
              background: "#7c6cff",
              boxShadow: "0 0 24px #7c6cff",
            }}
          />
          <span style={{ fontSize: 30, fontWeight: 600, color: "#9aa3ad" }}>Site IQ</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            One 0-100 grade for
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: "#a78bfa" }}>
            any website.
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#9aa3ad", maxWidth: 900 }}>
            SEO, tracking, AI-readiness (GEO) and tech - with a plain-English summary and a chat.
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 26, color: "#7c8693" }}>
          <span>58 deterministic checks</span>
          <span>•</span>
          <span>Results in ~2 minutes</span>
          <span>•</span>
          <span>siteiq.monkata.ai</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
