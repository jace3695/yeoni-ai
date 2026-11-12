-- LOCAL SYNTHETIC PGLITE PROTOTYPE ONLY. NOT A MIGRATION. NOT RELEASE READY.
-- Rejects destructive whole-state writes; never rewrites NEW or silently merges.
-- Does not change an existing function, ACL, RLS policy, role or application row.
-- The fixture flag is an accident-prevention check, NOT an authorization mechanism.
do $$ begin
  if current_setting('yeoni.chunk_guard_fixture', true) is distinct from 'synthetic-pglite-only' then
    raise exception 'This prototype must only run in its disposable synthetic fixture';
  end if;
end $$;

create function public.yeoni_japanese_chunk_guard_prototype()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  before_state jsonb := '{}'::jsonb;
  before_marker text;
  after_marker text;
  before_time timestamptz;
  after_time timestamptz;
  is_reset boolean := false;
  old_doc jsonb;
  new_doc jsonb;
  raw text;
  doc jsonb;
  event_key text;
  event_value jsonb;
  answered timestamptz;
  pass integer;
  reset_keys text[] := array['dailyRoutineProgress','dailyLearningHistory','japaneseCurriculumProgressV1','japaneseCurriculumReviewV1','savedWords','savedSentences','wrongKana','wrongKanaChars','wrongWords','wrongSentences','grammarProgress','reviewCompletedItemsByDate','japaneseLevelJourneyV1','japaneseChunkReviewV1'];
  event_fields text[] := array['lessonId','questionId','attemptId','correct','neededHelp','mode','answeredAt'];
