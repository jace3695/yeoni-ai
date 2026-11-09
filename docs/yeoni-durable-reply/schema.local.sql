-- LOCAL SYNTHETIC TEST DRAFT ONLY. Not a migration; never loaded by the app.
-- No privileges, RLS, authentication integration or production deployment here.
create schema reply_local;
create table reply_local.mutex (id int primary key check(id=1), generation bigint not null default 0);
insert into reply_local.mutex values(1,0);
create table reply_local.sessions(owner text primary key, epoch bigint not null default 0);
create table reply_local.sources(owner text, app text, revision bigint not null, version text not null, deleted boolean not null default false, primary key(owner,app));
create table reply_local.receipts(owner text, app text, version text, pool text check(pool in ('analysis','voice')), month text not null, cost bigint not null check(cost>0), actual bigint check(actual>=0), claim text, state text not null check(state in ('pending','uncertain','done')), answer jsonb, erased boolean not null default false, primary key(owner,app,version,pool));
create table reply_local.policies(pool text primary key check(pool in ('analysis','voice')), project_cap bigint not null check(project_cap>=0), account_cap bigint not null check(account_cap>=0));

-- Append-only SYNTHETIC billing correction ledger. No external invoice ingestion.
-- Approval is exact fixture setup, NOT server authentication or live authority.
create table reply_local.billing_ledger_format(id int primary key check(id=1), format text not null check(format='synthetic-cumulative-v1'));
insert into reply_local.billing_ledger_format values(1,'synthetic-cumulative-v1');
create table reply_local.billing_fixture_approvals(contract_hash text primary key check(contract_hash ~ '^[a-f0-9]{64}$'), mode text not null check(mode='synthetic'));
create table reply_local.billing_events(
 event_id text primary key, snapshot_id text not null, contract_hash text not null,
 owner text not null, app text not null, version text not null, pool text not null,
 sequence bigint not null check(sequence>0), original_actual bigint not null check(original_actual>=0),
 previous_total bigint not null check(previous_total>=original_actual), total_actual bigint not null check(total_actual>=previous_total and total_actual>=original_actual and total_actual<=9007199254740991),
 added bigint not null check(added>=0), disposition text not null check(disposition in ('recorded','duplicate_snapshot')),
 receipt_month text not null, recorded_at timestamptz not null default clock_timestamp(),
 foreign key(owner,app,version,pool) references reply_local.receipts(owner,app,version,pool)
);
create table reply_local.billing_holds(
 hold_key text primary key, pool text check(pool in ('analysis','voice')), event_id text, snapshot_id text,
 reason text not null, recorded_at timestamptz not null default clock_timestamp()
);
-- No release, correction deletion, overwrite, or refund API. SQL fixture setup
-- remains privileged; triggers are integrity assertions, not access control.
create function reply_local.billing_append_only() returns trigger language plpgsql as $$
begin raise exception 'Append-only billing audit'; end $$;
create trigger billing_events_immutable before update or delete on reply_local.billing_events for each row execute function reply_local.billing_append_only();
create trigger billing_events_no_truncate before truncate on reply_local.billing_events for each statement execute function reply_local.billing_append_only();
create trigger billing_holds_immutable before update or delete on reply_local.billing_holds for each row execute function reply_local.billing_append_only();
create trigger billing_holds_no_truncate before truncate on reply_local.billing_holds for each statement execute function reply_local.billing_append_only();
create function reply_local.billing_keep_receipt() returns trigger language plpgsql as $$
begin
 if exists(select 1 from reply_local.billing_events where owner=old.owner and app=old.app and version=old.version and pool=old.pool) then
  if tg_op='DELETE' then raise exception 'Billing receipt retained'; end if;
  if row(new.owner,new.app,new.version,new.pool,new.month,new.cost,new.actual) is distinct from row(old.owner,old.app,old.version,old.pool,old.month,old.cost,old.actual)
   or (old.erased and (not new.erased or new.answer is not null)) then raise exception 'Immutable billing receipt'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger billing_keep_receipt before update or delete on reply_local.receipts for each row execute function reply_local.billing_keep_receipt();
create function reply_local.billing_clear(pool_name text) returns boolean language sql stable as $$
 select coalesce(pool_name in ('analysis','voice') and exists(select 1 from reply_local.billing_ledger_format where id=1 and format='synthetic-cumulative-v1')
 and not exists(select 1 from reply_local.billing_holds where pool is null or pool=pool_name),false)
