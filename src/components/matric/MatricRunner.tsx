"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, Lock, RotateCcw, Trophy, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { useToast } from "@/components/ui/Toast";
import type { MatricQuestionForStudent } from "@/lib/database.types";

interface AnswerState {
  optionId: string;
  isCorrect: boolean;
  correctOptionId: string | null;
  explanationHtml: string | null;
}

/**
 * The practice runner.
 *
 * One rule shapes the whole component: this code does not know the answers.
 * The options it renders arrive from `get_matric_questions`, which projects
 * them without `is_correct`; correctness comes back only from
 * `submit_matric_answer` after the choice has been committed. So there is
 * nothing in the page source, the network payload, or React state that a
 * student could read ahead of answering — the marking genuinely happens on the
 * server.
 */
export function MatricRunner({
  yearId,
  subjectId,
  yearLabel,
  subjectName,
  questions,
  hasMatricAccess,
}: {
  yearId: string;
  subjectId: string;
  yearLabel: string;
  subjectName: string;
  questions: MatricQuestionForStudent[];
  hasMatricAccess: boolean;
}) {
  const toast = useToast();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const questionRef = useRef<HTMLDivElement>(null);

  const answerable = useMemo(() => questions.filter((q) => !q.locked), [questions]);
  const current = questions[index];

  // Resume rather than restart: start_matric_attempt returns the open attempt
  // if there is one, so closing the tab mid-paper loses nothing.
  useEffect(() => {
    let cancelled = false;
    if (answerable.length === 0) return;

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("start_matric_attempt", {
        p_year_id: yearId,
        p_subject_id: subjectId,
      });
      if (cancelled) return;
      if (error) {
        toast.error("Could not start practice", "Please refresh and try again.");
        return;
      }
      setAttemptId(data as string);
    })();

    return () => {
      cancelled = true;
    };
  }, [yearId, subjectId, answerable.length, toast]);

  // Seed state from answers already recorded on the server for this attempt,
  // so a resumed paper shows what was already marked.
  useEffect(() => {
    const seeded: Record<string, AnswerState> = {};
    for (const q of questions) {
      if (q.answered && q.answered_option) {
        seeded[q.id] = {
          optionId: q.answered_option,
          isCorrect: Boolean(q.answered_correct),
          correctOptionId: null,
          explanationHtml: null,
        };
      }
    }
    if (Object.keys(seeded).length > 0) setAnswers(seeded);
  }, [questions]);

  // Move focus to the new question so a keyboard or screen-reader user is not
  // stranded at the bottom of the previous one.
  useEffect(() => {
    questionRef.current?.focus();
  }, [index]);

  async function answer(optionId: string) {
    if (!current || !attemptId || answers[current.id] || submitting) return;

    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("submit_matric_answer", {
      p_attempt_id: attemptId,
      p_question_id: current.id,
      p_option_id: optionId,
    });
    setSubmitting(false);

    if (error) {
      toast.error("Could not save that answer", "Check your connection and try again.");
      return;
    }

    const result = data as { is_correct: boolean; correct_option_id: string; explanation_html: string | null };
    setAnswers((prev) => ({
      ...prev,
      [current.id]: {
        optionId,
        isCorrect: result.is_correct,
        correctOptionId: result.correct_option_id,
        explanationHtml: result.explanation_html,
      },
    }));

    // A learning event, not just a UI update: it feeds the streak.
    void supabase.rpc("record_learning_event", { p_kind: "question_answered", p_content_id: null });
  }

  async function finish() {
    if (!attemptId) return;
    const supabase = createClient();
    await supabase.rpc("finish_matric_attempt", { p_attempt_id: attemptId });
    setFinished(true);
  }

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;

  if (questions.length === 0) {
    return (
      <div className="space-y-5">
        <BackLink />
        <EmptyState
          icon={<Lock size={20} />}
          title="No questions here yet"
          description={`${subjectName} for ${yearLabel} has not been published yet. Try another subject or year.`}
          action={
            <Link href="/matric">
              <Button variant="secondary">Back to matric papers</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (answerable.length === 0) {
    return (
      <div className="space-y-5">
        <BackLink />
        <Card className="p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/12 text-violet-600">
            <Lock size={24} />
          </div>
          <h1 className="kl-display mt-4 text-xl font-bold text-text-primary">
            {subjectName} — {yearLabel}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
            All {questions.length} questions in this paper are part of the Matric Package. Unlock it
            to practise them with full answers and explanations.
          </p>
          <div className="mt-6">
            <Link href="/premium">
              <Button>See the Matric Package</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (finished) {
    const accuracy = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);
    return (
      <div className="space-y-5">
        <BackLink />
        <Card className="p-8 text-center">
          <ProgressRing
            value={accuracy}
            max={100}
            size={128}
            strokeWidth={10}
            label={
              <>
                <span className="kl-display text-3xl font-extrabold text-text-primary">{accuracy}%</span>
                <span className="mt-0.5 text-[11px] text-text-secondary">correct</span>
              </>
            }
            sublabel="accuracy"
          />
          <h1 className="kl-display mt-5 text-2xl font-bold text-text-primary">
            {accuracy >= 80 ? "Excellent work" : accuracy >= 50 ? "Good effort" : "Keep going"}
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            You answered {correctCount} of {answeredCount} correctly — {subjectName}, {yearLabel}.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/matric">
              <Button icon={<Trophy size={16} />}>Try another paper</Button>
            </Link>
            <Button
              variant="secondary"
              icon={<RotateCcw size={16} />}
              onClick={() => {
                setFinished(false);
                setIndex(0);
              }}
            >
              Review answers
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const answered = current ? answers[current.id] : undefined;
  const progress = Math.round((answeredCount / answerable.length) * 100);

  return (
    <div className="space-y-5">
      <BackLink />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="kl-display text-xl font-bold text-text-primary">
            {subjectName} <span className="text-text-secondary">· {yearLabel}</span>
          </h1>
          <span className="text-sm font-medium text-text-secondary">
            {answeredCount} of {answerable.length} answered
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-kl-out"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Practice progress"
          />
        </div>
      </div>

      {/* Question pager. On a long paper this is the only practical way to get
          back to a specific question. */}
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const state = answers[q.id];
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}${state ? (state.isCorrect ? ", correct" : ", incorrect") : ""}`}
              aria-current={i === index ? "true" : undefined}
              className={`kl-press grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold transition-colors ${
                i === index
                  ? "bg-accent text-[var(--accent-contrast)]"
                  : q.locked
                  ? "bg-[var(--surface-elevated)] text-text-secondary/50"
                  : state
                  ? state.isCorrect
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-red-500/15 text-red-600"
                  : "bg-[var(--surface-elevated)] text-text-secondary"
              }`}
            >
              {q.locked ? <Lock size={10} aria-hidden /> : i + 1}
            </button>
          );
        })}
      </div>

      {current && (
        <Card className="p-5 sm:p-7" key={current.id}>
          <div
            ref={questionRef}
            tabIndex={-1}
            className="animate-kl-fade-in outline-none"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Question {index + 1}</Badge>
              <Badge tone={current.difficulty === "hard" ? "danger" : current.difficulty === "easy" ? "success" : "warning"}>
                {current.difficulty}
              </Badge>
              {current.marks > 1 && <Badge tone="neutral">{current.marks} marks</Badge>}
              {current.access_tier === "free" && <Badge tone="success">Free</Badge>}
            </div>

            {current.locked ? (
              <div className="py-6 text-center">
                <Lock size={28} className="mx-auto text-text-secondary" aria-hidden />
                <p className="kl-display mt-3 font-bold text-text-primary">This question is locked</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
                  Unlock the Matric Package to see this question, its answer and its explanation.
                </p>
                <Link href="/premium" className="mt-4 inline-block">
                  <Button size="sm">See the Matric Package</Button>
                </Link>
              </div>
            ) : (
              <>
                <div
                  className="kl-prose prose prose-slate max-w-none"
                  // Sanitised on write by the admin content pipeline.
                  dangerouslySetInnerHTML={{ __html: current.question_html ?? "" }}
                />

                <div className="mt-5 space-y-2.5">
                  {current.options.map((option) => {
                    const chosen = answered?.optionId === option.id;
                    const isTheAnswer = answered?.correctOptionId === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={Boolean(answered) || submitting}
                        onClick={() => answer(option.id)}
                        className={`kl-press flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                          isTheAnswer
                            ? "border-emerald-500 bg-emerald-500/10"
                            : chosen
                            ? "border-red-500 bg-red-500/10"
                            : answered
                            ? "border-kl-border opacity-60"
                            : "border-kl-border hover:border-accent hover:bg-accent-soft"
                        }`}
                      >
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                            isTheAnswer
                              ? "bg-emerald-500 text-white"
                              : chosen
                              ? "bg-red-500 text-white"
                              : "bg-[var(--surface-elevated)] text-text-secondary"
                          }`}
                        >
                          {isTheAnswer ? <Check size={14} aria-hidden /> : chosen ? <X size={14} aria-hidden /> : option.label}
                        </span>
                        <span
                          className="kl-prose prose prose-sm min-w-0 flex-1 max-w-none pt-0.5"
                          dangerouslySetInnerHTML={{ __html: option.body_html }}
                        />
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div
                    className={`animate-kl-fade-up mt-5 rounded-xl border p-4 ${
                      answered.isCorrect
                        ? "border-emerald-500/30 bg-emerald-500/8"
                        : "border-amber-500/30 bg-amber-500/8"
                    }`}
                  >
                    <p className="flex items-center gap-2 font-semibold text-text-primary">
                      {answered.isCorrect ? (
                        <>
                          <Check size={16} className="text-emerald-600" aria-hidden /> Correct
                        </>
                      ) : (
                        <>
                          <X size={16} className="text-red-600" aria-hidden /> Not quite
                        </>
                      )}
                    </p>
                    {answered.explanationHtml && (
                      <div
                        className="kl-prose prose prose-sm mt-2 max-w-none"
                        dangerouslySetInnerHTML={{ __html: answered.explanationHtml }}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-kl-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft size={15} />}
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>

            {index === questions.length - 1 ? (
              <Button size="sm" icon={<Trophy size={15} />} onClick={finish} disabled={answeredCount === 0}>
                Finish and see results
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<ArrowRight size={15} />}
                onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              >
                Next
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/matric"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
    >
      <ArrowLeft size={15} aria-hidden />
      Matric papers
    </Link>
  );
}
