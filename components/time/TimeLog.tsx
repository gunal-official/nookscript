"use client";

/**
 * /time log (Step 18). Pure presentation over the server-fetched rows:
 * day groups (worked_on, desc), per-day totals, today/month summary
 * (computed here — nothing stored), the brief filter, and the
 * create/edit form. Delete is two-step (click → confirm) — the only
 * destructive control in the product.
 */

import { useMemo, useState } from "react";

import { deleteTimeAction, logTimeAction, updateTimeAction } from "@/app/(app)/time/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDuration, localToday } from "@/lib/utils";
import type { BriefOption, TimeEntry } from "@/lib/types/time";

const ALL_BRIEFS = "all";

function dayLabel(dateStr: string): string {
  if (dateStr === localToday()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (dateStr === yesterday) return "Yesterday";
  // "T00:00:00" → local midnight, so the label is timezone-honest.
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00`));
}

interface FormState {
  description: string;
  minutes: string;
  worked_on: string;
  brief_id: string; // "" = general
}

const EMPTY_FORM: FormState = {
  description: "",
  minutes: "",
  worked_on: "",
  brief_id: "",
};

export function TimeLog({
  entries,
  briefs,
}: {
  entries: TimeEntry[];
  briefs: BriefOption[];
}) {
  const [briefFilter, setBriefFilter] = useState(ALL_BRIEFS);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const briefTitle = (briefId: string | null) =>
    briefs.find((b) => b.id === briefId)?.title ?? null;

  // entries arrive pre-sorted (worked_on desc, created_at desc) — a
  // single pass builds the groups.
  const groups = useMemo(() => {
    const visible =
      briefFilter === ALL_BRIEFS
        ? entries
        : entries.filter((e) => e.brief_id === briefFilter);
    const out: Array<{ date: string; items: TimeEntry[]; total: number }> =
      [];
    for (const entry of visible) {
      const last = out[out.length - 1];
      if (last && last.date === entry.worked_on) {
        last.items.push(entry);
        last.total += entry.duration_minutes;
      } else {
        out.push({
          date: entry.worked_on,
          items: [entry],
          total: entry.duration_minutes,
        });
      }
    }
    return out;
  }, [entries, briefFilter]);

  const todayTotal = useMemo(
    () =>
      entries
        .filter((e) => e.worked_on === localToday())
        .reduce((sum, e) => sum + e.duration_minutes, 0),
    [entries]
  );
  const monthTotal = useMemo(() => {
    const prefix = localToday().slice(0, 7);
    return entries
      .filter((e) => e.worked_on.startsWith(prefix))
      .reduce((sum, e) => sum + e.duration_minutes, 0);
  }, [entries]);

  function openCreate() {
    setEditingId(null);
    setForm({
      description: "",
      minutes: "",
      worked_on: localToday(),
      brief_id: "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    setForm({
      description: entry.description,
      minutes: String(entry.duration_minutes),
      worked_on: entry.worked_on,
      brief_id: entry.brief_id ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    const minutes = Number(form.minutes);
    const input = {
      brief_id: form.brief_id || null,
      description: form.description,
      worked_on: form.worked_on,
      duration_minutes: minutes,
    };
    const result = editingId
      ? await updateTimeAction({ id: editingId, ...input })
      : await logTimeAction(input);
    setSaving(false);
    if (result?.error) {
      setFormError(result.error);
      return;
    }
    closeForm();
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      // First click arms the confirm; any other interaction disarms it.
      setConfirmDeleteId(id);
      setDeleteError(null);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTimeAction({ id });
    setDeleting(false);
    if (result?.error) {
      setDeleteError(result.error);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Today{" "}
            <span className="font-semibold text-text">
              {formatDuration(todayTotal)}
            </span>
          </span>
          <span className="text-muted-foreground">
            This month{" "}
            <span className="font-semibold text-text">
              {formatDuration(monthTotal)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={briefFilter}
            onValueChange={(value) => {
              setBriefFilter(value);
              setConfirmDeleteId(null);
            }}
          >
            <SelectTrigger className="h-9 w-52" aria-label="Filter by brief">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRIEFS}>All time</SelectItem>
              {briefs.map((brief) => (
                <SelectItem key={brief.id} value={brief.id}>
                  {brief.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!formOpen && (
            <Button size="sm" onClick={openCreate}>
              Log time
            </Button>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {formOpen && (
        <form
          className="mb-6 rounded-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <p className="mb-3 text-sm font-semibold">
            {editingId ? "Edit entry" : "Log time"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="What did you work on?"
              aria-label="Description"
              className="h-9 min-w-52 flex-1"
              autoFocus
            />
            <Input
              type="number"
              min={1}
              step={1}
              value={form.minutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, minutes: e.target.value }))
              }
              placeholder="Minutes"
              aria-label="Minutes"
              className="h-9 w-28"
            />
            <Input
              type="date"
              value={form.worked_on}
              onChange={(e) =>
                setForm((f) => ({ ...f, worked_on: e.target.value }))
              }
              aria-label="Worked on"
              className="h-9 w-40"
            />
            <Select
              value={form.brief_id || "general"}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  brief_id: value === "general" ? "" : value,
                }))
              }
            >
              <SelectTrigger className="h-9 w-48" aria-label="Brief">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General (no brief)</SelectItem>
                {briefs.map((brief) => (
                  <SelectItem key={brief.id} value={brief.id}>
                    {brief.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {entries.length === 0
            ? "No time logged yet — start the timer (bottom right) or click “Log time”."
            : "No entries for this brief yet."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">{dayLabel(group.date)}</h2>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(group.total)}
                </span>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {group.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-text">{entry.description}</p>
                      {briefTitle(entry.brief_id) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {briefTitle(entry.brief_id)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatDuration(entry.duration_minutes)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => openEdit(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          confirmDeleteId === entry.id
                            ? "destructive"
                            : "ghost"
                        }
                        className={cn(
                          "h-7 px-2",
                          confirmDeleteId !== entry.id && "text-muted-foreground"
                        )}
                        disabled={deleting}
                        onClick={() => {
                          if (confirmDeleteId !== entry.id) setDeleteError(null);
                          void handleDelete(entry.id);
                        }}
                      >
                        {confirmDeleteId === entry.id
                          ? deleting
                            ? "…"
                            : "Sure?"
                          : "Delete"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
