import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFitnessAiReviewSummary,
  buildWorkoutOutcomeBaseline,
  evaluateFitnessAiReviewOutcomes,
  normalizeFitnessAiReviewRecord,
  type FitnessAiReviewRecord,
} from "./fitnessAiReviewHistory.ts";
import type { WorkoutCompletionStore } from "./workoutCompletion.ts";

function completedWorkout(options: { pain?: boolean; fatigue?: number; status?: "completed" | "partial" | "stopped" } = {}) {
  return {
    workoutDone: true,
    workoutStatus: options.status ?? "completed",
    workoutFatigue: options.fatigue ?? 2,
    workoutPain: options.pain,
    workoutExerciseRecords: [
      {
        exerciseName: "버드독",
        status: options.status === "stopped" ? "partial" as const : "completed" as const,
        sets: [{ setNumber: 1, completed: true, reps: 8 }],
      },
    ],
  };
}

const baseReview: FitnessAiReviewRecord = {
  id: "f17c9c38-ec42-4d09-9371-a109864c5cde",
  analysisType: "program",
  analysisLabel: "내 운동계획 정밀 점검",
  source: "cloud",
  summary: {
    overview: "현재 계획을 유지합니다.",
    positives: ["꾸준합니다."],
    cautions: [],
    nextSession: ["통증을 기록하세요."],
    rationale: "최근 기록 기준입니다.",
    safety: "통증 시 중단하세요.",
    confidence: "보통",
  },
  baseline: {
    oneWeek: { workoutDays: 1, minutes: 0, completionRate: 100, painDays: 0, highFatigueDays: 0, stoppedDays: 0, completedSets: 1 },
    fourWeeks: { workoutDays: 3, minutes: 0, completionRate: 100, painDays: 0, highFatigueDays: 0, stoppedDays: 0, completedSets: 3 },
  },
  decision: "applied",
  decisionSelection: { dayIds: [], exerciseNames: [] },
  decidedAt: "2026-09-01T09:00:00.000Z",
  createdAt: "2026-09-01T08:55:00.000Z",
};

test("선택 직전 7일과 28일 기준 지표를 서로 다른 기간으로 만든다", () => {
  const workouts: WorkoutCompletionStore = {
    "2026-08-10": completedWorkout({ pain: true, fatigue: 5, status: "stopped" }),
    "2026-08-30": completedWorkout(),
  };
  const baseline = buildWorkoutOutcomeBaseline(workouts, new Date("2026-09-01T12:00:00.000Z"));
  assert.equal(baseline.oneWeek.workoutDays, 1);
  assert.equal(baseline.oneWeek.painDays, 0);
  assert.equal(baseline.fourWeeks.workoutDays, 2);
  assert.equal(baseline.fourWeeks.painDays, 1);
  assert.equal(baseline.fourWeeks.highFatigueDays, 1);
  assert.equal(baseline.fourWeeks.stoppedDays, 1);
});

test("추천 후 7일 전에는 남은 날짜만 안내하고 운동 기록을 평가하지 않는다", () => {
  const outcomes = evaluateFitnessAiReviewOutcomes(
    baseReview,
    { "2026-09-02": completedWorkout() },
    new Date("2026-09-05T12:00:00.000Z"),
  );
  assert.equal(outcomes[0].status, "pending");
  assert.equal(outcomes[0].remainingDays, 3);
  assert.equal(outcomes[0].current, undefined);
  assert.equal(outcomes[1].remainingDays, 24);
});

test("안전 신호가 늘지 않고 운동일이 늘면 1주 개선 신호로 표시한다", () => {
  const workouts: WorkoutCompletionStore = {
    "2026-09-02": completedWorkout(),
    "2026-09-05": completedWorkout(),
  };
  const outcome = evaluateFitnessAiReviewOutcomes(
    baseReview,
    workouts,
    new Date("2026-09-08T12:00:00.000Z"),
  )[0];
  assert.equal(outcome.status, "improved");
  assert.equal(outcome.current?.workoutDays, 2);
  assert.equal(outcome.current?.painDays, 0);
});

test("통증이나 높은 피로가 기준보다 늘면 운동량보다 회복 확인을 우선한다", () => {
  const workouts: WorkoutCompletionStore = {
    "2026-09-03": completedWorkout({ pain: true, fatigue: 5 }),
    "2026-09-05": completedWorkout(),
  };
  const outcome = evaluateFitnessAiReviewOutcomes(
    baseReview,
    workouts,
    new Date("2026-09-08T12:00:00.000Z"),
  )[0];
  assert.equal(outcome.status, "caution");
  assert.match(outcome.detail, /강도를 올리지/);
});

test("4주 효과는 선택 다음 날부터 28일까지만 기준 28일과 비교한다", () => {
  const workouts: WorkoutCompletionStore = {
    "2026-09-02": completedWorkout(),
    "2026-09-10": completedWorkout(),
    "2026-09-20": completedWorkout(),
    "2026-09-29": completedWorkout(),
    "2026-09-30": completedWorkout({ pain: true, fatigue: 5 }),
  };
  const outcome = evaluateFitnessAiReviewOutcomes(
    baseReview,
    workouts,
    new Date("2026-09-29T12:00:00.000Z"),
  )[1];
  assert.equal(outcome.status, "improved");
  assert.equal(outcome.current?.workoutDays, 4);
  assert.equal(outcome.current?.painDays, 0);
});

