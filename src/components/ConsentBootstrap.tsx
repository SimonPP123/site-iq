/**
 * ConsentBootstrap - the inline <head> Consent Mode v2 default + dataLayer bootstrap, followed by the
 * GTM loader, emitted IN THAT ORDER as server-rendered <script> tags.
 *
 * WHY INLINE AND HAND-ROLLED (not @next/third-parties <GoogleTagManager>):
 *  - Site IQ's own audit check T20 requires that `gtag('consent','default')` appears in the static
 *    HTML BEFORE `googletagmanager.com/gtm.js`. <GoogleTagManager> injects the loader after hydration
 *    and emits no consent default, so it cannot satisfy T20 - and the default would race the loader.
 *  - Correctness (Simo Ahava / Analytics Mania): the Consent Mode default MUST run before any Google
 *    tag. An inline script in the real <head> is the only way to guarantee that in an App Router app.
 *  - T5 (gtag('consent'), T6 (ad_user_data + ad_personalization), T15 (window.dataLayer) all need
 *    these tokens present in the static HTML too - they are, below.
 *
 * GATED ON `NEXT_PUBLIC_GTM_ID`: if it is unset (dev / preview / prod-before-the-container-exists),
 * this component renders NOTHING - no bootstrap, no loader, no GTM. The site stays clean and the
 * consent banner (which is harmless without GTM) simply has no Google tag to talk to.
 *
 * The GTM-ID is a PUBLIC identifier (it ships in client HTML), so it is not a secret. It is read from
 * the environment rather than hardcoded so the public mirror repo carries no live container id.
 */

// The denied default block (Section 4.1). EU/EEA/UK/CH get an explicit region-scoped denied default;
// the unscoped default is a global fallback (also denied - Site IQ is an EU/Bulgaria operation and a
// default-deny-everywhere posture is the safest and still passes the audit). security_storage is the
// only signal granted by default (strictly-necessary). wait_for_update gives an async update 500ms.
const EU_EEA_UK_CH_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", // EU 27
  "IS", "LI", "NO", // EEA
  "GB", "CH", // UK + CH (privacy-aligned)
];

/**
 * The literal inline bootstrap. Kept as a hand-written string (not generated from the consent lib) so
 * the exact tokens T5/T6/T15/T20 grep for are guaranteed present verbatim in the static HTML, and so
 * it runs with zero imports before hydration. Reads the same `siteiq-consent` localStorage shape that
 * lib/consent.ts writes, to re-apply a returning visitor's prior grant synchronously.
 */
function buildBootstrap(): string {
  const denied = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  };
  const euDefault = JSON.stringify({ ...denied, region: EU_EEA_UK_CH_REGIONS });
  const globalDefault = JSON.stringify(denied);

  return `
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }

// 1) EU/EEA/UK/CH explicit default (denied)
gtag('consent', 'default', ${euDefault});

// 2) Global fallback default (also denied - conservative)
gtag('consent', 'default', ${globalDefault});

gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);

// 3) Re-apply a stored prior choice synchronously, so returning consenters are measured from the
//    first hit (no waiting for React to hydrate the banner).
(function(){
  try {
    var raw = localStorage.getItem('siteiq-consent');
    if (!raw) return;
    var c = JSON.parse(raw);
    if (!c || !c.cats) return;
    gtag('consent', 'update', {
      analytics_storage:       c.cats.analytics  ? 'granted' : 'denied',
      ad_storage:              c.cats.targeting  ? 'granted' : 'denied',
      ad_user_data:            c.cats.targeting  ? 'granted' : 'denied',
      ad_personalization:      c.cats.targeting  ? 'granted' : 'denied',
      functionality_storage:   c.cats.functional ? 'granted' : 'denied',
      personalization_storage: c.cats.functional ? 'granted' : 'denied'
    });
  } catch (e) { /* localStorage blocked - stay on denied defaults */ }
})();
`.trim();
}

/** The standard GTM loader snippet, with the container id interpolated. */
function buildGtmLoader(gtmId: string): string {
  // Standard Google Tag Manager snippet (no <noscript> iframe - dropped on purpose so no frame-src
  // CSP change is needed; no-JS users cannot run GA anyway).
  return `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`.trim();
}

export function ConsentBootstrap() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  // No container configured -> emit nothing. Dev/preview/prod-before-ID stays clean (no GTM at all).
  if (!gtmId) return null;

  return (
    <>
      {/* Consent Mode v2 default + dataLayer bootstrap. MUST be emitted BEFORE the GTM loader below
          (T20: the consent default's string index must precede the gtm.js loader's index). Uses the
          same dangerouslySetInnerHTML inline-script technique as the theme / JSON-LD scripts. */}
      <script dangerouslySetInnerHTML={{ __html: buildBootstrap() }} />
      {/* GTM loader (gtm.js). Comes AFTER the default block above. */}
      <script dangerouslySetInnerHTML={{ __html: buildGtmLoader(gtmId) }} />
    </>
  );
}
