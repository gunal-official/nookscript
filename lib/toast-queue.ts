// Pure toast-queue logic (Step 34, closing the "toast depth ≥3" item): the
// provider keeps React state thin and the queue rules live here where they
// are unit-testable (tests/components/toast.test.ts).
export interface ToastEntry {
  id: number;
  title: string;
  leaving?: boolean;
}

/** Stack cap: floods retire the oldest first, depth stays ≥ 3. */
export const TOAST_MAX = 5;

export function pushToast(toasts: ToastEntry[], id: number, title: string): ToastEntry[] {
  const next = [...toasts, { id, title }];
  // Oldest entries fade out first when the stack overflows.
  while (next.filter((t) => !t.leaving).length > TOAST_MAX) {
    const oldest = next.find((t) => !t.leaving);
    if (!oldest) break;
    next[next.indexOf(oldest)] = { ...oldest, leaving: true };
  }
  return next;
}

export function leaveToast(toasts: ToastEntry[], id: number): ToastEntry[] {
  return toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
}

export function removeToast(toasts: ToastEntry[], id: number): ToastEntry[] {
  return toasts.filter((t) => t.id !== id);
}
