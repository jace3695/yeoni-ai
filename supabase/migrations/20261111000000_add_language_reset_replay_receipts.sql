-- LOCAL REVIEW CANDIDATE. Not applied to a remote database or released.
-- Append-only receipts protect recorded language reset requests from ABA replay.
-- An overwritten pre-upgrade request cannot be reconstructed. Ordinary state-only
-- writes preserve this column, but explicit metadata edits / row deletion can
-- remove its evidence under existing privileges. This is not tamper resistance.
-- No pruning, grant, policy, owner, security-mode, or non-language reset change.
alter table public.language_user_state
  add column language_reset_receipts_v1 jsonb not null default '{}'::jsonb,
  add constraint language_reset_receipts_v1_object
    check (jsonb_typeof(language_reset_receipts_v1) = 'object');

create or replace function public.reset_my_app_records(p_app text, p_request_id uuid, p_confirmation text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_state jsonb;
  next_state jsonb;
  marker_key text;
  marker text;
  record_keys text[];
  reset_receipts jsonb;
  receipt_request text;
  receipt_value jsonb;
  receipt_marker text;
  receipt_time timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_app is null or p_app not in ('fitness','diet','language','growth','assistant','budget')
    or p_request_id is null or p_confirmation is distinct from '초기화' then
    raise exception 'Invalid reset confirmation' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('app-record-reset:' || owner_id::text, 0));
  marker_key := case when p_app = 'language' then 'languageRecordResetV1' else 'ai-fitness-record-reset-' || p_app end;
  if p_app = 'language' then
    insert into public.language_user_state(user_id, state, updated_at) values(owner_id, '{}'::jsonb, clock_timestamp()) on conflict (user_id) do nothing;
    select state, language_reset_receipts_v1 into current_state, reset_receipts
      from public.language_user_state where user_id = owner_id for update;
  else
    insert into public.user_app_state(user_id, state, updated_at) values(owner_id, '{}'::jsonb, clock_timestamp()) on conflict (user_id) do nothing;
    select state into current_state from public.user_app_state where user_id = owner_id for update;
  end if;
  if current_state is null then raise exception 'State is not accessible' using errcode = '42501'; end if;
  -- A retry after a lost response must not delete records created since that reset.
  marker := current_state ->> marker_key;
  if p_app = 'language' then
    -- Validate all retained evidence under the row lock before any deletion.
    -- Keep receipts out of state: existing whole-state UPDATE / UPSERT clients
    -- omit this column and their exact state readback must remain unchanged.
    if jsonb_typeof(current_state) is distinct from 'object'
      or jsonb_typeof(reset_receipts) is distinct from 'object' then
      raise exception 'YEONI_RESET_RECEIPTS_INVALID' using errcode = '23514';
    end if;
    for receipt_request, receipt_value in
      select key, value from jsonb_each(reset_receipts)
      union all
      select split_part(marker, '|', 2), current_state -> marker_key
        where current_state ? marker_key
    loop
      receipt_marker := receipt_value #>> '{}';
      if jsonb_typeof(receipt_value) is distinct from 'string'
        or receipt_request !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or receipt_marker !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3,6}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or split_part(receipt_marker, '|', 2) is distinct from receipt_request then
        raise exception 'YEONI_RESET_RECEIPTS_INVALID' using errcode = '23514';
      end if;
      begin
        receipt_time := split_part(receipt_marker, '|', 1)::timestamptz;
      exception when others then
        raise exception 'YEONI_RESET_RECEIPTS_INVALID' using errcode = '23514';
      end;
      if to_char(receipt_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
        is distinct from split_part(receipt_marker, '.', 1) then
        raise exception 'YEONI_RESET_RECEIPTS_INVALID' using errcode = '23514';
      end if;
    end loop;
    if marker is not null and reset_receipts ? split_part(marker, '|', 2)
      and reset_receipts ->> split_part(marker, '|', 2) is distinct from marker then
      raise exception 'YEONI_RESET_RECEIPTS_INVALID' using errcode = '23514';
    end if;
    if reset_receipts ? p_request_id::text then
      if reset_receipts ->> p_request_id::text is distinct from marker then
        -- No successful old receipt and no state / timestamp / metadata mutation.
        raise exception 'YEONI_RESET_REQUEST_SUPERSEDED' using errcode = '22023';
      end if;
      return jsonb_build_object('app', p_app, 'user_id', owner_id, 'marker', marker);
    end if;
    if marker is not null then
      -- Only the current historical marker is recoverable on upgrade.
      reset_receipts := reset_receipts || jsonb_build_object(split_part(marker, '|', 2), marker);
      if split_part(marker, '|', 2) = p_request_id::text then
        -- Bookkeeping alone must not alter state or its synchronization timestamp.
        update public.language_user_state set language_reset_receipts_v1 = reset_receipts
          where user_id = owner_id;
        if not found then raise exception 'State reset failed' using errcode = '42501'; end if;
        return jsonb_build_object('app', p_app, 'user_id', owner_id, 'marker', marker);
      end if;
    end if;
  elsif split_part(coalesce(marker, ''), '|', 2) = p_request_id::text then
    return jsonb_build_object('app', p_app, 'user_id', owner_id, 'marker', marker);
  end if;

  case p_app
  when 'fitness' then
    record_keys := array['ai-fitness-workout-completed-days','ai-fitness-switchon-set-completions','ai-fitness-switchon-ab-slide-checks','ai-fitness-pullup-progress','ai-fitness-weight-records','ai-fitness-inbody-records','ai-fitness-daily-notes','ai-fitness-recovery-mode-days','ai-fitness-daily-condition','ai-fitness-sleep-status','ai-fitness-alcohol-status','ai-fitness-workout-condition','ai-fitness-workout-plan-decision-history'];
    delete from public.fitness_ai_review_history where user_id = owner_id;
    if exists(select 1 from public.fitness_ai_review_history where user_id = owner_id) then raise exception 'Reset incomplete'; end if;
  when 'diet' then
    record_keys := array['ai-fitness-diet-completed-days','ai-fitness-diet-meal-log','ai-fitness-protein-total','ai-fitness-fasting-start-time','ai-fitness-fasting-completed','ai-fitness-water-intake','ai-fitness-dinner-carb-choice','ai-fitness-lunch-carb-choice','ai-fitness-lunch-protein-choice','ai-fitness-social-meal-mode','ai-fitness-diet-symptoms','ai-fitness-diet-dinner-completed-time'];
  when 'language' then
    record_keys := array['dailyRoutineProgress','dailyLearningHistory','japaneseCurriculumProgressV1','japaneseCurriculumReviewV1','savedWords','savedSentences','wrongKana','wrongKanaChars','wrongWords','wrongSentences','grammarProgress','reviewCompletedItemsByDate','japaneseLevelJourneyV1','japaneseChunkReviewV1'];
  when 'growth' then
    record_keys := array[]::text[];
    delete from public.growth_sessions where user_id = owner_id;
    delete from public.growth_ai_reviews where user_id = owner_id;
    if exists(select 1 from public.growth_sessions where user_id = owner_id) or exists(select 1 from public.growth_ai_reviews where user_id = owner_id) then raise exception 'Reset incomplete'; end if;
  when 'assistant' then
    record_keys := array[]::text[];
    delete from public.assistant_task_command_history where user_id = owner_id;
    delete from public.assistant_chat_messages where user_id = owner_id;
    delete from public.assistant_items where user_id = owner_id;
    delete from public.assistant_projects where user_id = owner_id;
    delete from public.assistant_memories where user_id = owner_id;
    if exists(select 1 from public.assistant_task_command_history where user_id = owner_id) or exists(select 1 from public.assistant_chat_messages where user_id = owner_id) or exists(select 1 from public.assistant_items where user_id = owner_id) or exists(select 1 from public.assistant_projects where user_id = owner_id) or exists(select 1 from public.assistant_memories where user_id = owner_id) then raise exception 'Reset incomplete'; end if;
  when 'budget' then
    record_keys := array[]::text[];
    delete from public.budget_category_changes where user_id = owner_id;
    delete from public.budget_transactions where user_id = owner_id;
    delete from public.budget_income where user_id = owner_id;
    delete from public.budget_savings where user_id = owner_id;
    if exists(select 1 from public.budget_transactions where user_id = owner_id) or exists(select 1 from public.budget_income where user_id = owner_id) or exists(select 1 from public.budget_savings where user_id = owner_id) then raise exception 'Reset incomplete'; end if;
  end case;
  marker := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || p_request_id::text;
  next_state := (current_state - record_keys) || jsonb_build_object(marker_key, marker);
  if p_app = 'language' then
    update public.language_user_state set state = next_state, updated_at = clock_timestamp(),
      language_reset_receipts_v1 = reset_receipts || jsonb_build_object(p_request_id::text, marker)
      where user_id = owner_id;
  else
    update public.user_app_state set state = next_state, updated_at = clock_timestamp() where user_id = owner_id;
  end if;
  if not found then raise exception 'State reset failed' using errcode = '42501'; end if;
  return jsonb_build_object('app', p_app, 'user_id', owner_id, 'marker', marker);
end;
$$;
