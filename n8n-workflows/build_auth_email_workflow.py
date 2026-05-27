#!/usr/bin/env python3
"""
Builds the "Site IQ - Auth Emails" n8n workflow (workflow D) for your-instance.app.n8n.cloud.

Routes ALL Supabase Auth transactional emails (signup confirm, password recovery, magic link,
email change, invite, reauthentication) through Gmail for free, instead of Supabase's built-in
SMTP. Supabase calls this as a "Send Email Hook" (Authentication -> Hooks) for every auth email:

  Send Email webhook (POST /webhook/site-iq-auth-email, responseNode, RAW BODY on)
    -> Verify & Build (Code, JS)
         1. Verifies the request is really from Supabase using Standard Webhooks
            (headers webhook-id / webhook-timestamp / webhook-signature; HMAC-SHA256 over
            `${id}.${timestamp}.${rawBody}` with the base64-decoded secret; constant-time compare;
            5-min timestamp tolerance for replay protection).
         2. Builds the Supabase verify URL + a clean on-brand HTML email per email_action_type.
    -> Valid?  (IF $json.valid === true)
         true  -> Send auth email (Gmail, HTML) -> Respond 200 ({})       <- Supabase: handled
         false -> Respond 401 ({ error })                                  <- Supabase: rejected

Why responseNode (not onReceived): we must return 200 ONLY after Gmail accepts the message, and a
non-2xx if anything fails so Supabase surfaces the error. The Gmail node has NO continue-on-error, so
a real send failure aborts the run and the responseNode webhook returns 500 (a non-2xx) to Supabase.

Signature scheme (Standard Webhooks, the scheme Supabase uses for Send-Email-Hook):
  signed_content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
  key            = base64decode( secret after the "v1,whsec_" prefix )
  expected       = base64( HMAC_SHA256(key, signed_content) )
  webhook-signature header = space-delimited list of "v1,<base64sig>"; accept if ANY matches.
Refs: standardwebhooks.com spec + Supabase "Send Email Hook" docs (verified 2026-05-25).

RAW BODY: Standard Webhooks signs the EXACT bytes of the body, so we must hash the raw body, not a
re-serialized object (JSON.stringify can reorder keys / drop whitespace and break the HMAC). The
Webhook node's Raw Body option is enabled; the Code node reads the raw bytes defensively (binary
base64 -> rawBody string -> canonical re-stringify) and tries each candidate against the signature,
so it is correct regardless of how this n8n version surfaces the raw body.

SECRET: the hook secret is read ONLY from an n8n environment variable, never hardcoded (this file is
in a PUBLIC repo). Set SUPABASE_SEND_EMAIL_HOOK_SECRET in n8n -> Settings -> Variables (or the
deployment env) to the secret Supabase generates (looks like `v1,whsec_...`). See the sticky note.

ONE-TIME MANUAL STEPS:
  1. (this script + deploy) creates + activates the workflow with the Gmail credential already wired.
  2. Owner pastes the hook secret into the Code node (above) and re-saves.
  3. Owner enables it in Supabase: Authentication -> Hooks -> Send Email Hook -> URI = the webhook URL,
     generate the secret, paste the SAME secret into the Code node. (Do this LAST - until then real
     auth emails keep flowing through Supabase's default SMTP.)

Run:    python3 n8n-workflows/build_auth_email_workflow.py   -> writes n8n-workflows/site-iq-auth-email.json
Deploy: POST (create) to https://your-instance.app.n8n.cloud/api/v1/workflows (X-N8N-API-KEY), then activate.
"""
import json
import uuid
from pathlib import Path

# Reuse the SAME Gmail OAuth2 credential already provisioned on monkata for the Contact workflow
# (verified live 2026-05-25 by GET-ing workflow eChcZhpjH7xef63v). No new credential needed.
CRED = {"gmail": {"id": "wnVGCzGOYR3M7ZNF", "name": "Site IQ Gmail"}}

