"use client";

/**
 * The floating time timer (Step 18, D1 + D4) — mounted in the (app)
 * layout so it is visible on EVERY app page.
 *
 * The timer is EPHEMERAL CLIENT STATE (localStorage, survives refresh
 * and browser restart): while running it is just {startedAt, label} —
 * elapsed time is computed from the timestamp, so nothing drifts and
 * there is no stuck-timer cleanup. No server row exists while it runs;
 * Stop opens the stop form with the elapsed minutes prefilled, and Save
 * (logTimeAction) is the only write. Discard throws the session away.
 *
 * KNOWN LIMITATION (v1): one timer per browser — a second tab that
 * starts a new timer overwrites the stored one.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Timer, X } from "lucide-react";

import { logTimeAction } from "@/app/(app)/time/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localToday } from "@/lib/utils";
import type { BriefOption } from "@/lib/types/time";

const STORAGE_KEY = "nookscript.timer.v1";
const GENERAL = "general";

interface StoredTimer {
  startedAt: number;
  label: string;
}

type Phase = "idle" | "running" | "stop";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function TimeTimer({ briefs }: { briefs: BriefOption[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stored, setStored] = useState<StoredTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [minutes, setMinutes] = useState("");
  const [workedOn, setWorkedOn] = useState("");
  const [briefId, setBriefId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate once after mount. The stored startedAt is the source of
  // truth (elapsed = now - startedAt), so a refresh mid-run resumes
  // exactly where it left off.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredTimer;
      if (
        typeof parsed.startedAt === "number" &&
        parsed.startedAt <= Date.now()
      ) {
        setStored(parsed);
        setPhase("running");
      }
    } catch {
      // Corrupted storage → start fresh; nothing to clean up server-side.
    }
  }, []);

  // Tick once per second, only while running.
  useEffect(() => {
    if (phase !== "running") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function persist(next: StoredTimer | null) {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  }

  function start() {
    const s: StoredTimer = { startedAt: Date.now(), label: "" };
    persist(s);
    setStored(s);
    setNow(Date.now());
    setPhase("running");
  }

  function setLabel(label: string) {
    setStored((prev) => {
      if (!prev) return prev;
      const next = { ...prev, label };
      persist(next);
      return next;
    });
  }

  function elapsedSeconds(): number {
    if (!stored) return 0;
    return Math.max(0, Math.floor((now - stored.startedAt) / 1000));
  }

  function openStopForm() {
    if (!stored) return;
    setMinutes(String(Math.max(1, Math.round(elapsedSeconds() / 60))));
    setWorkedOn(localToday());
    setBriefId("");
    setError(null);
    setPhase("stop");
  }

  function discard() {
    persist(null);
    setStored(null);
    setPhase("idle");
  }

  async function save() {
    if (!stored) return;
    setPending(true);
    setError(null);
    const result = await logTimeAction({
      brief_id: briefId || null,
      description: stored.label,
      worked_on: workedOn,
      duration_minutes: Number(minutes),
    });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    persist(null);
    setStored(null);
    setPhase("idle");
    router.refresh();
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={start}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-md transition-colors hover:bg-muted print:hidden"
      >
        <Timer className="h-4 w-4 text-accent" />
        Start timer
      </button>
    );
  }

  if (phase === "running") {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pr-2.5 shadow-md print:hidden">
        <span className="pl-2 text-sm font-semibold tabular-nums text-text">
          {formatElapsed(elapsedSeconds())}
        </span>
        <input
          value={stored?.label ?? ""}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What are you working on?"
          aria-label="What are you working on?"
          className="w-48 bg-transparent text-sm text-text placeholder:text-muted-foreground focus:outline-none"
        />
        <Button size="sm" className="h-8 gap-1.5" onClick={openStopForm}>
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
        <button
          type="button"
          onClick={discard}
          title="Discard this session"
          aria-label="Discard this session"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // stop form — Cancel returns to RUNNING (the timer keeps going).
  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-md border border-border bg-card p-4 shadow-lg print:hidden">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Timer className="h-4 w-4 text-accent" />
        Log this session
      </p>
      <Input
        value={stored?.label ?? ""}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What did you work on?"
        aria-label="What did you work on?"
        className="h-9"
        autoFocus
      />
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="number"
          min={1}
          step={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="h-9 w-24"
          aria-label="Minutes"
        />
        <Input
          type="date"
          value={workedOn}
          onChange={(e) => setWorkedOn(e.target.value)}
          aria-label="Worked on"
          className="h-9 flex-1"
        />
      </div>
      <div className="mt-2">
        <Select
          value={briefId || GENERAL}
          onValueChange={(value) =>
            setBriefId(value === GENERAL ? "" : value)
          }
        >
          <SelectTrigger className="h-9" aria-label="Brief">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GENERAL}>General (no brief)</SelectItem>
            {briefs.map((brief) => (
              <SelectItem key={brief.id} value={brief.id}>
                {brief.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setPhase("running")}
          disabled={pending}
        >
          Keep running
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
