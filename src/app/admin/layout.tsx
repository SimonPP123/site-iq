"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
    { href: "/admin", label: "Overview", section: null },
    { href: "/admin/contact", label: "Contact Inbox", section: "Control Center" },
    { href: "/admin/secrets", label: "Secrets Manager", section: "Control Center" },
    { href: "/admin/users", label: "User Management", section: "Control Center" },
    { href: "/admin/docs", label: "Documentation", section: "Knowledge" },
];

function NavLink({
    href,
    label,
    isActive,
    onClick,
}: {
    href: string;
    label: string;
    isActive: boolean;
    onClick?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            aria-current={isActive ? "page" : undefined}
            className={`block px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                    : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
        >
            {label}
        </Link>
    );
}

function Sidebar({
    pathname,
    onLinkClick,
}: {
    pathname: string;
    onLinkClick?: () => void;
}) {
    return (
        <>
            <div className="p-6 shrink-0">
                <h1 className="text-xl font-bold tracking-tight">Site IQ Admin</h1>
                <p className="text-xs text-neutral-500 mt-1">Control Plane</p>
            </div>
            <nav className="px-4 space-y-1 flex-1 pb-6" aria-label="Admin navigation">
                {navItems.map((item, i) => {
                    // Show a section header before the first item of each section (no render-time
                    // mutation: compare against the previous item's section).
                    const showSection = item.section && item.section !== navItems[i - 1]?.section;

                    return (
                        <div key={item.href}>
                            {showSection && (
                                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                                    {item.section}
                                </div>
                            )}
                            <NavLink
                                href={item.href}
                                label={item.label}
                                isActive={pathname === item.href}
                                onClick={onLinkClick}
                            />
                        </div>
                    );
                })}
            </nav>
        </>
    );
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            {/* Mobile menu button */}
            <div className="md:hidden fixed top-4 left-4 z-50">
                <button
                    type="button"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-expanded={mobileMenuOpen}
                    aria-controls="mobile-nav"
                    aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                    className="p-2 rounded-lg bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700"
                >
                    {mobileMenuOpen ? (
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    ) : (
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6h16M4 12h16M4 18h16"
                            />
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile sidebar overlay */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/50"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Mobile sidebar */}
            <aside
                id="mobile-nav"
                className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 transform transition-transform duration-200 ease-in-out ${
                    mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
                } flex flex-col overflow-y-auto`}
            >
                <Sidebar
                    pathname={pathname}
                    onLinkClick={() => setMobileMenuOpen(false)}
                />
            </aside>

            {/* Desktop sidebar */}
            <aside className="w-64 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 hidden md:flex flex-col overflow-y-auto">
                <Sidebar pathname={pathname} />
            </aside>

            {/* Main Content */}
            <main
                id="main-content"
                className="flex-1 p-8 overflow-y-auto pt-16 md:pt-8"
            >
                {children}
            </main>
        </div>
    );
}
