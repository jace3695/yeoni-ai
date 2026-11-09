-- ADDITIVE LOCAL SYNTHETIC TEST DRAFT ONLY. Load AFTER schema.local.sql.
-- No deployment/auth/privilege changes. Ordinary callers have no approval API.
-- Direct DB fixture writes are privileged test setup, NOT a security boundary.
create table reply_local.quote_fixture_clock(id int primary key check(id=1), trusted boolean not null default false);
insert into reply_local.quote_fixture_clock values(1,false);
create table reply_local.quote_fixture_approvals(binding_hash text primary key check(binding_hash ~ '^[a-f0-9]{64}$'), mode text not null check(mode='synthetic'));
alter table reply_local.receipts add column quote_id text,
 add column quote_binding_hash text, add column quote_contract text,
 add column quote_reserved_at timestamptz;
alter table reply_local.receipts add constraint quote_metadata_complete check (
 (quote_id is null and quote_binding_hash is null and quote_contract is null and quote_reserved_at is null) or
 (quote_id is not null and quote_binding_hash is not null and quote_contract is not null and quote_reserved_at is not null));

create function reply_local.quote_keys(value jsonb, keys text[]) returns boolean language sql immutable as $$
 select coalesce(jsonb_typeof(value)='object' and not exists(select 1 from jsonb_each(value) e where e.value='null'::jsonb) and (select array_agg(k order by k) from jsonb_object_keys(value) k)=(select array_agg(k order by k) from unnest(keys) k),false)
$$;
create function reply_local.quote_integer(value jsonb, minimum numeric default 0) returns boolean language sql immutable as $$
 select coalesce(jsonb_typeof(value)='number' and (value::text)::numeric between minimum and 9007199254740991 and trunc((value::text)::numeric)=(value::text)::numeric,false)
