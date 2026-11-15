import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { normalizeWorkoutMethod, prepareMethodExercises } from "../data/workoutMethods.ts";
import type { Exercise } from "../data/workouts.ts";

const exercises = ["스쿼트", "로우", "푸시업"].map((name) => ({ name, sets: 3, restSeconds: 45, details: [] }));

test("서킷은 동작 사이 짧게 쉬고 라운드 끝에는 설정한 만큼 쉰다", () => {
  const result = prepareMethodExercises(exercises, { method: "circuit", rounds: 2, restSeconds: 90 });
  assert.equal(result.length, 6);
  assert.deepEqual(result.map((item) => item.restSeconds), [45, 45, 90, 45, 45, 90]);
  assert.ok(result.every((item) => item.sets === 1));
  assert.deepEqual(result.map((item) => item.executionContext?.roundNumber), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(result.map((item) => item.executionContext?.sourceExerciseIndex), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(result.map((item) => item.executionContext?.sequenceIndex), [0, 1, 2, 3, 4, 5]);
});

test("슈퍼세트는 운동을 두 개씩 묶어 반복한다", () => {
  const result = prepareMethodExercises(exercises, { method: "superset", rounds: 2, restSeconds: 60 });
  assert.deepEqual(result.map((item) => item.name), ["스쿼트", "로우", "스쿼트", "로우", "푸시업", "푸시업"]);
  assert.deepEqual(result.map((item) => item.restSeconds), [0, 60, 0, 60, 60, 60]);
  assert.deepEqual(result.map((item) => item.executionContext?.groupNumber), [1, 1, 1, 1, 2, 2]);
  assert.deepEqual(result.map((item) => item.executionContext?.roundNumber), [1, 1, 2, 2, 1, 2]);
});

test("인터벌 설정은 안전 범위로 보정된다", () => {
  const config = normalizeWorkoutMethod({ method: "interval", rounds: 99, workSeconds: 1, restSeconds: 999 });
  assert.deepEqual(config, { method: "interval", rounds: 8, workSeconds: 10, restSeconds: 300 });
  const result = prepareMethodExercises(exercises.slice(0, 1), config);
  assert.equal(result[0].intervalPlan?.rounds, 8);
  assert.equal(result[0].executionContext?.plannedWorkSeconds, 10);
});

test("일반 세트도 원본 순서와 계획 세트 수를 기록한다", () => {
  const result = prepareMethodExercises(exercises, { method: "standard" });
  assert.deepEqual(result.map((item) => item.executionContext?.sourceExerciseIndex), [0, 1, 2]);
  assert.deepEqual(result.map((item) => item.executionContext?.plannedSets), [3, 3, 3]);
});

test("휴식 0초 설정은 사용자의 선택을 유지한다", () => {
  assert.equal(normalizeWorkoutMethod({ method: "circuit", restSeconds: 0 }).restSeconds, 0);
});

// Actual component render/click functions with synthetic hooks, not a browser,
// React lifecycle, clock accuracy, storage or audio integration test.
type TestNode = { type: string | { name?: string }; props: Record<string, unknown> };
const sessionSource = readFileSync(new URL("../components/WorkoutSession.tsx", import.meta.url), "utf8");
const sessionCode = transformSync(sessionSource, { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
const recommendationSource = readFileSync(new URL("../data/workoutRecommendations.ts", import.meta.url), "utf8");
const recommendationFunctions = recommendationSource.slice(recommendationSource.indexOf("function firstNumber("), recommendationSource.indexOf("export function getProgressionAdvice("));
const getExerciseRecommendation = Function(transformSync(recommendationFunctions.replace("export function", "function"), { loader: "ts" }).code + ";return getExerciseRecommendation;")();

function sessionHarness(items: Exercise[], intensity = "normal") {
  const values: unknown[] = [];
  let cursor = 0;
  let saved = 0;
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  };
  const element = (type: TestNode["type"], props: TestNode["props"]) => ({ type, props });
  function IntervalTimer() {}
  function ExerciseRecordEditor() {}
  const imports: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/components/useDialogFocus": { useDialogFocus() {} },
    "@/components/useUnsavedChanges": { useUnsavedChanges() {} },
    "../data/workoutCompletion": { readWorkoutCompletionStore: () => ({}), getPreviousExerciseRecord: () => undefined },
    "../data/workoutRecommendations": { getExerciseRecommendation },
    "./ExerciseGuidePanel": { __esModule: true, default() {}, getExerciseVideoHref: () => "", getExerciseVideoLabel: () => "" },
    "./ExerciseRecordEditor": { __esModule: true, default: ExerciseRecordEditor },
    "../data/timerClock": {},
    "../data/workoutDuration": { sessionElapsedMinutes: () => 0 },
    "./WorkoutControls": { IntervalTimer },
    "../data/storageTransaction": { notifyRecordsChanged() {} },
    "./useWorkoutVoice": { useWorkoutVoice: () => ({ speak() {}, stop() {}, prepare() {} }) },
  };
  const moduleObject = { exports: {} as { default: (props: unknown) => TestNode } };
  runInNewContext(sessionCode, { module: moduleObject, exports: moduleObject.exports, require(name: string) {
    assert.ok(name in imports, `unexpected import ${name}`);
    return imports[name];
  } });
  const render = () => { cursor = 0; return moduleObject.exports.default({ exercises: items, title: "가상 운동", intensity, onClose() {}, onFinish() { saved++; } }); };
  const all = (node: unknown): TestNode[] => {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as TestNode;
    return [element, ...all(element.props.children)];
  };
  const nodes = () => all(render());
  const named = (name: string) => nodes().filter((node) => typeof node.type !== "string" && node.type.name === name);
  const clickText = (text: string) => {
    const button = nodes().find((node) => node.type === "button" && (JSON.stringify(node.props.children) ?? "").includes(text));
    assert.ok(button, `missing button ${text}`);
    (button.props.onClick as () => void)();
  };
  const record = () => named("ExerciseRecordEditor")[0]?.props.value as { status: string; sets: { completed: boolean }[] };
  return { nodes, named, clickText, record, saves: () => saved };
}

const timedExercise: Exercise = { name: "가상 덤벨 운동", sets: 3, meta: "10회", restSeconds: 45, details: [] };

for (const intensity of ["normal", "70%", "recovery"]) {
  test(`선택 인터벌 ${intensity}은 짧은 자동완료 타이머 없이 구간 타이머와 명시 완료만 사용한다`, () => {
    const items = prepareMethodExercises([timedExercise, timedExercise], { method: "interval", rounds: 3, workSeconds: 30, restSeconds: 60 });
    const session = sessionHarness(items, intensity);
    assert.equal(session.named("TimerButton").length, 0);
    const timers = session.named("IntervalTimer");
    assert.equal(timers.length, 1);
    assert.deepEqual(Object.keys(timers[0].props), ["plan"]);
    assert.equal(timers[0].props.plan, items[0].intervalPlan);
    assert.equal(session.record().status, "pending");
    assert.ok(session.nodes().some((node) => node.type === "p" && String(node.props.children).includes("자동으로 완료 처리하지 않습니다")));
    session.clickText("1세트 완료");
    // Manual completion advances exactly one item; there is no timer callback
    // left to complete the next item or persist a workout result.
    assert.equal(session.record().status, "pending");
    assert.equal(session.named("TimerButton").length, 0);
    assert.equal(session.saves(), 0);
    session.clickText("1세트 완료");
    assert.equal(session.named("IntervalTimer").length, 0);
    assert.ok(session.nodes().some((node) => (JSON.stringify(node.props.children) ?? "").includes("기록 저장하고 종료")));
    assert.equal(session.saves(), 0);
  });
}

for (const method of ["standard", "circuit", "superset", "free"] as const) {
  test(`${method} 기존 동작 자동완료 타이머는 유지한다`, () => {
    const item = { ...timedExercise, meta: "30초" };
    const session = sessionHarness(prepareMethodExercises([item], { method }));
    const timer = session.named("TimerButton")[0];
    assert.ok(timer);
    assert.equal(timer.props.initialSeconds, 30);
    assert.equal(typeof timer.props.onComplete, "function");
    assert.equal(session.named("IntervalTimer").length, 0);
  });
}

test("기본 슬라이딩보드의 단일 구간 및 계획 없는 기존 데이터는 이번 변경 범위가 아니다", () => {
  const plan = { rounds: 1, segments: [{ label: "가볍게", seconds: 60, intensity: "easy" as const }] };
  const builtIn = sessionHarness([{ name: "가상 슬라이딩보드", meta: "1분", intervalPlan: plan, details: [] }]);
  assert.equal(builtIn.named("TimerButton").length, 1);
  assert.equal(builtIn.named("IntervalTimer").length, 1);
  const item = prepareMethodExercises([timedExercise], { method: "interval" })[0];
  delete item.intervalPlan;
  assert.equal(sessionHarness([item]).named("TimerButton").length, 1);
});

test("선택 인터벌에서도 통증 중단과 건너뛰기를 계속 사용할 수 있다", () => {
  const items = prepareMethodExercises([timedExercise], { method: "interval" });
  const pain = sessionHarness(items);
  pain.clickText("통증");
  assert.equal(pain.named("IntervalTimer").length, 0);
  assert.equal(pain.saves(), 0);
  const skip = sessionHarness(items);
  skip.clickText("건너뛰기");
  assert.equal(skip.named("IntervalTimer").length, 0);
  assert.equal(skip.saves(), 0);
});
