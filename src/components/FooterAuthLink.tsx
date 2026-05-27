"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth-aware footer link so the footer stays consistent with the header: signed out -> "Sign in",
 * signed in -> "My audits" (never a stale "Sign in" while logged in).
 */
export function FooterAuthLink() {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const cls = "text-muted-foreground transition hover:text-foreground";
  if (signedIn === undefined) return <span className={cls}>Sign in</span>; // stable SSR/first paint
  return signedIn ? (
    <Link href="/audits" className={cls}>My audits</Link>
  ) : (
    <Link href="/login" className={cls}>Sign in</Link>
  );
}
