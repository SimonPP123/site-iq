import type { Metadata } from "next";

// Server layout so an auth ("use client") page can still set page metadata and be
// de-indexed. The layout only passes children through.
export const metadata: Metadata = {
    title: "Create account",
    robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
    return children;
}