test("저장 요약은 원본 운동일·세트 데이터 없이 분석과 계획 요약만 남긴다", () => {
  const summary = buildFitnessAiReviewSummary({
    overview: "요약",
    positives: ["장점"],
    cautions: ["주의"],
    nextSession: ["다음"],
    rationale: "근거",
    safety: "안전",
    confidence: "높음",
    planProposal: {
      title: "안전 계획",
      summary: "현재 유지",
      days: [{ dayId: "mon", groupId: "core" }],
      exerciseTargets: [{ exerciseName: "버드독", sets: 2 }],
      changes: ["회복일 유지"],
      cautions: ["자동 적용 안 함"],
    },
  });
  assert.equal(summary.plan?.title, "안전 계획");
  assert.equal("days" in (summary.plan ?? {}), false);
  assert.doesNotMatch(JSON.stringify(summary), /exerciseTargets/);
});

test("Supabase 행을 화면에서 쓰는 안전한 형식으로 변환한다", () => {
  const review = normalizeFitnessAiReviewRecord({
    id: baseReview.id,
    analysis_type: "program",
    analysis_label: "점검",
    source: "recovered",
    result_summary: baseReview.summary,
    baseline_7d: baseReview.baseline.oneWeek,
    baseline_28d: baseReview.baseline.fourWeeks,
    decision: "partial",
    decision_selection: { dayIds: ["mon"], exerciseNames: ["버드독"] },
    decided_at: baseReview.decidedAt,
    created_at: baseReview.createdAt,
  });
  assert.equal(review?.decision, "partial");
  assert.deepEqual(review?.decisionSelection.dayIds, ["mon"]);
  assert.equal(review?.source, "recovered");
});

const unfinishedExercise = {
  exerciseName: "버드독",
  status: "partial" as const,
  sets: [{ setNumber: 1, completed: false, reps: 0 }],
};
const increasedSafetyCases = [
  { name: "통증", feedback: { workoutPain: true }, metric: "painDays" },
  { name: "높은 피로", feedback: { workoutFatigue: 5 }, metric: "highFatigueDays" },
  { name: "운동 중단", feedback: { workoutStatus: "stopped" as const }, metric: "stoppedDays" },
  { name: "통증·피로·중단", feedback: { workoutPain: true, workoutFatigue: 5, workoutStatus: "stopped" as const }, metric: "stoppedDays" },
] as const;

for (const periodDays of [7, 28] as const) {
  const outcomeIndex = periodDays === 7 ? 0 : 1;
  const now = new Date("2026-09-29T12:00:00.000Z");
  for (const scenario of increasedSafetyCases) {
    test(`${periodDays}일 효과는 완료 운동·세트가 0이어도 ${scenario.name} 증가를 먼저 알린다`, () => {
      const workouts: WorkoutCompletionStore = {
        "2026-09-03": {
          workoutDone: false,
          workoutExerciseRecords: [unfinishedExercise],
          ...scenario.feedback,
        },
      };
      const outcome = evaluateFitnessAiReviewOutcomes(baseReview, workouts, now)[outcomeIndex];
      assert.equal(outcome.current?.workoutDays, 0);
      assert.equal(outcome.current?.completedSets, 0);
      assert.equal(outcome.current?.[scenario.metric], 1);
      assert.equal(outcome.status, "caution");
      assert.equal(outcome.statusLabel, "회복 확인");
      assert.match(outcome.detail, /강도를 올리지/);
    });
  }

  test(`${periodDays}일 효과는 안전 신호도 완료 기록도 없으면 기록 부족을 유지한다`, () => {
    const scenarios: WorkoutCompletionStore[] = [{}, {
      "2026-09-03": { workoutDone: false, workoutExerciseRecords: [unfinishedExercise] },
    }];
    for (const workouts of scenarios) {
      const outcome = evaluateFitnessAiReviewOutcomes(baseReview, workouts, now)[outcomeIndex];
      assert.equal(outcome.status, "insufficient");
      assert.equal(outcome.current?.workoutDays, 0);
      assert.equal(outcome.current?.completedSets, 0);
      assert.equal(outcome.current?.painDays, 0);
      assert.equal(outcome.current?.highFatigueDays, 0);
      assert.equal(outcome.current?.stoppedDays, 0);
    }
  });

  test(`${periodDays}일 효과는 기준보다 늘지 않은 안전 신호의 기존 정책을 바꾸지 않는다`, () => {
    const review: FitnessAiReviewRecord = {
      ...baseReview,
      baseline: {
        oneWeek: { ...baseReview.baseline.oneWeek, painDays: 1, highFatigueDays: 1, stoppedDays: 1 },
        fourWeeks: { ...baseReview.baseline.fourWeeks, painDays: 1, highFatigueDays: 1, stoppedDays: 1 },
      },
    };
    const workouts: WorkoutCompletionStore = {
      "2026-09-03": {
        workoutDone: false, workoutPain: true, workoutFatigue: 5, workoutStatus: "stopped",
        workoutExerciseRecords: [unfinishedExercise],
      },
    };
    const outcome = evaluateFitnessAiReviewOutcomes(review, workouts, now)[outcomeIndex];
    assert.equal(outcome.status, "insufficient");
  });
}

test("비교 기간 전에는 미완료 안전 기록이 있어도 기간 대기 정책을 유지한다", () => {
  const outcomes = evaluateFitnessAiReviewOutcomes(baseReview, {
    "2026-09-03": {
      workoutDone: false, workoutPain: true, workoutFatigue: 5, workoutStatus: "stopped",
      workoutExerciseRecords: [unfinishedExercise],
    },
  }, new Date("2026-09-05T12:00:00.000Z"));
  assert.deepEqual(outcomes.map(outcome => outcome.status), ["pending", "pending"]);
  assert.deepEqual(outcomes.map(outcome => outcome.remainingDays), [3, 24]);
  assert.ok(outcomes.every(outcome => outcome.current === undefined));
});
