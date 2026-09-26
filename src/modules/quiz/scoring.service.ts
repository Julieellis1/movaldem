// ScoringService — the ONLY place scores are computed (PRD 07 §7, ARC-03).
// Pure functions, no database access: the attempt service loads snapshots and
// answers, then calls this. Marks come from the attempt-start snapshot so later
// question-bank edits never change a past result (QUIZ-45).

export type ScorableQuestion = {
  id: string;
  /** Marks snapshotted at attempt start. */
  marks: number;
  /** Option id marked correct in the snapshot. */
  correctOptionId: string;
};

export type ScoreAttemptInput = {
  questions: ScorableQuestion[];
  /** questionId -> selected optionId. Missing key = unanswered. */
  answers: Record<string, string>;
  negativeMarks: number;
  passMarkPercent: number;
  durationSeconds: number;
  startedAt: Date;
  submittedAt: Date;
};

export type ScoreAttemptResult = {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracy: number;
  timeTakenSeconds: number;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function scoreAttempt(input: ScoreAttemptInput): ScoreAttemptResult {
  const { questions, answers, negativeMarks, passMarkPercent, durationSeconds, startedAt, submittedAt } = input;

  let raw = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  for (const question of questions) {
    maxScore += question.marks;
    const selected = answers[question.id];
    if (selected === undefined || selected === null || selected === "") {
      unansweredCount += 1;
      continue;
    }
    if (selected === question.correctOptionId) {
      correctCount += 1;
      raw += question.marks;
    } else {
      wrongCount += 1;
      raw -= negativeMarks;
    }
  }

  // Negative marking can drive the raw total below zero; the attempt score
  // floors at 0 (07 §7).
  const score = Math.max(0, round2(raw));
  const roundedMax = round2(maxScore);
  const percentage = roundedMax > 0 ? round2((score / roundedMax) * 100) : 0;
  const accuracy = questions.length > 0 ? round2((correctCount / questions.length) * 100) : 0;

  // Time used is submission minus start, capped at the quiz duration.
  const elapsedSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const timeTakenSeconds = Math.min(elapsedSeconds, durationSeconds);

  return {
    score,
    maxScore: roundedMax,
    percentage,
    passed: percentage >= passMarkPercent,
    correctCount,
    wrongCount,
    unansweredCount,
    accuracy,
    timeTakenSeconds,
  };
}
