import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { normalizeWorkoutMethod, prepareMethodExercises } from "../data/workoutMethods.ts";
import type { Exercise, IntervalPlan } from "../data/workouts.ts";

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

test("0초 휴식 인터벌은 설정·메타·계획값을 보존하고 실행 구간만 생략한다", () => {
  const config = { method: "interval" as const, rounds: 3, workSeconds: 30, restSeconds: 0 };
  const input = structuredClone(timedExercise);
  const before = structuredClone({ input, config });
  const result = prepareMethodExercises([input], config)[0];
  assert.deepEqual(result.intervalPlan, { rounds: 3, segments: [{ label: "운동", seconds: 30, intensity: "자세 유지" }] });
  assert.equal(result.executionContext?.plannedRestSeconds, 0);
  assert.equal(result.executionContext?.plannedWorkSeconds, 30);
  assert.match(result.meta ?? "", /30초 운동 · 0초 휴식 × 3라운드/);
  assert.equal(normalizeWorkoutMethod(config).restSeconds, 0);
  assert.deepEqual({ input, config }, before);
});

type IntervalNode = { type: string; props: Record<string, unknown>; children: unknown[] };
type TimerSlot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
const controlsSource = readFileSync(new URL("../components/WorkoutControls.tsx", import.meta.url), "utf8");
const intervalSource = controlsSource.slice(controlsSource.indexOf("export function IntervalTimer("), controlsSource.indexOf("export function AbSlideGate("));
const intervalCode = transformSync(intervalSource.replace("export function", "function") + "\nglobalThis.Component = IntervalTimer;", { loader: "tsx", jsxFactory: "h" }).code;

// Exact existing IntervalTimer render/effect/button callbacks driven by synthetic
// hooks and one-second scheduled ticks. This is not React/browser wall-clock QA.
function intervalHarness(initialPlan: IntervalPlan) {
  let plan = initialPlan;
  const slots: TimerSlot[] = [];
  const active = new Map<number, () => void>();
  let cursor = 0;
  let nextId = 0;
  let dirty = true;
  let pending: (() => void)[] = [];
  let tree: unknown;
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const context = {
    Component: undefined as undefined | ((props: { plan: IntervalPlan }) => unknown),
    h: (type: string, props: Record<string, unknown> | null, ...children: unknown[]): IntervalNode => ({ type, props: props ?? {}, children }),
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (next: unknown) => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect() || undefined; });
      }
    },
    window: {
      setInterval(callback: () => void, milliseconds: number) { assert.equal(milliseconds, 1000); active.set(++nextId, callback); return nextId; },
      clearInterval(id: number) { active.delete(id); },
    },
  };
  runInNewContext(intervalCode, context);
  const flush = () => {
    let renders = 0;
    while (dirty || pending.length) {
      assert.ok(++renders < 30, "bounded synthetic effect flush");
      if (dirty) { dirty = false; cursor = 0; tree = context.Component!({ plan }); }
      const effects = pending; pending = [];
      for (const effect of effects) effect();
    }
  };
  const nodes = (node: unknown): IntervalNode[] => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object" || !("children" in node)) return [];
    const element = node as IntervalNode;
    return [element, ...nodes(element.children)];
  };
  flush();
  return {
    snapshot: () => ({ index: slots[1].value, left: slots[2].value, running: slots[3].value, finished: slots[4].value, timers: active.size }),
    click(index: number) { const buttons = nodes(tree).filter((node) => node.type === "button"); assert.ok(buttons[index]); (buttons[index].props.onClick as () => void)(); flush(); },
    tick(count = 1) { for (let i = 0; i < count; i++) { for (const callback of [...active.values()]) callback(); flush(); } },
    text: () => JSON.stringify(tree),
    changePlan(next: IntervalPlan) { plan = next; dirty = true; flush(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); assert.equal(active.size, 0); },
  };
}

function preparedInterval(restSeconds: number, rounds = 3, workSeconds = 30): IntervalPlan {
  return prepareMethodExercises([timedExercise], { method: "interval", restSeconds, rounds, workSeconds })[0].intervalPlan!;
}

