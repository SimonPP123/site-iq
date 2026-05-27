import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Contact Inbox" };
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  topic: string | null;
  plan: string | null;
  message: string;
};

export default async function AdminContactPage() {
  await requireAdmin();
  const supabase = createServiceClient();
  let rows: Row[] = [];
  let configError = false;

  if (!supabase) {
    configError = true;
  } else {
    const { data } = await supabase
      .from("contact_requests")
      .select("id, created_at, name, email, company, topic, plan, message")
      .order("created_at", { ascending: false })
      .limit(200);
    rows = (data as Row[] | null) ?? [];
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contact Inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Messages from the public contact form ({rows.length} shown). Also emailed to CONTACT_EMAIL when set.
      </p>

      {configError ? (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200/90">
          Set <code>SUPABASE_SERVICE_ROLE_KEY</code> in the environment to read submissions here.
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-foreground">{r.name}</span>{" "}
                  <a href={`mailto:${r.email}`} className="text-muted-foreground hover:text-foreground">
                    &lt;{r.email}&gt;
                  </a>
                  {r.company ? <span className="text-muted-foreground"> · {r.company}</span> : null}
                </div>
                <time className="text-xs text-muted-foreground/70">
                  {new Date(r.created_at).toLocaleString()}
                </time>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {r.topic ? (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{r.topic}</span>
                ) : null}
                {r.plan ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{r.plan} plan</span>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
