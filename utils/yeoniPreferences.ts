export const YEONI_PREFERENCES_KEY = "yeoniAppearanceSettingsV1";

export type YeoniPreferences = {
  appearance?: "cat" | "human";
  visible: boolean;
  motion: "reactions" | "home" | "off";
};

export const DEFAULT_YEONI_PREFERENCES: YeoniPreferences = { visible: true, motion: "reactions", appearance: "cat" };

function parseObject(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** Appearance is a device preference, separate from personal records/cloud backups. */
export function parseYeoniPreferences(raw: string | null, legacyRaw: string | null = null): YeoniPreferences {
  const value = parseObject(raw);
  if (value) return {
    appearance: value.appearance === "human" ? "human" : "cat",
    visible: value.visible !== false,
    motion: value.motion === "home" || value.motion === "off" ? value.motion : "reactions",
  };
  const legacy = parseObject(legacyRaw);
  return {
    appearance: "cat",
    visible: legacy?.showCompanion !== false,
    motion: legacy?.homeCompanionMotion === false ? "off" : "reactions",
  };
}

export function resolveYeoniMotion(preferences: YeoniPreferences, requested: "once" | "ambient" | "off") {
  if (!preferences.visible || preferences.motion === "off" || requested === "off") return "off";
  return requested === "ambient" && preferences.motion === "home" ? "ambient" : "once";
}

export const YEONI_APPS = { assistant: 'AI 연이', fitness: '운동', budget: '가계부', diet: '식단', language: '언어', growth: '자기계발', calendar: '달력' } as const;
export type YeoniApp = keyof typeof YEONI_APPS;
export const YEONI_APP_PREFERENCES_PREFIX = 'yeoniAppAppearanceSettingsV1:';
export const YEONI_PREFERENCE_OWNER_EVENT = 'yeoni-preference-owner-changed';
export function yeoniAppForPath(path: string): YeoniApp {
  const segment = path.split('/')[1];
  return Object.hasOwn(YEONI_APPS, segment) ? segment as YeoniApp : 'assistant';
}
export function yeoniAppPreferencesKey(owner: string | null) {
  return YEONI_APP_PREFERENCES_PREFIX + (owner ? `account:${encodeURIComponent(owner)}` : 'guest');
}
export function parseAppYeoniPreferences(raw: string | null): Partial<Record<YeoniApp, YeoniPreferences>> {
  const object = parseObject(raw);
  const result: Partial<Record<YeoniApp, YeoniPreferences>> = {};
  for (const app of Object.keys(YEONI_APPS) as YeoniApp[]) {
    const value = object?.[app];
    if (value && typeof value === 'object' && !Array.isArray(value)) result[app] = parseYeoniPreferences(JSON.stringify(value));
  }
  return result;
}
