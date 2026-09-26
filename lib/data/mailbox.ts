import "server-only";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side reads for mailbox state (future-list item "Gmail/Outlook"):
 * the Settings card (connected accounts) and the Inbox staging list
 * (synced mail not yet attached to a brief).
 */

export type MailboxAccountSummary = {
  id: string;
  service: "gmail" | "outlook";
  email_address: string;
  display_name: string | null;
  status: "active" | "needs_reauth";
  last_synced_at: string | null;
  last_error: string | null;
};

export type MailboxStagingMessage = {
  id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  service: "gmail" | "outlook";
};

type AccountRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

function pick<T>(row: MessageRow, key: string, fallback: T): T {
  const v = row[key];
  return (v === undefined || v === null ? fallback : (v as T)) as T;
}

function accountService(row: AccountRow): "gmail" | "outlook" {
  return row.service === "outlook" ? "outlook" : "gmail";
}

export async function getMailboxAccounts(): Promise<MailboxAccountSummary[]> {
  const supabase = await createClient();
  const context = await getWorkspaceContext();
  if (!context) return [];

  const { data, error } = await supabase
    .from("email_accounts")
    .select("id, service, email_address, display_name, status, last_synced_at, last_error")
    .eq("workspace_id", context.id)
    .order("created_at", { ascending: true });

  if (error) return [];
  return ((data ?? []) as AccountRow[]).map((row) => ({
    id: String(row.id),
    service: accountService(row),
    email_address: String(row.email_address ?? ""),
    display_name: (row.display_name as string | null) ?? null,
    status: row.status === "needs_reauth" ? "needs_reauth" : "active",
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
  }));
}

export async function getMailboxStaging(): Promise<MailboxStagingMessage[]> {
  const supabase = await createClient();
  const context = await getWorkspaceContext();
  if (!context) return [];

  const { data, error } = await supabase
    .from("email_messages")
    .select("id, sender, subject, snippet, received_at, account:email_accounts(id, service)")
    .eq("workspace_id", context.id)
    .is("attached_brief_id", null)
    .order("received_at", { ascending: false })
    .limit(20);

  if (error) return [];
  return ((data ?? []) as MessageRow[]).map((row) => {
    const acct = row.account as AccountRow | AccountRow[] | null;
    const service = Array.isArray(acct) ? accountService(acct[0] ?? {}) : acct ? accountService(acct) : "gmail";
    return {
      id: String(row.id),
      sender: String(row.sender ?? "Unknown sender"),
      subject: pick<string | null>(row, "subject", null),
      snippet: pick<string | null>(row, "snippet", null),
      received_at: String(row.received_at ?? ""),
      service,
    };
  });
}