# Site IQ Supabase project. Used to build the verify URL: <SUPABASE_URL>/auth/v1/verify?...
SUPABASE_URL = "https://pwnatkdjuczrzveesyiw.supabase.co"

# From email shown to the user. Gmail sends as the authenticated mailbox; this is the display From.
FROM_NAME = "Site IQ"

# Where the user lands after a successful confirm if Supabase did not pass a redirect_to. MUST be the
# live app origin (NOT siteiq.app, which is not where the app is hosted) so reset/magic-link flows land
# back in the app. Supabase normally passes redirect_to (its configured Site URL); this is the fallback.
DEFAULT_REDIRECT = "https://siteiq.monkata.ai"


# ---------------------------------------------------------------------------------------------------
# The "Verify & Build" Code node body. Kept as a Python string so the build is reproducible. This is
# the heart of the workflow: signature verification (security) + per-action email rendering (UX).
# ---------------------------------------------------------------------------------------------------
VERIFY_AND_BUILD_JS = r"""
// === Site IQ - Verify & Build (Supabase Send Email Hook) ==========================================
// 1) Verify the request is genuinely from Supabase (Standard Webhooks HMAC-SHA256).
// 2) Build the Supabase verify URL + a clean HTML email per email_action_type.
// On any auth/shape problem we DO NOT throw - we return { valid:false, reason } so the IF node can
// answer a clean 401 (a thrown error would be a 500 and look like a send failure).

const crypto = require('crypto');

// --- CONFIG ---------------------------------------------------------------------------------------
const SUPABASE_URL = '__SUPABASE_URL__';
const FROM_NAME = '__FROM_NAME__';
const DEFAULT_REDIRECT = '__DEFAULT_REDIRECT__';
const TOLERANCE_SECONDS = 300; // replay-protection window for webhook-timestamp (5 min, per spec)

// The hook secret Supabase shows you (looks like "v1,whsec_<base64>") is read ONLY from n8n config -
// NEVER hardcoded (this file lives in a PUBLIC repo). Read from an n8n **Variable** named
// SUPABASE_SEND_EMAIL_HOOK_SECRET (Cloud: Settings -> Variables). NOTE: n8n Cloud BLOCKS $env in Code
// nodes, so we use $vars (allowed). Wrapped in try/catch so a missing var can never throw.
let RAW_SECRET = '';
try { if (typeof $vars !== 'undefined' && $vars.SUPABASE_SEND_EMAIL_HOOK_SECRET) RAW_SECRET = $vars.SUPABASE_SEND_EMAIL_HOOK_SECRET; } catch (e) {}
try { if (!RAW_SECRET && typeof $env !== 'undefined' && $env.SUPABASE_SEND_EMAIL_HOOK_SECRET) RAW_SECRET = $env.SUPABASE_SEND_EMAIL_HOOK_SECRET; } catch (e) {}

// --- helpers --------------------------------------------------------------------------------------
function fail(reason) { return [{ json: { valid: false, reason: reason } }]; }

function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

// Constant-time compare of two base64 signature strings (avoids timing side-channels).
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a, 'base64');
    const bb = Buffer.from(b, 'base64');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (e) { return false; }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- pull the item / webhook fields ---------------------------------------------------------------
const item = $input.first();
const headers = item.json.headers || {};
const body = item.json.body || {};

// --- gather candidate raw-body representations ----------------------------------------------------
// Standard Webhooks signs the EXACT request bytes. With the webhook "Raw Body" option on, n8n may
// surface those bytes as binary (base64) OR as $json.rawBody (string), depending on version. We try
// every candidate against the signature so verification holds regardless of representation.
const rawCandidates = [];
try {
  if (item.binary && item.binary.data && item.binary.data.data) {
    rawCandidates.push(Buffer.from(item.binary.data.data, 'base64').toString('utf8'));
  }
} catch (e) { /* ignore */ }
if (typeof item.json.rawBody === 'string') rawCandidates.push(item.json.rawBody);
if (item.json.rawBody && item.json.rawBody.type === 'Buffer' && Array.isArray(item.json.rawBody.data)) {
  try { rawCandidates.push(Buffer.from(item.json.rawBody.data).toString('utf8')); } catch (e) {}
}
// Last-resort canonical re-stringify of the parsed body (works when Supabase emits compact JSON).
try { rawCandidates.push(JSON.stringify(body)); } catch (e) {}
// De-duplicate while preserving order.
const seen = new Set();
const candidates = rawCandidates.filter(c => (typeof c === 'string') && !seen.has(c) && seen.add(c));

// --- Standard Webhooks signature verification -----------------------------------------------------
const id = getHeader(headers, 'webhook-id');
const ts = getHeader(headers, 'webhook-timestamp');
const sigHeader = getHeader(headers, 'webhook-signature');

if (!id || !ts || !sigHeader) return fail('missing Standard Webhooks headers (webhook-id/timestamp/signature)');

// Replay protection: reject timestamps outside the tolerance window.
const now = Math.floor(Date.now() / 1000);
const tsNum = parseInt(ts, 10);
if (!Number.isFinite(tsNum)) return fail('invalid webhook-timestamp');
if (Math.abs(now - tsNum) > TOLERANCE_SECONDS) return fail('webhook-timestamp outside tolerance (possible replay)');

// Derive HMAC key: strip the "v1,whsec_" (or bare "whsec_") prefix, base64-decode the remainder.
if (!RAW_SECRET) {
  return fail('hook secret not configured - set the SUPABASE_SEND_EMAIL_HOOK_SECRET variable in n8n');
}
const secretB64 = RAW_SECRET.replace(/^v1,/, '').replace(/^whsec_/, '');
let key;
try { key = Buffer.from(secretB64, 'base64'); } catch (e) { return fail('hook secret is not valid base64'); }
if (!key || key.length === 0) return fail('hook secret decoded to empty key');

// The header is a space-delimited list of "<version>,<base64sig>" (supports key rotation). Collect
// the v1 signatures Supabase sent.
const presented = String(sigHeader).split(' ')
  .map(s => s.trim()).filter(Boolean)
  .map(s => { const i = s.indexOf(','); return i === -1 ? s : s.slice(i + 1); });

// Accept if ANY (raw-body candidate x presented signature) pair matches our HMAC.
let valid = false;
for (const raw of candidates) {
  const signed = `${id}.${ts}.${raw}`;
  const expected = crypto.createHmac('sha256', key).update(signed, 'utf8').digest('base64');
  for (const got of presented) { if (safeEqual(expected, got)) { valid = true; break; } }
  if (valid) break;
}
if (!valid) return fail('signature mismatch - request not verified as coming from Supabase');

// === verified - build the email ===================================================================
const ed = body.email_data || {};
const user = body.user || {};
const actionType = ed.email_action_type || 'signup';
const redirectTo = ed.redirect_to || user.redirect_to || DEFAULT_REDIRECT;

// Supabase verify URL: <SUPABASE_URL>/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<...>
// NB: the query param is literally named "token" but carries the token_HASH value (per Supabase docs).
function verifyUrl(tokenHash, type) {
  const qs = 'token=' + encodeURIComponent(tokenHash || '') + '&type=' + encodeURIComponent(type || '') + '&redirect_to=' + encodeURIComponent(redirectTo);
  return `${SUPABASE_URL}/auth/v1/verify?${qs}`;
}

// Per-action copy. Each entry: { subject, heading, intro, cta, type, tokenHash, recipient, outro }.
// type is the value put in the verify URL's ?type=; for signup the URL type is "email" (Supabase
// convention) while the action is "signup".
let spec;
const toEmail = user.email;          // default recipient
switch (actionType) {
  case 'signup':
    spec = { subject: 'Confirm your email for Site IQ', heading: 'Confirm your email',
             intro: 'Thanks for signing up for Site IQ. Confirm your email address to activate your account.',
             cta: 'Confirm email', type: 'email', tokenHash: ed.token_hash, recipient: toEmail,
             outro: 'If you did not create a Site IQ account, you can safely ignore this email.' };
    break;
  case 'recovery':
    spec = { subject: 'Reset your Site IQ password', heading: 'Reset your password',
             intro: 'We received a request to reset the password for your Site IQ account. Click below to choose a new password.',
             cta: 'Reset password', type: 'recovery', tokenHash: ed.token_hash, recipient: toEmail,
             outro: 'If you did not request a password reset, you can safely ignore this email - your password will not change.' };
    break;
  case 'magiclink':
    spec = { subject: 'Your Site IQ sign-in link', heading: 'Your sign-in link',
             intro: 'Click the button below to sign in to Site IQ. This link will sign you in instantly.',
             cta: 'Sign in to Site IQ', type: 'magiclink', tokenHash: ed.token_hash, recipient: toEmail,
             outro: 'If you did not try to sign in, you can safely ignore this email.' };
    break;
  case 'invite':
    spec = { subject: 'You have been invited to Site IQ', heading: 'You have been invited',
             intro: 'You have been invited to join Site IQ. Accept the invitation to set up your account.',
             cta: 'Accept invitation', type: 'invite', tokenHash: ed.token_hash, recipient: toEmail,
             outro: 'If you were not expecting this invitation, you can safely ignore this email.' };
    break;
  case 'reauthentication':
    // Reauthentication sends a 6-digit OTP (ed.token), not a link.
    spec = { subject: 'Your Site IQ verification code', heading: 'Verification code',
             intro: 'Enter this code to confirm it is you:', cta: null, type: null, tokenHash: null,
             recipient: toEmail, code: ed.token,
             outro: 'If you did not request this, you can safely ignore this email.' };
    break;
  case 'email_change': {
    // Secure Email Change can send TWO emails (one to the old address, one to the new). The token/hash
    // field names are REVERSED for backward-compat (Supabase docs):
    //   - to the CURRENT email (user.email):  use token_hash_new
    //   - to the NEW email     (user.new_email): use token_hash
    // We emit one item per address that is present, each confirming the change.
    const newEmail = user.new_email || ed.new_email;
    const outItems = [];
    const base = { subject: 'Confirm your email change for Site IQ', heading: 'Confirm your new email',
                   cta: 'Confirm email change', type: 'email_change',
                   outro: 'If you did not request to change your email, contact support immediately.' };
    if (toEmail && ed.token_hash_new) {
      outItems.push({ ...base,
        intro: `Confirm the change of your Site IQ email to ${escapeHtml(newEmail || '')}.`,
        tokenHash: ed.token_hash_new, recipient: toEmail });
    }
    if (newEmail && ed.token_hash) {
      outItems.push({ ...base,
        intro: 'Confirm this address as the new email for your Site IQ account.',
        tokenHash: ed.token_hash, recipient: newEmail });
    }
    if (outItems.length === 0) return fail('email_change payload missing token hashes / recipients');
    return outItems.map(s => ({ json: buildEmail(s) }));
  }
  default:
    // Unknown / notification-only action types (password_changed_notification, etc.). Supabase still
    // expects a 200; render a generic notice rather than failing the hook.
    spec = { subject: 'Site IQ account notification', heading: 'Account notification',
             intro: `A "${escapeHtml(actionType)}" event occurred on your Site IQ account.`, cta: null,
             type: null, tokenHash: null, recipient: toEmail,
             outro: 'If this was not you, please review your account security.' };
}

return [{ json: buildEmail(spec) }];

// --- email renderer -------------------------------------------------------------------------------
function buildEmail(s) {
  const link = s.tokenHash ? verifyUrl(s.tokenHash, s.type) : null;
  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr><td style="border-radius:8px;background:#4f46e5;">
           <a href="${link}" target="_blank"
              style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
              ${escapeHtml(s.cta)}</a>
         </td></tr>
       </table>
       <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 4px;">Or paste this link into your browser:</p>
       <p style="font-size:13px;line-height:1.6;color:#4f46e5;word-break:break-all;margin:0 0 8px;">
         <a href="${link}" target="_blank" style="color:#4f46e5;">${escapeHtml(link)}</a></p>`
    : '';
  const codeBlock = s.code
    ? `<div style="margin:24px 0;font-family:Arial,Helvetica,sans-serif;">
         <span style="display:inline-block;padding:14px 28px;font-size:30px;letter-spacing:8px;font-weight:700;color:#111827;background:#f3f4f6;border-radius:10px;">
           ${escapeHtml(s.code)}</span>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#111827;padding:20px 32px;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.5px;">Site IQ</span>
        </td></tr>
        <tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <h1 style="margin:0 0 12px;font-size:21px;font-weight:700;color:#111827;">${escapeHtml(s.heading)}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#374151;">${s.intro}</p>
          ${button}${codeBlock}
          <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">${escapeHtml(s.outro)}</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">Site IQ - automated website intelligence. This is an automated message; please do not reply.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return {
    valid: true,
    action: actionType,
    to: s.recipient,
    fromName: FROM_NAME,
    subject: s.subject,
    html: html,
  };
}
"""