$$;
-- A corrected old receipt remains conservatively reserved in full, even when
-- its increase is below the original quote. This is NOT a real monthly policy.
-- SUM(numeric) cannot wrap at bigint/JS safe-integer aggregate limits.
create function reply_local.billing_liability(who text, pool_name text, month_key text) returns numeric language sql stable as $$
 select coalesce(sum(greatest(r.cost::numeric,coalesce(r.actual,0)::numeric,coalesce(e.total,0)::numeric)),0)
 from reply_local.receipts r left join (
  select owner,app,version,pool,max(total_actual) total from reply_local.billing_events group by owner,app,version,pool
 ) e using(owner,app,version,pool)
 where r.pool=pool_name and (who is null or r.owner=who)
 and (r.month=month_key or r.actual is null or r.actual>r.cost or e.total>r.actual or r.state in ('pending','uncertain'))
$$;
create function reply_local.billing_hold(hash text, event text, pool_name text, why text, snapshot text default null) returns jsonb language plpgsql as $$
begin
 insert into reply_local.billing_holds(hold_key,pool,event_id,reason,snapshot_id)
 values(hash||':'||coalesce(pool_name,'all')||':'||why,pool_name,event,why,snapshot) on conflict do nothing;
 return jsonb_build_object('status','held','reason',why);
end $$;
create function reply_local.billing_keys(value jsonb, keys text[]) returns boolean language plpgsql immutable as $$
begin
 if jsonb_typeof(value) is distinct from 'object' then return false; end if;
 return coalesce(not exists(select 1 from jsonb_each(value) e where e.value='null'::jsonb)
 and (select array_agg(k order by k) from jsonb_object_keys(value) k)=(select array_agg(k order by k) from unnest(keys) k),false);
end $$;
create function reply_local.billing_integer(value jsonb, minimum numeric default 0) returns boolean language plpgsql immutable as $$
begin
 if jsonb_typeof(value) is distinct from 'number' then return false; end if;
 return coalesce((value::text)::numeric between minimum and 9007199254740991 and trunc((value::text)::numeric)=(value::text)::numeric,false);
