import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleEventResource,
  buildGoogleEventPatch,
  matchesGoogleEventPatchResult,
  validGoogleEventEtag,
  getCalendarMonthBounds,
  isSameGoogleCalendarEvent,
  mapGoogleCalendarEvent,
  parseGoogleCalendarEventInput,
  type GoogleEventResource,
} from "@/lib/google-calendar";
import {
  GoogleCalendarConnectionError,
  getGoogleCalendarConfig,
  googleCalendarApiRequest,
} from "@/lib/google-calendar-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function authenticate() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

function errorResponse(error: unknown) {
  if (error instanceof GoogleCalendarConnectionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && (error.message.includes("날짜") || error.message.includes("월을 선택"))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Google Calendar 요청을 처리하지 못했습니다." }, { status: 500 });
}

async function googleRequest(
  request: NextRequest,
  method: string,
  path: string,
  body?: GoogleEventResource,
) {
  const { supabase, user } = await authenticate();
  if (!user) return { response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const config = getGoogleCalendarConfig(request.nextUrl.origin);
  const response = await googleCalendarApiRequest(supabase, user.id, config.clientSecret, path, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  return { response, supabase, user, config };
}

async function readGoogleItems(response: Response) {
  const data = await response.json().catch(() => ({})) as { items?: GoogleEventResource[]; error?: unknown };
  if (!response.ok) throw new GoogleCalendarConnectionError("Google 일정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.", response.status === 403 ? 403 : 502);
  return Array.isArray(data.items) ? data.items : [];
}

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") || "";
    const { timeMin, timeMax } = getCalendarMonthBounds(month);
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: "Asia/Seoul",
    });
    const result = await googleRequest(request, "GET", `/calendars/primary/events?${params}`);
    if (result.response instanceof NextResponse) return result.response;
    const items = await readGoogleItems(result.response);
    return NextResponse.json({ events: items.map(mapGoogleCalendarEvent).filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 20_000) return NextResponse.json({ error: "요청 내용이 너무 깁니다." }, { status: 413 });
  try {
    const parsed = parseGoogleCalendarEventInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;
    const dayEnd = new Date(`${input.date}T00:00:00+09:00`);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const duplicateParams = new URLSearchParams({
      timeMin: `${input.date}T00:00:00+09:00`,
      timeMax: dayEnd.toISOString(),
      singleEvents: "true",
      maxResults: "250",
    });
    const existing = await googleRequest(request, "GET", `/calendars/primary/events?${duplicateParams}`);
    if (existing.response instanceof NextResponse) return existing.response;
    const duplicate = (await readGoogleItems(existing.response)).find((item) => isSameGoogleCalendarEvent(item, input));
    if (duplicate) {
      return NextResponse.json({ event: mapGoogleCalendarEvent(duplicate), duplicate: true });
    }

    const inserted = await googleRequest(request, "POST", "/calendars/primary/events?sendUpdates=none", buildGoogleEventResource(input));
    if (inserted.response instanceof NextResponse) return inserted.response;
    const data = await inserted.response.json().catch(() => ({})) as GoogleEventResource;
    if (!inserted.response.ok) throw new GoogleCalendarConnectionError("Google 일정을 추가하지 못했습니다.", 502);
    return NextResponse.json({ event: mapGoogleCalendarEvent(data), duplicate: false }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 20_000) return NextResponse.json({ error: "요청 내용이 너무 깁니다." }, { status: 413 });
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id || id.length > 1_024) return NextResponse.json({ error: "수정할 일정을 선택해주세요." }, { status: 400 });
    const parsed = parseGoogleCalendarEventInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const expectedEtag = body?.expectedEtag;
    if (!validGoogleEventEtag(expectedEtag) || (parsed.value.allDay && typeof body?.endDate !== "string")) {
      return NextResponse.json({ error: "기간과 일정 버전을 확인해야 합니다. 초안을 보관하고 목록을 새로고침한 뒤 다시 수정해 주세요." }, { status: 409 });
    }
    // One authenticated account/context for both the original read and conditional write.
    const { supabase, user } = await authenticate();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const config = getGoogleCalendarConfig(request.nextUrl.origin);
    const path = `/calendars/primary/events/${encodeURIComponent(id)}`;
    const originalResponse = await googleCalendarApiRequest(supabase, user.id, config.clientSecret, path, { method: "GET" });
    if (!originalResponse.ok) return NextResponse.json({ error: "원본 일정을 읽지 못했습니다. 초안을 유지하고 목록을 새로고침해 주세요." }, { status: 502 });
    const original = await originalResponse.json().catch(() => null) as GoogleEventResource | null;
    if (!original || original.id !== id || !validGoogleEventEtag(original.etag) || original.etag !== expectedEtag) {
      return NextResponse.json({ error: "일정이 바뀌었거나 버전을 확인할 수 없습니다. 초안을 보관하고 목록을 새로고침한 뒤 다시 수정해 주세요." }, { status: 409 });
    }
    const mapped = mapGoogleCalendarEvent(original);
    if (!mapped || mapped.editBlockedReason || mapped.allDay !== parsed.value.allDay) {
      return NextResponse.json({ error: mapped?.editBlockedReason || "이 일정 형태는 Google Calendar에서 수정해 주세요." }, { status: 409 });
    }
    const patch = buildGoogleEventPatch(original, parsed.value);
    if (Object.keys(patch).length === 0) return NextResponse.json({ event: mapped });
    const updated = await googleCalendarApiRequest(supabase, user.id, config.clientSecret, `${path}?sendUpdates=none`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": original.etag }, body: JSON.stringify(patch),
    });
    if (updated.status === 412) return NextResponse.json({ error: "다른 곳에서 일정이 변경되어 저장하지 않았습니다. 초안을 보관하고 목록을 새로고침한 뒤 다시 수정해 주세요." }, { status: 409 });
    if (!updated.ok) throw new GoogleCalendarConnectionError("Google 일정을 수정하지 못했습니다. 초안을 유지하고 목록을 확인해 주세요.", 502);
    const data = await updated.json().catch(() => null) as GoogleEventResource | null;
    if (!matchesGoogleEventPatchResult(original, patch, data)) {
      return NextResponse.json({ error: "저장 결과를 확인하지 못했습니다. 이미 저장됐을 수 있으니 바로 다시 저장하지 말고, 초안을 보관한 뒤 목록을 새로고침해 결과를 확인해 주세요.", saveOutcomeUnknown: true }, { status: 502 });
    }
    return NextResponse.json({ event: mapGoogleCalendarEvent(data!) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id || id.length > 1_024) return NextResponse.json({ error: "삭제할 일정을 선택해주세요." }, { status: 400 });
    const deleted = await googleRequest(request, "DELETE", `/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`);
    if (deleted.response instanceof NextResponse) return deleted.response;
    if (!deleted.response.ok && deleted.response.status !== 410) throw new GoogleCalendarConnectionError("Google 일정을 삭제하지 못했습니다.", 502);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
