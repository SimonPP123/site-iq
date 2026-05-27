"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const PLAN_LABEL: Record<string, string> = { pro: "Pro", agency: "Agency" };
const TOPICS = ["General question", "Pro plan", "Agency plan", "Help with my site", "Bug report", "Feedback", "Partnership"] as const;
const inputCls =
  "mt-1.5 w-full rounded-lg border border-border bg-card/70 px-3 py-2.5 text-sm outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/40";

/**
 * Public contact / sales form. Reads ?plan=pro|agency to pre-select the topic + pre-fill the
 * message; posts to /api/contact (which persists the lead to contact_requests and emails a
 * notification when CONTACT_EMAIL is set).
 */
export function ContactForm() {
  const params = useSearchParams();
  const planParam = params.get("plan");
  const plan = planParam === "pro" || planParam === "agency" ? planParam : undefined;
  // From the report "get help" CTA: ?topic=audit&domain=<d> pre-fills an audit-help message.
  const auditDomain = params.get("topic") === "audit" ? (params.get("domain") || "").trim().slice(0, 255) : "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState<string>(
    plan ? `${PLAN_LABEL[plan]} plan` : auditDomain ? "Help with my site" : "General question",
  );
  const [message, setMessage] = useState(
    plan
      ? `I'm interested in the ${PLAN_LABEL[plan]} plan. `
      : auditDomain
        ? `I just ran a Site IQ audit on ${auditDomain} and I'd like help fixing the issues and improving my score.`
        : "",
  );
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, company, topic, message, plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  const heading = plan
    ? `Talk to us about the ${PLAN_LABEL[plan]} plan`
    : auditDomain
      ? "Let's improve your site"
      : "Get in touch";
  const sub = plan
    ? `${PLAN_LABEL[plan]} is not self-serve yet - tell us about your use case and team size and we will set you up.`
    : auditDomain
      ? `Tell me a bit about ${auditDomain} and what you would like to improve - I will take a look and get back to you.`
      : "Questions, feedback, a bug, or interested in a paid plan? Tell us what you need and we will get back to you.";

  if (status === "done") {
    return (
      <div className="surface mx-auto mt-10 max-w-lg p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-700 dark:text-emerald-400">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-6 w-6">
            <path d="M4 10.5l3.5 3.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Thanks - message received.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We have your note and will reply to <span className="text-foreground">{email}</span> within 1-2 business days.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-lg">
      <header className="text-center">
        {plan ? (
          <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            {PLAN_LABEL[plan]} plan
          </span>
        ) : null}
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{sub}</p>
        <p className="mt-2 text-xs text-muted-foreground/80">We usually reply within 1-2 business days.</p>
      </header>

      <form onSubmit={onSubmit} className="surface mt-8 space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground">Name</label>
            <input id="name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">Work email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="company" className="block text-sm font-medium text-foreground">
              Company <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <input id="company" type="text" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-foreground">Topic</label>
            <select id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls}>
              {TOPICS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-foreground">How can we help?</label>
          <textarea
            id="message" required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-y`}
            placeholder="A sentence or two about what you need - the more specific, the faster we can help."
          />
        </div>

        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