end $$;
-- Contract is a COMPLETE cumulative receipt-total snapshot, never a delta.
-- Additional invoices must be incorporated in a newly fixture-approved total.
-- No prompt, answer, original personal record, invoice text or raw payload is stored.
create function reply_local.adjust_billing(envelope jsonb) returns jsonb language plpgsql as $$
declare c jsonb; hash text; event text; snapshot text; pool_name text; r reply_local.receipts;
 old_event reply_local.billing_events; snap reply_local.billing_events;
 seq bigint; original bigint; previous bigint; total bigint; current_total bigint; current_sequence bigint; added bigint;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if not exists(select 1 from reply_local.billing_ledger_format where id=1 and format='synthetic-cumulative-v1') then return jsonb_build_object('status','unavailable','reason','unknown_ledger'); end if;
 if not reply_local.billing_keys(envelope,array['contractText','contractHash']) or jsonb_typeof(envelope->'contractText')<>'string' then return jsonb_build_object('status','rejected','reason','invalid_envelope'); end if;
 hash:=encode(sha256(convert_to(envelope->>'contractText','UTF8')),'hex');
 if envelope->>'contractHash'<>hash then return jsonb_build_object('status','rejected','reason','hash_mismatch'); end if;
 perform 1 from reply_local.billing_fixture_approvals where contract_hash=hash and mode='synthetic' for share;
 if not found then return jsonb_build_object('status','rejected','reason','fixture_approval_required'); end if;
 if length(envelope->>'contractText')>4096 then return reply_local.billing_hold(hash,null,null,'invalid_contract'); end if;
 -- Approved malformed input is an unresolved authoritative signal. Hold rather
 -- than silently rejecting it and admitting another paid operation.
 begin c:=(envelope->>'contractText')::jsonb;
 exception when others then return reply_local.billing_hold(hash,null,null,'invalid_contract'); end;
 if jsonb_typeof(c->'pool')='string' and c->>'pool' in ('analysis','voice') then pool_name:=c->>'pool'; end if;
 if jsonb_typeof(c->'eventId')='string' and c->>'eventId' ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then event:=c->>'eventId'; end if;
 if jsonb_typeof(c->'snapshotId')='string' and c->>'snapshotId' ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then snapshot:=c->>'snapshotId'; end if;
 -- Even an independently approved malformed replay must protect original scope.
 select * into old_event from reply_local.billing_events where event_id=event;
 if found and old_event.contract_hash<>hash then
  perform reply_local.billing_hold(hash,event,old_event.pool,'event_conflict',snapshot);
  return reply_local.billing_hold(hash,event,pool_name,'event_conflict',snapshot);
 end if;
 -- Snapshot conflicts protect their original pool even if the new target is
 -- missing or the submitted baseline is invalid. Never hide a known collision.
 select * into snap from reply_local.billing_events where snapshot_id=c->>'snapshotId' order by recorded_at,event_id limit 1;
 if found and (c->>'owner' is distinct from snap.owner or c->>'app' is distinct from snap.app
  or c->>'version' is distinct from snap.version or c->>'pool' is distinct from snap.pool
  or c->'sequence' is distinct from to_jsonb(snap.sequence) or c->'originalActualMicroKrw' is distinct from to_jsonb(snap.original_actual)
  or c->'previousTotalMicroKrw' is distinct from to_jsonb(snap.previous_total) or c->'totalActualMicroKrw' is distinct from to_jsonb(snap.total_actual)) then
  perform reply_local.billing_hold(hash,event,snap.pool,'snapshot_conflict',snapshot);
  return reply_local.billing_hold(hash,event,pool_name,'snapshot_conflict',snapshot);
 end if;
 if not reply_local.billing_keys(c,array['schema','mode','kind','eventId','snapshotId','owner','app','version','pool','sequence','originalActualMicroKrw','previousTotalMicroKrw','totalActualMicroKrw'])
 or exists(select 1 from unnest(array['schema','mode','kind','eventId','snapshotId','owner','app','version','pool']) k where jsonb_typeof(c->k) is distinct from 'string')
 or c->>'schema'<>'synthetic-billing-adjustment-v1' or c->>'mode'<>'synthetic' or c->>'kind'<>'cumulative_receipt_total'
 or event is null or pool_name is null or c->>'snapshotId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
 or c->>'owner' !~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$' or c->>'app' not in ('fitness','diet','language','growth','budget','assistant') or c->>'version' !~ '^[a-f0-9]{64}$'
 or not reply_local.billing_integer(c->'sequence',1) or not reply_local.billing_integer(c->'originalActualMicroKrw')
 or not reply_local.billing_integer(c->'previousTotalMicroKrw') or not reply_local.billing_integer(c->'totalActualMicroKrw')
 then return reply_local.billing_hold(hash,event,pool_name,'invalid_contract',snapshot); end if;
 -- Exact committed retry is safe even under a later hold. It is no dispatch grant.
 if old_event.event_id is not null then return jsonb_build_object('status','duplicate','addedMicroKrw',0); end if;
 if exists(select 1 from reply_local.billing_holds where event_id=event or snapshot_id=snapshot) then
  -- An unresolved observation also binds its identifiers. A new approved target
  -- cannot escape its existing hold simply by changing receipt/account/pool.
  return reply_local.billing_hold(hash,event,pool_name,'unresolved_identity',snapshot);
 end if;
 select * into r from reply_local.receipts where owner=c->>'owner' and app=c->>'app' and version=c->>'version' and pool=pool_name;
 if not found then return reply_local.billing_hold(hash,event,pool_name,'missing_receipt',snapshot); end if;
 seq:=(c->>'sequence')::bigint; original:=(c->>'originalActualMicroKrw')::bigint; previous:=(c->>'previousTotalMicroKrw')::bigint; total:=(c->>'totalActualMicroKrw')::bigint;
 if r.actual is null or r.actual<>original or r.actual>9007199254740991 or previous<original or total<original or total<previous then return reply_local.billing_hold(hash,event,pool_name,'invalid_total_or_baseline',snapshot); end if;
 if snap.event_id is not null then
  added:=0;
 else
  select greatest(r.actual,coalesce(max(total_actual),r.actual)),coalesce(max(sequence),0) into current_total,current_sequence from reply_local.billing_events where owner=r.owner and app=r.app and version=r.version and pool=r.pool;
  if seq::numeric<>current_sequence::numeric+1 or previous<>current_total or total<current_total then return reply_local.billing_hold(hash,event,pool_name,'sequence_or_total_conflict',snapshot); end if;
  added:=total-current_total;
 end if;
 insert into reply_local.billing_events(event_id,snapshot_id,contract_hash,owner,app,version,pool,sequence,original_actual,previous_total,total_actual,added,disposition,receipt_month)
 values(event,c->>'snapshotId',hash,r.owner,r.app,r.version,r.pool,seq,original,previous,total,added,case when snap.event_id is null then 'recorded' else 'duplicate_snapshot' end,r.month);
 return jsonb_build_object('status',case when snap.event_id is null then 'recorded' else 'duplicate' end,'addedMicroKrw',added);
