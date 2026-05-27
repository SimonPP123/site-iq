"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";
import { trackChatMessageSent } from "@/lib/analytics";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What does this site offer?",
  "Is there a pricing page?",
  "Why did it get this grade?",
  "What should I fix first?",
];

/**
 * Chat panel for a finished report. Each message is answered by the n8n "Site IQ - Chat" RAG
 * workflow via /api/chat (this report's crawled pages + scorecard). Conversation persists per report.
 */
export function ChatPanel({ reportId, domain }: { reportId: string; domain: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load the saved conversation for this report so it continues across visits (RLS-scoped).
  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("report_id", reportId)
      .order("id")
      .then(({ data, error }) => {
        if (error) console.error("[chat] history load failed:", error.message);
        if (data && data.length)
          setMessages(data.map((m) => ({ id: String(m.id), role: m.role as Msg["role"], content: m.content })));
      });
  }, [reportId]);

  // Keep the latest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const message = question.trim();
    if (!message || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: message }]);
    // Engagement signal: LENGTH ONLY. The message text is never sent to analytics (PII / privacy).
    trackChatMessageSent({ chat_message_length: message.length });
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, message }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as { answer?: string; error?: string } | null;
      if (!res.ok || !data?.answer) throw new Error(data?.error ?? "The assistant is unavailable right now.");
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.answer! }]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("That took too long - please try again.");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <section className="surface mt-8 p-6">
      <h2 className="text-lg font-semibold">Ask about {domain}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A grounded assistant over this report - it searches the crawled pages, knows the scores, and cites its sources.
      </p>

      {/* Conversation thread */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className="mt-4 flex max-h-[460px] min-h-[200px] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-background/40 p-4"
      >
        {empty && !loading && (
          <div className="m-auto max-w-sm text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">✦</div>
            <p className="mt-3 text-sm text-muted-foreground">
              Ask anything about <span className="text-foreground">{domain}</span> - its content, its pages, or its audit results.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Site IQ
              </span>
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-muted px-3.5 py-2 text-sm">
                <div className="prose dark:prose-invert prose-sm max-w-none prose-a:text-accent prose-p:my-1.5 prose-ul:my-1.5">
                  <ReactMarkdown
                    urlTransform={(url) =>
                      url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") ? url : ""
                    }
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex flex-col items-start gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Site IQ
            </span>
            <div className="rounded-2xl rounded-bl-sm border border-border bg-muted px-3.5 py-3">
              <span className="inline-flex gap-1" role="status" aria-label="Searching the crawled pages">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Follow-up suggestions once a conversation has started */}
      {!empty && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask something about ${domain}…`}
          aria-label={`Ask a question about ${domain}`}
          className="flex-1 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/80 focus:border-accent/70 focus:ring-2 focus:ring-accent/40"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>

      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