begin
  if tg_op = 'UPDATE' then
    before_state := old.state;
    if new.user_id is distinct from old.user_id then
      raise exception 'YEONI_CHUNK_GUARD_OWNER_CHANGED' using errcode = '23514';
    end if;
  end if;
  if jsonb_typeof(new.state) is distinct from 'object'
    or jsonb_typeof(before_state) is distinct from 'object' then
    raise exception 'YEONI_CHUNK_GUARD_STATE_SHAPE' using errcode = '23514';
  end if;
  before_marker := before_state ->> 'languageRecordResetV1';
  after_marker := new.state ->> 'languageRecordResetV1';
  -- A reset tombstone must survive older clients even when the review key is absent.
  if (before_state -> 'languageRecordResetV1') is distinct from (new.state -> 'languageRecordResetV1') then
    if after_marker is null or jsonb_typeof(new.state -> 'languageRecordResetV1') is distinct from 'string' then
      raise exception 'YEONI_CHUNK_GUARD_RESET_ROLLBACK' using errcode = '23514';
    end if;
    -- Intentionally narrower than JS Date.parse: only the existing RPC's UTC/UUID
    -- marker shape (also accepts millisecond precision) is understood here.
    if after_marker !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (before_marker is not null and (jsonb_typeof(before_state -> 'languageRecordResetV1') is distinct from 'string'
        or before_marker !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end if;
    begin
      after_time := date_trunc('milliseconds', split_part(after_marker, '|', 1)::timestamptz);
      before_time := case when before_marker is null then '1970-01-01T00:00:00Z'::timestamptz
        else date_trunc('milliseconds', split_part(before_marker, '|', 1)::timestamptz) end;
    exception when others then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end;
    if to_char(after_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') <> split_part(after_marker, '.', 1)
      or (before_marker is not null and to_char(before_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') <> split_part(before_marker, '.', 1)) then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end if;
    -- Match the client's millisecond time + ASCII full marker tie breaker.
    if after_time < before_time or (after_time = before_time and after_marker collate "C" <= coalesce(before_marker, '') collate "C") then
      raise exception 'YEONI_CHUNK_GUARD_RESET_ROLLBACK' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.state ?| array_remove(reset_keys, 'japaneseChunkReviewV1') then
      raise exception 'YEONI_CHUNK_GUARD_RESET_NOT_EMPTY' using errcode = '23514';
    end if;
    is_reset := tg_op = 'UPDATE';
    -- Existing reset_my_app_records removes the key. Never reintroduce old events.
    -- A fresh INSERT has no earlier server history and may upload a complete
    -- matching-generation snapshot; ON CONFLICT still runs the UPDATE guard.
    if not (new.state ? 'japaneseChunkReviewV1') then return new; end if;
  elsif (before_state -> 'japaneseChunkReviewV1') is not distinct from (new.state -> 'japaneseChunkReviewV1') then
    -- Byte-for-byte opaque preservation is allowed, including a future version.
    -- Changed payloads are validated below. This is not validation of old data.
    return new;
  end if;
  -- Unchanged opaque bytes may be preserved above. Any changed review requires
  -- a marker understood by this prototype, even when the marker is unchanged.
  if after_marker is not null then
    if jsonb_typeof(new.state -> 'languageRecordResetV1') is distinct from 'string'
      or after_marker !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end if;
    begin after_time := split_part(after_marker, '|', 1)::timestamptz;
    exception when others then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end;
    if to_char(after_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') <> split_part(after_marker, '.', 1) then
      raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
    end if;
  elsif new.state ? 'languageRecordResetV1' then
    raise exception 'YEONI_CHUNK_GUARD_RESET_SHAPE' using errcode = '23514';
  end if;
  if before_state ? 'japaneseChunkReviewV1' and not (new.state ? 'japaneseChunkReviewV1') then
    raise exception 'YEONI_CHUNK_GUARD_KEY_REMOVED' using errcode = '23514';
  end if;
  -- Validate both snapshots before evaluating monotonicity. An explicit reset
  -- validates only the replacement, so malformed/unknown old data can be cleared.
  for pass in 1..2 loop
    if pass = 1 and (is_reset or not (before_state ? 'japaneseChunkReviewV1')) then continue; end if;
    if pass = 1 then raw := before_state ->> 'japaneseChunkReviewV1';
    else raw := new.state ->> 'japaneseChunkReviewV1'; end if;
    if jsonb_typeof(case when pass = 1 then before_state -> 'japaneseChunkReviewV1' else new.state -> 'japaneseChunkReviewV1' end) is distinct from 'string' then
      raise exception 'YEONI_CHUNK_GUARD_REVIEW_SHAPE' using errcode = '23514';
    end if;
    if octet_length(raw) > 2000000 then
      raise exception 'YEONI_CHUNK_GUARD_BYTE_CAP' using errcode = '23514';
    end if;
    begin doc := raw::jsonb;
    exception when others then
      raise exception 'YEONI_CHUNK_GUARD_REVIEW_SHAPE' using errcode = '23514';
    end;
    if jsonb_typeof(doc) is distinct from 'object' or (doc -> 'version') is distinct from '1'::jsonb
      or not (doc ?& array['version','generation','events'])
      or (doc - array['version','generation','events']) <> '{}'::jsonb
      or jsonb_typeof(doc -> 'events') is distinct from 'object' then
      raise exception 'YEONI_CHUNK_GUARD_VERSION_OR_SHAPE' using errcode = '23514';
    end if;
    if (doc -> 'generation') is distinct from coalesce(to_jsonb(after_marker), 'null'::jsonb) then
      raise exception 'YEONI_CHUNK_GUARD_GENERATION_MISMATCH' using errcode = '23514';
    end if;
    if (select count(*) from jsonb_object_keys(doc -> 'events')) > 6000 then
      raise exception 'YEONI_CHUNK_GUARD_EVENT_CAP' using errcode = '23514';
    end if;
    for event_key, event_value in select key, value from jsonb_each(doc -> 'events') loop
      if event_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
        or jsonb_typeof(event_value) is distinct from 'object'
        or not (event_value ?& event_fields) or (event_value - event_fields) <> '{}'::jsonb
        or (event_value -> 'attemptId') is distinct from to_jsonb(event_key)
        or jsonb_typeof(event_value -> 'lessonId') is distinct from 'string'
        or jsonb_typeof(event_value -> 'questionId') is distinct from 'string'
        or (event_value ->> 'lessonId') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
        or (event_value ->> 'questionId') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
        or jsonb_typeof(event_value -> 'correct') is distinct from 'boolean'
        or jsonb_typeof(event_value -> 'neededHelp') is distinct from 'boolean'
        or jsonb_typeof(event_value -> 'mode') is distinct from 'string'
        or (event_value ->> 'mode') not in ('choice','audio','reading')
        or jsonb_typeof(event_value -> 'answeredAt') is distinct from 'string'
        or (event_value ->> 'answeredAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
        raise exception 'YEONI_CHUNK_GUARD_EVENT_SHAPE' using errcode = '23514';
      end if;
      begin answered := (event_value ->> 'answeredAt')::timestamptz;
      exception when others then
        raise exception 'YEONI_CHUNK_GUARD_EVENT_TIME' using errcode = '23514';
      end;
      if to_char(answered at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from (event_value ->> 'answeredAt') then
        raise exception 'YEONI_CHUNK_GUARD_EVENT_TIME' using errcode = '23514';
      end if;
    end loop;
    if pass = 1 then old_doc := doc; else new_doc := doc; end if;
  end loop;
  if is_reset then
    if new_doc -> 'events' <> '{}'::jsonb then
      raise exception 'YEONI_CHUNK_GUARD_RESET_NOT_EMPTY' using errcode = '23514';
    end if;
  elsif old_doc is not null then
    if exists(select 1 from jsonb_each(old_doc -> 'events') prior
      where not ((new_doc -> 'events') ? prior.key)
        or ((new_doc -> 'events') -> prior.key) is distinct from prior.value) then
      raise exception 'YEONI_CHUNK_GUARD_EVENT_REMOVED_OR_CHANGED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger yeoni_japanese_chunk_guard_prototype
before insert or update on public.language_user_state
for each row execute function public.yeoni_japanese_chunk_guard_prototype();
