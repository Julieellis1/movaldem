import { describe, it, expect } from "vitest";
import { scoreAttempt } from "@/modules/quiz/scoring.service";

// PRD 07 §7: correct += question.marks (snapshot), wrong -= quiz.negative_marks,
// score floored at 0, percentage 2dp, passed at >= pass_mark_percent, accuracy
// = correct / questions * 100, time used capped at duration.
const questions = [
  { id: "q1", marks: 1, correctOptionId: "a" },
  { id: "q2", marks: 1, correctOptionId: "b" },
  { id: "q3", marks: 2, correctOptionId: "c" },
];

describe("ScoringService (07 §7, QUIZ-45 snapshot marks)", () => {
  it("all correct: full score, 100%, passed, time capped at duration", () => {
    const r = scoreAttempt({
      questions,
      answers: { q1: "a", q2: "b", q3: "c" },
      negativeMarks: 0,
      passMarkPercent: 50,
      durationSeconds: 900,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T11:00:00Z"),
    });
    expect(r.score).toBe(4);
    expect(r.maxScore).toBe(4);
    expect(r.percentage).toBe(100);
    expect(r.passed).toBe(true);
    expect(r.correctCount).toBe(3);
    expect(r.wrongCount).toBe(0);
    expect(r.unansweredCount).toBe(0);
    expect(r.accuracy).toBe(100);
    // Submitted an hour after a 15-minute quiz: time is capped at duration.
    expect(r.timeTakenSeconds).toBe(900);
  });

  it("wrong answers subtract negative marks, floored at 0", () => {
    const r = scoreAttempt({
      questions,
      answers: { q1: "x", q2: "y", q3: "z" },
      negativeMarks: 0.5,
      passMarkPercent: 50,
      durationSeconds: 900,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T10:05:00Z"),
    });
    expect(r.maxScore).toBe(4);
    // 0 correct - (3 wrong * 0.5) = -1.5 -> floored at 0
    expect(r.score).toBe(0);
    expect(r.correctCount).toBe(0);
    expect(r.wrongCount).toBe(3);
    expect(r.accuracy).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("partial: mixed correct/wrong/unanswered, percentage 2dp", () => {
    const r = scoreAttempt({
      questions,
      answers: { q1: "a", q3: "wrong" },
      negativeMarks: 0,
      passMarkPercent: 50,
      durationSeconds: 900,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T10:07:30Z"),
    });
    expect(r.score).toBe(1);
    expect(r.maxScore).toBe(4);
    expect(r.percentage).toBe(25);
    expect(r.correctCount).toBe(1);
    expect(r.wrongCount).toBe(1);
    expect(r.unansweredCount).toBe(1);
    expect(r.accuracy).toBeCloseTo(33.33, 2);
    expect(r.timeTakenSeconds).toBe(450);
    expect(r.passed).toBe(false);
  });

  it("pass boundary is inclusive: percentage == pass_mark_percent passes", () => {
    const r = scoreAttempt({
      questions: [
        { id: "q1", marks: 1, correctOptionId: "a" },
        { id: "q2", marks: 1, correctOptionId: "b" },
      ],
      answers: { q1: "a" },
      negativeMarks: 0,
      passMarkPercent: 50,
      durationSeconds: 600,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T10:01:00Z"),
    });
    expect(r.percentage).toBe(50);
    expect(r.passed).toBe(true);
  });

  it("negative marks reduce score but never below zero when some are correct", () => {
    const r = scoreAttempt({
      questions: [
        { id: "q1", marks: 3, correctOptionId: "a" },
        { id: "q2", marks: 1, correctOptionId: "b" },
        { id: "q3", marks: 1, correctOptionId: "c" },
      ],
      answers: { q1: "a", q2: "nope", q3: "nope" },
      negativeMarks: 1,
      passMarkPercent: 50,
      durationSeconds: 600,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T10:02:00Z"),
    });
    // 3 - (2 * 1) = 1 of 5 max = 20%
    expect(r.score).toBe(1);
    expect(r.maxScore).toBe(5);
    expect(r.percentage).toBe(20);
    expect(r.wrongCount).toBe(2);
  });

  it("empty attempt scores 0 with everything unanswered", () => {
    const r = scoreAttempt({
      questions,
      answers: {},
      negativeMarks: 0,
      passMarkPercent: 50,
      durationSeconds: 900,
      startedAt: new Date("2026-09-20T10:00:00Z"),
      submittedAt: new Date("2026-09-20T10:00:10Z"),
    });
    expect(r.score).toBe(0);
    expect(r.unansweredCount).toBe(3);
    expect(r.accuracy).toBe(0);
    expect(r.passed).toBe(false);
  });
});
