"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { resolveBriefQuestion } from "@/app/(app)/briefs/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Resolve" button for an open question: opens a dialog to enter the answer
 * and who answered it, then calls the resolveBriefQuestion server action
 * (which marks the question resolved and logs 'question_resolved' history).
 */
export function ResolveQuestionDialog({
  briefId,
  questionId,
  questionText,
  defaultAnsweredBy,
}: {
  briefId: string;
  questionId: string;
  questionText: string;
  defaultAnsweredBy: string;
}) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answeredBy, setAnsweredBy] = useState(defaultAnsweredBy);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !answeredBy.trim()) return;

    setPending(true);
    setError(null);

    const result = await resolveBriefQuestion({
      briefId,
      questionId,
      answerText: answer.trim(),
      answeredBy: answeredBy.trim(),
    });

    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    setAnswer("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve question</DialogTitle>
          <DialogDescription className="border-l-2 border-accent pl-3 italic">
            {questionText}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="answer" className="text-sm font-medium text-text">
              Answer
            </label>
            <Textarea
              id="answer"
              rows={3}
              required
              placeholder="What did the client (or you) decide?"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="answered-by"
              className="text-sm font-medium text-text"
            >
              Answered by
            </label>
            <Input
              id="answered-by"
              required
              placeholder="e.g. Priya (client)"
              value={answeredBy}
              onChange={(e) => setAnsweredBy(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !answer.trim() || !answeredBy.trim()}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin"  aria-hidden="true" />
                  Resolving…
                </>
              ) : (
                "Mark resolved"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
