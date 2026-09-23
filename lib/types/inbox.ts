import type { BriefSource } from "./brief";

/**
 * View shape for /intake/inbox (Step 12). The inbox is a read composition
 * over existing rows — briefs + their brief_sources — so it gets its own
 * lightweight type rather than touching lib/types/brief.ts.
 *
 * A "thread" is one brief's sources: sources are oldest-first (thread
 * order); threads themselves are sorted by their LATEST source
 * (most recently active first) by getInboxThreads().
 */
export interface InboxThread {
  briefId: string;
  title: string;
  clientName: string | null;
  sources: BriefSource[];
}
