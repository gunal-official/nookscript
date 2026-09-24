"use client";

/**
 * Interactive task checklist for /plans/:id — unlike the read-only
 * deliverables lists on briefs/proposals, clicking a task flips `checked`
 * and persists immediately via the toggleTask server action.
 *
 * Optimistic UI: the task flips locally on click; if the action returns an
 * error we flip it back and show the message (same rollback pattern as the
 * Step 5 resolve-question dialog). After a successful save the server
 * component re-renders with fresh `tasks`, which we re-sync into state.
 * Toggles are disabled while a save is in flight, because the action is
 * read-modify-write on the whole array — overlapping toggles could race.
 */

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { toggleTask } from "@/app/(app)/plans/[id]/actions";
import { cn } from "@/lib/utils";
import type { PlanTask } from "@/lib/types/plan";

export function TaskChecklist({
  planId,
  tasks: initialTasks,
  readOnly = false,
}: {
  planId: string;
  tasks: PlanTask[];
  /** Step 29: viewers see tasks read-only (no toggle affordance). */
  readOnly?: boolean;
}) {
  const [tasks, setTasks] = useState<PlanTask[]>(initialTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server re-renders with fresh data after revalidation.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const doneCount = tasks.filter((t) => t.checked).length;

  async function handleToggle(task: PlanTask) {
    if (pending) return;

    setPending(true);
    setError(null);
    // optimistic flip
    setTasks((current) =>
      current.map((t) =>
        t.id === task.id ? { ...t, checked: !t.checked } : t
      )
    );

    const result = await toggleTask({ planId, taskId: task.id });

    setPending(false);
    if (result?.error) {
      // rollback
      setTasks((current) =>
        current.map((t) =>
          t.id === task.id ? { ...t, checked: task.checked } : t
        )
      );
      setError(result.error);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Tasks
        </p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {doneCount} of {tasks.length} done
        </span>
      </div>
      <ul className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
        {tasks.length === 0 ? (
          <li className="px-1.5 py-1 text-sm text-muted-foreground">
            No tasks in this plan.
          </li>
        ) : (
          tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => handleToggle(task)}
                disabled={pending || readOnly}
                aria-pressed={task.checked}
                className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-70"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                    task.checked
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-card"
                  )}
                >
                  {task.checked && (
                    <Check className="h-3 w-3" strokeWidth={3.5} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    task.checked && "text-muted-foreground line-through"
                  )}
                >
                  {task.text}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
