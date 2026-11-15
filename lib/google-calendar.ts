export const GOOGLE_CALENDAR_TIME_ZONE = "Asia/Seoul";

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  date: string;
  /** Last included day; Google end.date is exclusive. */
  endDate?: string;
  startLabel: string;
  endLabel?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  etag?: string;
  editBlockedReason?: string;
  htmlLink?: string;
  description?: string;
};

export type GoogleCalendarEventInput = {
  title: string;
  date: string;
  /** Last included day; Google end.date is exclusive. */
  endDate?: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  description?: string;
};

export function getGoogleCalendarDayPreview(events: GoogleCalendarEvent[]) {
  const first = events[0];
  if (!first) return null;
  return {
    title: first.title,
    additionalCount: Math.max(0, events.length - 1),
  };
}

type GoogleEventDate = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleEventResource = {
  id?: string;
  etag?: string;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  eventType?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  extendedProperties?: { private?: Record<string, string> };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addCalendarDays(value: string, days: number) {
  if (!isRealDate(value)) throw new Error("올바른 날짜가 아닙니다.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getCalendarMonthBounds(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("올바른 월을 선택해주세요.");
  const [year, month] = monthKey.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("올바른 월을 선택해주세요.");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    timeMin: `${monthKey}-01T00:00:00+09:00`,
    timeMax: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`,
  };
}

export function parseGoogleCalendarEventInput(raw: unknown):
  | { ok: true; value: GoogleCalendarEventInput }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "일정 내용을 입력해주세요." };
  const body = raw as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const allDay = body.allDay === true;
  const endDate = body.endDate === undefined ? date : typeof body.endDate === "string" ? body.endDate : "";
  const startTime = typeof body.startTime === "string" ? body.startTime : "";
  const endTime = typeof body.endTime === "string" ? body.endTime : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title) return { ok: false, error: "일정 제목을 입력해주세요." };
  if (title.length > 120) return { ok: false, error: "일정 제목은 120자 이내로 입력해주세요." };
  if (!isRealDate(date)) return { ok: false, error: "올바른 날짜를 선택해주세요." };
  if (allDay && (!isRealDate(endDate) || endDate < date || endDate === "9999-12-31")) return { ok: false, error: "마지막 날짜는 시작 날짜 이상인 올바른 날짜여야 합니다." };
  if (description.length > 1_000) return { ok: false, error: "메모는 1,000자 이내로 입력해주세요." };
  if (!allDay) {
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return { ok: false, error: "시작 시간과 끝 시간을 선택해주세요." };
    }
    if (endTime <= startTime) return { ok: false, error: "끝 시간은 시작 시간보다 늦어야 합니다." };
  }

  return {
    ok: true,
    value: {
      title,
      date,
      allDay,
      endDate: allDay ? endDate : undefined,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      description: description || undefined,
    },
  };
}

export function buildGoogleEventResource(input: GoogleCalendarEventInput): GoogleEventResource {
  const shared = {
    summary: input.title,
    ...(input.description ? { description: input.description } : {}),
    extendedProperties: { private: { jaceAiFitnessApp: "calendar" } },
  };
  if (input.allDay) {
    return {
      ...shared,
      start: { date: input.date },
      end: { date: addCalendarDays(input.endDate ?? input.date, 1) },
    };
  }
  return {
    ...shared,
    start: { dateTime: `${input.date}T${input.startTime}:00+09:00`, timeZone: GOOGLE_CALENDAR_TIME_ZONE },
    end: { dateTime: `${input.date}T${input.endTime}:00+09:00`, timeZone: GOOGLE_CALENDAR_TIME_ZONE },
  };
}

function formatDateInSeoul(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function formatTimeInSeoul(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return `${pick("hour")}:${pick("minute")}`;
}

export function validGoogleEventEtag(value: unknown): value is string {
  return typeof value === "string" && /^"[\x21\x23-\x7e]+"$/.test(value) && value.length <= 1024;
}

function validDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isRealDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function mapGoogleCalendarEvent(item: GoogleEventResource): GoogleCalendarEvent | null {
  if (!item || !item.id || item.status === "cancelled" || !item.start) return null;
  const allDay = Boolean(item.start.date);
  let date: string, endDate: string | undefined, startTime: string | undefined, endTime: string | undefined;
  let shapeError = "";
  if (allDay) {
    if (!isRealDate(item.start.date!)) return null;
    date = item.start.date!;
    if (!item.end?.date || !isRealDate(item.end.date) || item.end.date <= date || item.start.dateTime || item.end.dateTime) {
      shapeError = "기간을 확인할 수 없어 여기서는 수정할 수 없어요.";
    } else endDate = addCalendarDays(item.end.date, -1);
  } else {
    if (!validDateTime(item.start.dateTime)) return null;
    date = formatDateInSeoul(item.start.dateTime);
    startTime = formatTimeInSeoul(item.start.dateTime);
    if (!validDateTime(item.end?.dateTime) || item.end?.date) shapeError = "끝 시간을 확인할 수 없어 여기서는 수정할 수 없어요.";
    else {
      endDate = formatDateInSeoul(item.end.dateTime);
      endTime = formatTimeInSeoul(item.end.dateTime);
      if (endDate !== date || endTime <= startTime || Date.parse(item.end.dateTime) <= Date.parse(item.start.dateTime)) {
        shapeError = "날짜를 넘기거나 분 단위로 표현할 수 없는 시간 일정은 Google Calendar에서 수정해 주세요.";
      }
    }
  }
  if (item.endTimeUnspecified || item.recurrence?.length || (item.eventType && item.eventType !== "default")) shapeError = "특수하거나 반복되는 일정은 Google Calendar에서 수정해 주세요.";
  const editBlockedReason = shapeError || (!validGoogleEventEtag(item.etag) ? "일정 버전을 확인할 수 없어요. 목록을 새로고침해 주세요." : undefined);
  return {
    id: item.id, title: item.summary?.trim() || "제목 없는 일정", date, endDate,
    startLabel: allDay ? "종일" : startTime || "", endLabel: endTime, startTime, endTime, allDay,
    etag: validGoogleEventEtag(item.etag) ? item.etag : undefined, editBlockedReason,
    htmlLink: item.htmlLink, description: item.description,
  };
}

/** Minimal conditional patch: never echo attendees, reminders or extended properties. */
export function buildGoogleEventPatch(original: GoogleEventResource, input: GoogleCalendarEventInput): GoogleEventResource {
  const mapped = mapGoogleCalendarEvent(original);
  if (!mapped || mapped.editBlockedReason) throw new Error(mapped?.editBlockedReason || "원본 일정을 확인할 수 없습니다.");
  if (input.allDay !== mapped.allDay) throw new Error("일정 종류 변경은 Google Calendar에서 해 주세요.");
  const patch: GoogleEventResource = {};
  if (input.title !== mapped.title) patch.summary = input.title;
  if ((input.description || "") !== (original.description || "").trim()) patch.description = input.description || "";
  // Preserve each unchanged endpoint verbatim on Google's side, including zone/seconds.
  const sameStart = input.date === mapped.date && (input.allDay || input.startTime === mapped.startTime);
  const sameEnd = input.allDay ? input.endDate === mapped.endDate
    : input.date === mapped.endDate && input.endTime === mapped.endTime;
  if (!sameStart || !sameEnd) {
    const next = buildGoogleEventResource(input);
    if (!sameStart) patch.start = next.start;
    if (!sameEnd) patch.end = next.end;
  }
  return patch;
}

/** A successful HTTP status is not proof that the intended resource was saved. */
export function matchesGoogleEventPatchResult(original: GoogleEventResource, patch: GoogleEventResource, result: GoogleEventResource | null): boolean {
  try {
    if (!result || result.id !== original.id || !validGoogleEventEtag(result.etag) || result.etag === original.etag) return false;
    const mapped = mapGoogleCalendarEvent(result);
    if (!mapped || mapped.editBlockedReason) return false;
    const expected = { ...original, ...patch };
    if ((result.summary || "") !== (expected.summary || "") || (result.description || "") !== (expected.description || "")) return false;
    for (const key of ["start", "end"] as const) {
      const wanted = expected[key], actual = result[key];
      if (!wanted || !actual) return false;
      if (wanted.date) {
        if (actual.date !== wanted.date || actual.dateTime) return false;
      } else if (!validDateTime(wanted.dateTime) || !validDateTime(actual.dateTime) || actual.date
        || Date.parse(actual.dateTime) !== Date.parse(wanted.dateTime)) return false;
    }
    return true;
  } catch { return false; }
}

export function isSameGoogleCalendarEvent(item: GoogleEventResource, input: GoogleCalendarEventInput) {
  if ((item.summary || "").trim().toLocaleLowerCase("ko-KR") !== input.title.trim().toLocaleLowerCase("ko-KR")) return false;
  if (input.allDay) return item.start?.date === input.date && item.end?.date === addCalendarDays(input.endDate ?? input.date, 1);
  if (!item.start?.dateTime || !item.end?.dateTime) return false;
  return new Date(item.start.dateTime).getTime() === new Date(`${input.date}T${input.startTime}:00+09:00`).getTime()
    && new Date(item.end.dateTime).getTime() === new Date(`${input.date}T${input.endTime}:00+09:00`).getTime();
}
