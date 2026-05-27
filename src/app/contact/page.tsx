import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Site IQ - questions, feedback, or to set up a Pro or Agency plan.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <header className="mx-auto max-w-lg text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact Site IQ</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Questions, feedback, a bug, or interested in a Pro or Agency plan? Tell us what you need and
            we will reply within 1-2 business days.
          </p>
        </header>
        <Suspense fallback={<div className="mx-auto mt-8 max-w-lg text-center text-sm text-muted-foreground">Loading…</div>}>
          <ContactForm />
        </Suspense>
      </main>
    </div>
  );
}