VERIFY_AND_BUILD_JS = (
    VERIFY_AND_BUILD_JS
    .replace("__SUPABASE_URL__", SUPABASE_URL)
    .replace("__FROM_NAME__", FROM_NAME)
    .replace("__DEFAULT_REDIRECT__", DEFAULT_REDIRECT)
)


_NID_SEQ = 0
def nid():
    # Deterministic node ids so the emitted JSON is byte-stable across rebuilds (a reproducible build),
    # matching build_audit_workflow.py / build_chat_workflow.py.
    global _NID_SEQ
    _NID_SEQ += 1
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"site-iq-auth-email:{_NID_SEQ}"))


def node(name, ntype, tv, params, pos, creds=None, extra=None):
    n = {"parameters": params, "id": nid(), "name": name, "type": ntype, "typeVersion": tv, "position": pos}
    if creds:
        n["credentials"] = creds
    if extra:
        n.update(extra)
    return n


# --- nodes ----------------------------------------------------------------------------------------
# Webhook: POST, responseNode (we control status), RAW BODY ON (needed for HMAC over exact bytes).
# No n8n-level auth on the webhook itself - authenticity is proven by the Standard Webhooks signature
# in the Code node (Supabase cannot send a custom auth header, only the signature headers).
# NB: deliberately NO onError:continueRegularOutput here. In responseNode mode that would make a
# downstream failure ack an empty 200 - a SECURITY hole (a failed signature check must never look
# "handled"). Without it, any unexpected error surfaces as a non-2xx (500), which is what we want
# Supabase to see. The verify Code node returns {valid:false} (-> clean 401) rather than throwing.
n_webhook = node("Send Email webhook", "n8n-nodes-base.webhook", 2.1, {
    "httpMethod": "POST", "path": "site-iq-auth-email", "responseMode": "responseNode",
    "options": {"rawBody": True},
}, [0, 300])