test("0초 휴식은 30·60·90tick 경계에서 다음 라운드와 최종 완료를 처리한다", () => {
  const timer = intervalHarness(preparedInterval(0));
  timer.click(0);
  timer.tick(29);
  assert.deepEqual(timer.snapshot(), { index: 0, left: 1, running: true, finished: false, timers: 1 });
  timer.tick();
  assert.deepEqual(timer.snapshot(), { index: 1, left: 30, running: true, finished: false, timers: 1 });
  timer.tick(30);
  assert.deepEqual(timer.snapshot(), { index: 2, left: 30, running: true, finished: false, timers: 1 });
  timer.tick(29);
  assert.equal(timer.snapshot().finished, false);
  timer.tick();
  assert.deepEqual(timer.snapshot(), { index: 2, left: 0, running: false, finished: true, timers: 0 });
  assert.match(timer.text(), /인터벌 완료!/);
  timer.tick(30);
  assert.equal(timer.snapshot().timers, 0);
  timer.unmount();
});

test("0초 휴식의 경계 일시정지·재개·초기화와 계획 변경은 남은 구간을 보존한다", () => {
  const timer = intervalHarness(preparedInterval(0));
  timer.click(0); timer.tick(29); timer.click(0); timer.tick(100);
  assert.deepEqual(timer.snapshot(), { index: 0, left: 1, running: false, finished: false, timers: 0 });
  timer.click(0); timer.tick(); timer.click(0); timer.tick(100);
  assert.deepEqual(timer.snapshot(), { index: 1, left: 30, running: false, finished: false, timers: 0 });
  timer.click(0); timer.tick(60);
  assert.equal(timer.snapshot().finished, true);
  timer.click(1);
  assert.deepEqual(timer.snapshot(), { index: 0, left: 30, running: false, finished: false, timers: 0 });
  timer.click(0); timer.tick(35); timer.click(1);
  assert.equal(timer.snapshot().index, 0); assert.equal(timer.snapshot().left, 30); assert.equal(timer.snapshot().timers, 0);
  timer.click(0); timer.tick(5); timer.changePlan(preparedInterval(60));
  assert.deepEqual(timer.snapshot(), { index: 0, left: 30, running: false, finished: false, timers: 0 });
  timer.click(0); timer.tick(30);
  assert.equal(timer.snapshot().index, 1); assert.equal(timer.snapshot().left, 60);
  timer.unmount();
});

test("양수 휴식은 마지막 휴식까지 유지하고 1초는93tick·60초는270tick에 끝난다", () => {
  for (const [rest, total] of [[1, 93], [60, 270]]) {
    const plan = preparedInterval(rest);
    assert.deepEqual(plan.segments.map((segment) => segment.seconds), [30, rest]);
    const timer = intervalHarness(plan); timer.click(0); timer.tick(total - 1);
    assert.equal(timer.snapshot().finished, false); assert.equal(timer.snapshot().left, 1);
    timer.tick(); assert.equal(timer.snapshot().finished, true); assert.equal(timer.snapshot().index, 5); assert.equal(timer.snapshot().timers, 0);
    timer.unmount();
  }
});

test("0초 휴식의 최소·최대 라운드와 운동 시간은 운동 구간 총량만큼 진행한다", () => {
  for (const rounds of [1, 8]) for (const work of [10, 600]) {
    const timer = intervalHarness(preparedInterval(0, rounds, work)); timer.click(0); timer.tick(rounds * work - 1);
    assert.equal(timer.snapshot().finished, false);
    timer.tick(); assert.equal(timer.snapshot().finished, true); assert.equal(timer.snapshot().index, rounds - 1); assert.equal(timer.snapshot().timers, 0);
    timer.unmount();
  }
});

test("0초 휴식 변경은 기존 단일 구간과 다른 운동 방식의 계획을 수정하지 않는다", () => {
  const plan = { rounds: 1, segments: [{ label: "가상 가볍게", seconds: 10, intensity: "가볍게" }] };
  const exercise = { ...timedExercise, intervalPlan: plan };
  for (const method of ["standard", "free", "circuit", "superset"] as const) {
    const result = prepareMethodExercises([exercise], { method, restSeconds: 0 });
    assert.ok(result.every((item) => item.intervalPlan === plan));
  }
  const timer = intervalHarness(plan); timer.click(0); timer.tick(9); assert.equal(timer.snapshot().finished, false);
  timer.tick(); assert.equal(timer.snapshot().finished, true); timer.unmount();
});
