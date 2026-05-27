"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, type ButtonHTMLAttributes } from "react";

// Plain native <button> (no framer-motion). The previous stub animated scale via
// motion.button; that pulled framer-motion into this leaf component for a hover
// micro-interaction the rest of the app does not use. Dropping it lets the dep
// tree-shake out of any bundle that only touches this Button.
interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    children: React.ReactNode;
}

// Variants map onto the app-wide design tokens (--color-accent / -foreground,
// --color-muted, --color-border, --color-foreground) instead of hardcoded
// blue/neutral palette values, so the button follows light/dark theme switches
// like every other surface (ContactForm, SiteHeader, error pages).
const variants = {
    primary: "bg-accent text-accent-foreground shadow-sm hover:opacity-90",
    secondary: "bg-muted text-foreground hover:bg-muted/80",
    outline: "border border-border text-foreground hover:border-accent/60 hover:bg-accent/5",
    ghost: "text-muted-foreground hover:bg-accent/5 hover:text-foreground",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    function Button(
        {
            variant = "primary",
            size = "md",
            loading = false,
            className,
            disabled,
            children,
            ...props
        },
        ref
    ) {
        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                // outline-none suppresses the default mouse :focus ring; the global
                // `button:focus-visible` rule in globals.css then supplies the
                // keyboard-only accent ring. This matches the app-wide :focus-visible
                // pattern instead of the old per-element focus:ring-blue-500.
                className={twMerge(
                    clsx(
                        "inline-flex items-center justify-center rounded-lg font-medium outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        variants[variant],
                        sizes[size],
                        className
                    )
                )}
                {...props}
            >
                {loading ? (
                    <span className="flex items-center gap-2">
                        <svg
                            className="animate-spin h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        Loading...
                    </span>
                ) : (
                    children
                )}
            </button>
        );
    }
);