n_verify = node("Verify & Build", "n8n-nodes-base.code", 2, {
    "mode": "runOnceForAllItems", "language": "javaScript", "jsCode": VERIFY_AND_BUILD_JS,
}, [240, 300])

# IF the Code node marked the request valid. true -> send; false -> 401.
n_if = node("Valid?", "n8n-nodes-base.if", 2.3, {
    "conditions": {
        "options": {"version": 2, "caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
        "combinator": "and",
        "conditions": [{
            "id": nid(),
            "leftValue": "={{ $json.valid }}",
            "rightValue": True,
            "operator": {"type": "boolean", "operation": "true", "singleValue": True},
        }],
    },
    "looseTypeValidation": True,
    "options": {},
}, [480, 300])

# Gmail send (HTML). REUSES the Contact workflow's Gmail OAuth2 credential. NO continue-on-error: a
# genuine send failure must abort the run so the responseNode webhook returns a non-2xx to Supabase.
n_gmail = node("Send auth email", "n8n-nodes-base.gmail", 2.2, {
    "resource": "message", "operation": "send",
    "sendTo": "={{ $json.to }}",
    "subject": "={{ $json.subject }}",
    "emailType": "html",
    "message": "={{ $json.html }}",
    "options": {"senderName": FROM_NAME, "appendAttribution": False},
}, [720, 200], creds={"gmailOAuth2": CRED["gmail"]},
    extra={"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 2000})

# 200 OK with empty JSON {} - Supabase treats the email as handled.
n_resp_ok = node("Respond 200", "n8n-nodes-base.respondToWebhook", 1.5, {
    "respondWith": "json", "responseBody": "={{ {} }}", "options": {"responseCode": 200},
}, [960, 200])

# 401 when the signature/shape check failed - Supabase surfaces it and keeps its own SMTP path safe.
n_resp_401 = node("Respond 401", "n8n-nodes-base.respondToWebhook", 1.5, {
    "respondWith": "json",
    "responseBody": "={{ { error: 'unauthorized', message: $json.reason } }}",
    "options": {"responseCode": 401},
}, [720, 420])

nodes = [n_webhook, n_verify, n_if, n_gmail, n_resp_ok, n_resp_401]

connections = {
    n_webhook["name"]: {"main": [[{"node": n_verify["name"], "type": "main", "index": 0}]]},
    n_verify["name"]: {"main": [[{"node": n_if["name"], "type": "main", "index": 0}]]},
    n_if["name"]: {"main": [
        [{"node": n_gmail["name"], "type": "main", "index": 0}],      # true  -> send
        [{"node": n_resp_401["name"], "type": "main", "index": 0}],   # false -> 401
    ]},
    n_gmail["name"]: {"main": [[{"node": n_resp_ok["name"], "type": "main", "index": 0}]]},
}

# --- sticky notes (operator instructions on the canvas) -------------------------------------------
notes = [
    node("note-1", "n8n-nodes-base.stickyNote", 1, {
        "content": (
            "## Site IQ - Supabase Auth Emails -> Gmail\n"
            "Supabase calls this **Send Email Hook** for every auth email (signup / recovery / "
            "magic link / email change / invite). It verifies the **Standard Webhooks** signature, "
            "builds an on-brand HTML email per action type, and sends it via the existing Gmail "
            "credential.\n\n"
            "**Webhook URL (production):**\n"
            "`https://your-instance.app.n8n.cloud/webhook/site-iq-auth-email`"
        ),
        "height": 300, "width": 460, "color": 4}, [-40, -60]),
    node("note-2", "n8n-nodes-base.stickyNote", 1, {
        "content": (
            "### REQUIRED: set the hook secret (env var, NOT hardcoded)\n"
            "Add an n8n variable **`SUPABASE_SEND_EMAIL_HOOK_SECRET`** = the secret Supabase generates "
            "(looks like `v1,whsec_...`). The **Verify & Build** node reads it via `$vars`/`$env`.\n\n"
            "- **n8n Cloud:** Settings -> Variables -> add the variable.\n"
            "- **self-host:** set it as an environment variable on the n8n process.\n\n"
            "### Turn it on in Supabase (do LAST)\n"
            "Dashboard -> **Authentication -> Hooks -> Send Email Hook** -> **Enable** -> "
            "type **HTTPS** -> URI = the webhook URL on the left -> **Generate secret** -> paste the "
            "SAME secret into this node. Until you do this, real auth emails keep using Supabase SMTP."
        ),
        "height": 300, "width": 460, "color": 3}, [440, -60]),
]

workflow = {
    "name": "Site IQ - Auth Emails",
    "nodes": notes + nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
}

out = Path(__file__).parent / "site-iq-auth-email.json"
out.write_text(json.dumps(workflow, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"wrote {out.name}: {len(nodes)} nodes, {len(connections)} connection sources")