$$;
create function reply_local.quote_up(n numeric, d numeric) returns numeric language sql immutable as $$ select div(n+d-1,d) $$;
create function reply_local.quote_time(value jsonb) returns timestamptz language plpgsql immutable as $$
declare t timestamptz;
begin
 if jsonb_typeof(value) is distinct from 'string' or (value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'Invalid quote time'; end if;
 t:=(value#>>'{}')::timestamptz;
 if to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>value#>>'{}' then raise exception 'Invalid quote time'; end if;
 return t;
end $$;

-- Fail closed even for a fixture-approved hash. Recompute integer costs from
-- bounded dimensions, FX, tax and margin; never accept a numeric caller quote.
create function reply_local.validate_quote(envelope jsonb, who text, which text, rev bigint, ver text, pool_name text, db_now timestamptz) returns boolean language plpgsql as $$
declare c jsonb; p jsonb; fx jsonb; req jsonb; units jsonb; rate jsonb; dims text[]; dim text;
 issued timestamptz; expires timestamptz; p_seen timestamptz; p_end timestamptz; f_seen timestamptz; f_end timestamptz;
 subtotal numeric:=0; converted numeric; taxed numeric; total numeric; hash text; clock_ok boolean;
begin
 if who is null or which is null or rev is null or ver is null or pool_name is null or db_now is null or not isfinite(db_now) then return false; end if;
 select trusted into clock_ok from reply_local.quote_fixture_clock where id=1 for share;
 if clock_ok is not true then return false; end if;
 if not reply_local.quote_keys(envelope,array['quoteId','bindingHash','contractText']) then return false; end if;
 if jsonb_typeof(envelope->'contractText')<>'string' or length(envelope->>'contractText')>32768 then return false; end if;
 hash:=encode(sha256(convert_to(envelope->>'contractText','UTF8')),'hex');
 if envelope->>'bindingHash'<>hash or envelope->>'quoteId'<>'sq1_'||hash then return false; end if;
 perform 1 from reply_local.quote_fixture_approvals where binding_hash=hash and mode='synthetic' for share;
 if not found then return false; end if;
 c:=(envelope->>'contractText')::jsonb;
 if not reply_local.quote_keys(c,array['schema','mode','owner','app','revision','sourceVersion','pool','issuedAt','validUntil','price','fx','boundsComplete','taxBasisPoints','marginBasisPoints','perRequestCeilingMicroKrw','allInMicroKrw','requestCanonical','requestHash']) then return false; end if;
 if exists(select 1 from unnest(array['schema','mode','owner','app','sourceVersion','pool','requestHash']) k where jsonb_typeof(c->k) is distinct from 'string') then return false; end if;
 if c->>'schema'<>'synthetic-quote-binding-v1' or c->>'mode'<>'synthetic' or c->>'owner'<>who or c->>'app'<>which or c->>'sourceVersion'<>ver or c->>'pool'<>pool_name or not reply_local.quote_integer(c->'revision') or (c->>'revision')::bigint<>rev or c->'boundsComplete'<>'true'::jsonb then return false; end if;
 if ver !~ '^[a-f0-9]{64}$' or pool_name not in ('analysis','voice') or which not in ('fitness','diet','language','growth','budget','assistant') then return false; end if;
 if jsonb_typeof(c->'requestCanonical')<>'string' or c->>'requestHash'<>encode(sha256(convert_to(c->>'requestCanonical','UTF8')),'hex') then return false; end if;
 req:=(c->>'requestCanonical')::jsonb;
 if not reply_local.quote_keys(req,array['mode','provider','model','specificationVersion','sourceVersion','pool','payloadSha256','maximumUnits','maxAttempts','externalTools']) then return false; end if;
 if exists(select 1 from unnest(array['mode','provider','model','specificationVersion','sourceVersion','pool','payloadSha256']) k where jsonb_typeof(req->k) is distinct from 'string') then return false; end if;
 if req->>'mode'<>'synthetic' or req->>'provider'<>'synthetic-only' or req->>'pool'<>pool_name or req->>'sourceVersion'<>ver or req->'maxAttempts'<>'1'::jsonb or req->'externalTools'<>'false'::jsonb or req->>'payloadSha256' !~ '^[a-f0-9]{64}$' then return false; end if;
 if jsonb_typeof(req->'model')<>'string' or req->>'model' !~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$' or jsonb_typeof(req->'specificationVersion')<>'string' or req->>'specificationVersion' !~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$' then return false; end if;
 p:=c->'price'; fx:=c->'fx'; units:=req->'maximumUnits';
 if not reply_local.quote_keys(p,array['mode','pool','currency','reference','observedAt','validUntil','dimensionsComplete','requiredDimensions','rates']) or not reply_local.quote_keys(fx,array['mode','currency','reference','observedAt','validUntil','krwNumerator','krwDenominator']) then return false; end if;
 if p->>'mode'<>'synthetic' or fx->>'mode'<>'synthetic' or p->>'pool'<>pool_name or p->'dimensionsComplete'<>'true'::jsonb or p->>'currency' !~ '^[A-Z]{3}$' or fx->>'currency'<>p->>'currency' then return false; end if;
 if jsonb_typeof(p->'reference')<>'string' or p->>'reference' !~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$' or jsonb_typeof(fx->'reference')<>'string' or fx->>'reference' !~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$' then return false; end if;
 issued:=reply_local.quote_time(c->'issuedAt'); expires:=reply_local.quote_time(c->'validUntil');
 p_seen:=reply_local.quote_time(p->'observedAt'); p_end:=reply_local.quote_time(p->'validUntil');
 f_seen:=reply_local.quote_time(fx->'observedAt'); f_end:=reply_local.quote_time(fx->'validUntil');
 if issued>db_now or expires<=db_now or p_seen>issued or f_seen>issued or p_end<=issued or f_end<=issued or expires<>least(p_end,f_end) then return false; end if;
 if jsonb_typeof(p->'requiredDimensions')<>'array' or jsonb_array_length(p->'requiredDimensions') not between 1 and 32 then return false; end if;
 if exists(select 1 from jsonb_array_elements(p->'requiredDimensions') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[a-z][a-z0-9_]{0,63}$') then return false; end if;
 select array_agg(v order by v) into dims from jsonb_array_elements_text(p->'requiredDimensions') v;
 if (select count(distinct v) from unnest(dims) v)<>array_length(dims,1) or not reply_local.quote_keys(units,dims) or not reply_local.quote_keys(p->'rates',dims) then return false; end if;
 if not reply_local.quote_integer(fx->'krwNumerator',1) or not reply_local.quote_integer(fx->'krwDenominator',1) or not reply_local.quote_integer(c->'taxBasisPoints') or not reply_local.quote_integer(c->'marginBasisPoints') or not reply_local.quote_integer(c->'perRequestCeilingMicroKrw',1) or not reply_local.quote_integer(c->'allInMicroKrw',1) then return false; end if;
 if p->>'currency'='KRW' and fx->'krwNumerator'<>fx->'krwDenominator' then return false; end if;
 foreach dim in array dims loop
  rate:=p->'rates'->dim;
  if not reply_local.quote_integer(units->dim) or not reply_local.quote_keys(rate,array['currencyMicros','perUnits']) or not reply_local.quote_integer(rate->'currencyMicros') or not reply_local.quote_integer(rate->'perUnits',1) then return false; end if;
  subtotal:=subtotal+reply_local.quote_up((rate->>'currencyMicros')::numeric*(units->>dim)::numeric,(rate->>'perUnits')::numeric);
 end loop;
 converted:=reply_local.quote_up(subtotal*(fx->>'krwNumerator')::numeric,(fx->>'krwDenominator')::numeric);
 taxed:=reply_local.quote_up(converted*(10000+(c->>'taxBasisPoints')::numeric),10000);
 total:=reply_local.quote_up(taxed*(10000+(c->>'marginBasisPoints')::numeric),10000);
 return subtotal<=9007199254740991 and converted<=9007199254740991 and taxed<=9007199254740991 and total=(c->>'allInMicroKrw')::numeric and total<=(c->>'perRequestCeilingMicroKrw')::numeric;
exception when others then return false;
end $$;

-- No re-binding, lifetime extension, repricing, or accounting refund on retries.
create function reply_local.keep_quote_binding() returns trigger language plpgsql as $$
begin
 if row(new.quote_id,new.quote_binding_hash,new.quote_contract,new.quote_reserved_at) is distinct from row(old.quote_id,old.quote_binding_hash,old.quote_contract,old.quote_reserved_at) then raise exception 'Immutable quote binding'; end if;
 if old.quote_id is not null and row(new.owner,new.app,new.version,new.pool,new.cost,new.month) is distinct from row(old.owner,old.app,old.version,old.pool,old.cost,old.month) then raise exception 'Immutable quoted receipt'; end if;
 return new;
end $$;
create trigger keep_quote_binding before update on reply_local.receipts for each row execute function reply_local.keep_quote_binding();

create function reply_local.reserve_quoted(who text, which text, rev bigint, ver text, pool_name text, envelope jsonb, session_epoch bigint) returns jsonb language plpgsql as $$
declare old reply_local.receipts; c jsonb; pol reply_local.policies; db_now timestamptz; month_key text; cost_bound bigint;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if not exists(select 1 from reply_local.sessions where owner=who and epoch=session_epoch) or not exists(select 1 from reply_local.sources where owner=who and app=which and revision=rev and version=ver and not deleted) then return jsonb_build_object('status','stale'); end if;
 select * into old from reply_local.receipts where owner=who and app=which and version=ver and pool=pool_name for update;
 if found then
  if old.erased then return jsonb_build_object('status','deleted'); end if;
  if old.state='done' and old.answer is not null then return jsonb_build_object('status','ready','answer',old.answer); end if;
  return jsonb_build_object('status',case when old.state='pending' then 'busy' else old.state end,'quoteId',old.quote_id);
 end if;
 select * into pol from reply_local.policies where pool=pool_name for update;
 if not found then return jsonb_build_object('status','budget'); end if;
 db_now:=clock_timestamp();
 if reply_local.validate_quote(envelope,who,which,rev,ver,pool_name,db_now) is not true then return jsonb_build_object('status','budget','reason','untrusted_or_invalid_quote'); end if;
 c:=(envelope->>'contractText')::jsonb; cost_bound:=(c->>'allInMicroKrw')::bigint;
 month_key:=to_char(db_now at time zone 'UTC','YYYY-MM');
 if not reply_local.billing_clear(pool_name) or reply_local.billing_liability(null,pool_name,month_key)+cost_bound>pol.project_cap
 or reply_local.billing_liability(who,pool_name,month_key)+cost_bound>pol.account_cap then return jsonb_build_object('status','budget'); end if;
 insert into reply_local.receipts(owner,app,version,pool,month,cost,state,quote_id,quote_binding_hash,quote_contract,quote_reserved_at) select who,which,ver,pool_name,month_key,cost_bound,'pending',envelope->>'quoteId',envelope->>'bindingHash',envelope->>'contractText',db_now where reply_local.quote_time(c->'validUntil')>clock_timestamp();
 if not found then return jsonb_build_object('status','budget','reason','expired_before_reservation'); end if;
 return jsonb_build_object('status','reserved','quoteId',envelope->>'quoteId');
end $$;

create function reply_local.claim_quoted(who text, which text, rev bigint, ver text, pool_name text, session_epoch bigint, expected_quote_id text, expected_request text, invocation text) returns boolean language plpgsql as $$
declare old reply_local.receipts; c jsonb; envelope jsonb; pol reply_local.policies; db_now timestamptz; month_key text;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if invocation is null or length(invocation) not between 1 and 128 then return false; end if;
 if not exists(select 1 from reply_local.sessions where owner=who and epoch=session_epoch) or not exists(select 1 from reply_local.sources where owner=who and app=which and revision=rev and version=ver and not deleted) then return false; end if;
 select * into old from reply_local.receipts where owner=who and app=which and version=ver and pool=pool_name for update;
 if not found or old.quote_id is null or expected_quote_id is null or old.quote_id<>expected_quote_id or old.state<>'pending' or old.erased or old.claim is not null then return false; end if;
 c:=old.quote_contract::jsonb;
 if expected_request is null or c->>'requestCanonical'<>expected_request or c->>'requestHash'<>encode(sha256(convert_to(expected_request,'UTF8')),'hex') then return false; end if;
 select * into pol from reply_local.policies where pool=pool_name for update;
 if not found or pol.project_cap<=0 or pol.account_cap<=0 then return false; end if;
 -- Read the DB clock AFTER acquiring locks. No caller clock/lease renewal.
 db_now:=clock_timestamp();
 envelope:=jsonb_build_object('quoteId',old.quote_id,'bindingHash',old.quote_binding_hash,'contractText',old.quote_contract);
 if db_now<old.quote_reserved_at or reply_local.validate_quote(envelope,who,which,rev,ver,pool_name,db_now) is not true or old.cost<>(c->>'allInMicroKrw')::bigint then return false; end if;
 month_key:=to_char(db_now at time zone 'UTC','YYYY-MM');
 if not reply_local.billing_clear(pool_name) or reply_local.billing_liability(null,pool_name,month_key)>pol.project_cap
 or reply_local.billing_liability(who,pool_name,month_key)>pol.account_cap then return false; end if;
 update reply_local.receipts set claim=invocation where owner=who and app=which and version=ver and pool=pool_name and claim is null and reply_local.quote_time(c->'validUntil')>clock_timestamp();
 return found;
end $$;

-- Legacy numeric preparation remains callable ONLY for unbound receipts.
-- It cannot consume any quote-bound reservation. Not a global live guarantee.
create or replace function reply_local.claim(who text, which text, rev bigint, ver text, pool_name text, session_epoch bigint, invocation text) returns boolean language plpgsql as $$
declare pol reply_local.policies; month_key text;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if invocation is null or length(invocation)<1 then return false; end if;
 -- An old reservation is not an irrevocable dispatch grant. Recheck current
 -- policy and known liabilities after edits or delayed above-quote settlement.
 -- Rejection retains the original receipt; it is never a refund or retry grant.
 select * into pol from reply_local.policies where pool=pool_name for update;
 if not found or pol.project_cap<=0 or pol.account_cap<=0 then return false; end if;
 month_key:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
 if not reply_local.billing_clear(pool_name) or reply_local.billing_liability(null,pool_name,month_key)>pol.project_cap
 or reply_local.billing_liability(who,pool_name,month_key)>pol.account_cap then return false; end if;
 if not exists(select 1 from reply_local.sessions where owner=who and epoch=session_epoch)
 or not exists(select 1 from reply_local.sources where owner=who and app=which and revision=rev and version=ver and not deleted) then return false; end if;
 update reply_local.receipts set claim=invocation where owner=who and app=which and version=ver and pool=pool_name and state='pending' and not erased and claim is null and quote_id is null;
 return found;
end $$;
