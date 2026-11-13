-- Preserve all function security and behavior; mark explicit protein responses, including zero.
create or replace function public.assistant_diet_meal_next(p_before jsonb,p_change jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  slot text := p_change->>'slot'; field text := p_change->>'field'; grams numeric;
  meal jsonb := coalesce(p_before->'meal','{}'); entry jsonb := coalesce(p_before->'record','{}');
  old_total numeric; total numeric; stored_total jsonb; carb_key text; carb jsonb; next_values jsonb;
begin
  if p_change is null or jsonb_typeof(p_change)<>'object' or p_change->>'kind' is distinct from 'meal'
    or (p_change-'kind'-'slot'-'field'-'grams')<>'{}'
    or slot is null or slot not in ('lunch','dinner') or field is null or field not in ('protein','rice')
    or jsonb_typeof(p_change->'grams') is distinct from 'number' then raise exception '끼니별 단백질 또는 조리된 밥량을 다시 확인해 주세요.'; end if;
  grams := (p_change->>'grams')::numeric;
  if grams<0 or grams>(case when field='protein' then 100 else 1000 end) or trunc(grams)<>grams then
    raise exception '식품 단백질은 0~100g, 조리된 밥량은 0~1,000g 사이의 정수로 입력해 주세요.';
  end if;
  if field='protein' then
    old_total := public.assistant_diet_recorded_protein(p_before);
    foreach stored_total in array array[p_before->'proteinTotal',entry->'proteinTotal'] loop
      if stored_total is not null then
        if jsonb_typeof(stored_total)<>'number' then raise exception '기존 끼니별 식단 수치나 합계를 확인하지 못했습니다. 식단 화면에서 확인한 뒤 다시 말씀해 주세요.'; end if;
        if abs((stored_total::text)::numeric-old_total)>0.000001 then raise exception '기존 끼니별 식단 수치나 합계를 확인하지 못했습니다. 식단 화면에서 확인한 뒤 다시 말씀해 주세요.'; end if;
      end if;
    end loop;
    meal := meal||jsonb_build_object(slot||'ProteinChoice',case when grams=0 then 'none' else 'custom' end,slot||'ProteinCustom',grams);
    total := public.assistant_diet_recorded_protein(p_before||jsonb_build_object('meal',meal));
    entry := entry||jsonb_build_object('proteinTotal',total,'proteinDone',total>=100,'proteinRecorded',true);
    if slot='lunch' then entry := entry||jsonb_build_object('lunchProtein',grams>0 or public.assistant_diet_supplement_grams(p_before->'supplement')>0); end if;
    return p_before||jsonb_build_object('meal',meal,'record',entry,'proteinTotal',total);
  end if;
  carb_key := case when slot='lunch' then 'lunchCarb' else 'dinnerCarb' end;
  carb := case when jsonb_typeof(p_before->carb_key)='object' then p_before->carb_key else '{}'::jsonb end;
  if carb ? 'riceType' and (jsonb_typeof(carb->'riceType')<>'string' or carb->>'riceType' not in ('흰쌀밥','잡곡밥','현미밥','통곡물밥','곤약밥','기타')) then
    raise exception '기존 끼니별 식단 수치나 합계를 확인하지 못했습니다. 식단 화면에서 확인한 뒤 다시 말씀해 주세요.';
  end if;
  if not(carb ? 'riceType') then carb := carb||jsonb_build_object('riceType','기타','customRiceType','종류 미기록'); end if;
  carb := carb||jsonb_build_object('amountType',case when grams=0 then 'none' else 'custom' end,'grams',grams,'estimatedCarbs',round(grams*0.3));
  meal := meal||case when slot='lunch' then jsonb_build_object('lunchRice',grams>0) else jsonb_build_object('dinnerCarb',carb->'amountType') end;
  next_values := p_before||jsonb_build_object('meal',meal,carb_key,carb);
  if slot='dinner' then next_values := next_values||jsonb_build_object('record',entry||jsonb_build_object('noDinnerCarbs',grams=0 or grams between 50 and 80)); end if;
  return next_values;
end;
$$;