end $$;

-- Synthetic policy must be explicitly seeded by test. No live/default activation.
create function reply_local.reserve(who text, which text, rev bigint, ver text, pool_name text, quote bigint, session_epoch bigint) returns jsonb language plpgsql as $$
declare src reply_local.sources; old reply_local.receipts; pol reply_local.policies; current_epoch bigint; month_key text;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 select epoch into current_epoch from reply_local.sessions where owner=who;
 if current_epoch is null or current_epoch<>session_epoch then return jsonb_build_object('status','stale'); end if;
 select * into src from reply_local.sources where owner=who and app=which;
 if not found or src.deleted or src.revision<>rev or src.version<>ver then return jsonb_build_object('status','stale'); end if;
 select * into old from reply_local.receipts where owner=who and app=which and version=ver and pool=pool_name;
 if found then
  if old.erased then return jsonb_build_object('status','deleted'); end if;
  if old.state='done' and old.answer is not null then return jsonb_build_object('status','ready','answer',old.answer); end if;
  return jsonb_build_object('status',case when old.state='pending' then 'busy' else old.state end);
 end if;
 select * into pol from reply_local.policies where pool=pool_name for update;
 if not found or quote is null or quote<=0 then return jsonb_build_object('status','budget'); end if;
 month_key:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
 if not reply_local.billing_clear(pool_name) or reply_local.billing_liability(null,pool_name,month_key)+quote>pol.project_cap
 or reply_local.billing_liability(who,pool_name,month_key)+quote>pol.account_cap then return jsonb_build_object('status','budget'); end if;
 insert into reply_local.receipts(owner,app,version,pool,month,cost,actual,claim,state,answer) values(who,which,ver,pool_name,month_key,quote,null,null,'pending',null);
 return jsonb_build_object('status','reserved');
end $$;
create function reply_local.publish_source(who text, which text, rev bigint, ver text, erase boolean) returns boolean language plpgsql as $$
declare src reply_local.sources;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 select * into src from reply_local.sources where owner=who and app=which;
 if found and (rev<src.revision or (rev=src.revision and (ver<>src.version or erase<>src.deleted))) then return false; end if;
 insert into reply_local.sources values(who,which,rev,ver,erase) on conflict(owner,app) do update set revision=excluded.revision,version=excluded.version,deleted=excluded.deleted;
 if erase then update reply_local.receipts set erased=true,answer=null where owner=who and app=which; end if;
 return true;
end $$;
create function reply_local.finish(who text, which text, ver text, pool_name text, result jsonb, invocation text) returns boolean language plpgsql as $$
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if not exists(select 1 from reply_local.sources where owner=who and app=which and version=ver and not deleted) then
  update reply_local.receipts set state='uncertain' where owner=who and app=which and version=ver and pool=pool_name and state='pending' and not erased and claim=invocation;
  return false;
 end if;
 -- No reservation refunds. Timeout/restart/reconciliation never buys a retry.
 update reply_local.receipts set state=case when result is null then 'uncertain' else 'done' end, answer=result
 where owner=who and app=which and version=ver and pool=pool_name and state='pending' and not erased and claim=invocation;
 return found;
end $$;

-- Reconciliation records actual charges without clipping to quote/cap or refunds.
create function reply_local.settle(who text, which text, ver text, pool_name text, actual_cost bigint) returns boolean language plpgsql as $$
declare old reply_local.receipts;
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if actual_cost is null or actual_cost<0 then raise exception 'Invalid actual cost'; end if;
 select * into old from reply_local.receipts where owner=who and app=which and version=ver and pool=pool_name;
 if not found then return false; end if;
 if old.actual is not null and old.actual<>actual_cost then raise exception 'Settlement conflict'; end if;
 update reply_local.receipts set actual=actual_cost where owner=who and app=which and version=ver and pool=pool_name;
 return true;
end $$;

-- Reservation is NOT permission to send. One invocation may claim once; no lease.
create function reply_local.claim(who text, which text, rev bigint, ver text, pool_name text, session_epoch bigint, invocation text) returns boolean language plpgsql as $$
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
 update reply_local.receipts set claim=invocation where owner=who and app=which and version=ver and pool=pool_name and state='pending' and not erased and claim is null;
 return found;
end $$;
