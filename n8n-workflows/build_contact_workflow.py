#!/usr/bin/env python3
"""
Builds the "Site IQ - Contact" n8n workflow (workflow C) for your-instance.app.n8n.cloud.

A contact-form lead -> Gmail notification to the team. The app's /api/contact persists the lead to
Supabase (source of truth) and then POSTs { name, email, message, subject, text, ... } with the
X-SIS-Secret header to this webhook; the webhook acks immediately (responseMode onReceived) and a
Gmail "send" node emails the team inbox.

  Contact webhook (headerAuth, POST /webhook/site-contact)
    -> Send Gmail (resource: message, operation: send -> the team inbox)

ONE-TIME MANUAL STEP: open the workflow in n8n and connect a Google (Gmail OAuth2) credential on the
"Send Gmail" node (the OAuth consent can't be scripted via the API). Then activate the workflow and
set N8N_CONTACT_WEBHOOK_URL in the app's env (Vercel) to the production webhook URL.

Run:    python3 n8n-workflows/build_contact_workflow.py   -> writes n8n-workflows/site-iq-contact.json
Deploy: POST to https://your-instance.app.n8n.cloud/api/v1/workflows (X-N8N-API-KEY).
"""
import json
import os
import uuid
from pathlib import Path

# Reuse the header-auth credential already provisioned on monkata (the same X-SIS-Secret the audit +
# chat webhooks verify). The Gmail credential is connected by hand in the n8n UI (OAuth).
CRED = {"sisHeader": {"id": "pWOZFCJrd3fw64u9", "name": "Site IQ Webhook Secret"}}
# Where contact-form leads are emailed. Set SITE_IQ_TEAM_INBOX to your inbox before building;
# the default is a placeholder so the committed workflow JSON carries no real address.
TEAM_INBOX = os.environ.get("SITE_IQ_TEAM_INBOX", "team@example.com")


_NID_SEQ = 0
def nid():
    # Deterministic node ids so the emitted JSON is byte-stable across rebuilds (a reproducible build),
    # matching build_audit_workflow.py. uuid5 over a per-build sequence keeps ids unique + repeatable.
    global _NID_SEQ
    _NID_SEQ += 1
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"site-iq-contact:{_NID_SEQ}"))


def node(name, ntype, tv, params, pos, creds=None, extra=None):
    n = {"parameters": params, "id": nid(), "name": name, "type": ntype, "typeVersion": tv, "position": pos}
    if creds:
        n["credentials"] = creds
    if extra:
        n.update(extra)
    return n


# Header-auth webhook; acks immediately so the app's POST returns fast (the email send runs after).
n_webhook = node("Contact webhook", "n8n-nodes-base.webhook", 2.1, {
    "httpMethod": "POST", "path": "site-contact", "responseMode": "onReceived",
    "authentication": "headerAuth", "options": {},
}, [0, 300], creds={"httpHeaderAuth": CRED["sisHeader"]})

# Gmail send. Subject + plain-text body are built by the app (/api/contact) and passed through, so the
# email formatting lives with the rest of the app's copy. Connect a Google OAuth2 credential in the UI.
n_gmail = node("Send Gmail", "n8n-nodes-base.gmail", 2.2, {
    "resource": "message", "operation": "send",
    "sendTo": TEAM_INBOX,
    "subject": "={{ $json.body.subject }}",
    "message": "={{ $json.body.text }}",
    "options": {},
}, [280, 300], extra={"retryOnFail": True, "maxTries": 2})

nodes = [n_webhook, n_gmail]
connections = {n_webhook["name"]: {"main": [[{"node": n_gmail["name"], "type": "main", "index": 0}]]}}

notes = [node("note-1", "n8n-nodes-base.stickyNote", 1, {
    "content": "## Site IQ - Contact\nWeb-form lead -> Gmail to the team inbox.\n\n"
               "**One-time setup:** connect a Google (Gmail OAuth2) credential on the **Send Gmail** node, "
               "then activate. The app POSTs `{ subject, text, name, email, ... }` with `X-SIS-Secret`.",
    "height": 280, "width": 380, "color": 4}, [-60, 40])]

workflow = {
    "name": "Site IQ - Contact",
    "nodes": notes + nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
}

out = Path(__file__).parent / "site-iq-contact.json"
out.write_text(json.dumps(workflow, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"wrote {out.name}: {len(nodes)} nodes")
