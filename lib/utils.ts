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
