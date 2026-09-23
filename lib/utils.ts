import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "Ada Lovelace" → "AL" · "ada" → "A" · "ada@x.com" → "A" · null → "U".
 * Mirrors the SQL derive_initials() used by the profiles trigger; used as a
 * UI fallback when a stored avatar_initials is missing.
 */
export function getInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "U";
  const base = nameOrEmail.includes("@")
    ? nameOrEmail.split("@")[0]
    : nameOrEmail;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || !parts[0]) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

/** "Sep 18, 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/** Coarse relative time: "just now", "3h ago", "5d ago", or the date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** 123456 → "$1,234.56" (USD, pinned for v1 — Step 17). */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** 1 → "INV-0001" (per-workspace sequence, zero-padded for display). */
export function invoiceNumberLabel(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(4, "0")}`;
}
