-- LOCAL SYNTHETIC TEST DRAFT ONLY. Not a migration; never loaded by the app.
-- No privileges, RLS, authentication integration or production deployment here.
create schema reply_local;
create table reply_local.mutex (id int primary key check(id=1), generation bigint not null default 0);
insert into reply_local.mutex values(1,0);
create table reply_local.sessions(owner text primary key, epoch bigint not null default 0);
create table reply_local.sources(owner text, app text, revision bigint not null, version text not null, deleted boolean not null default false, primary key(owner,app));
create table reply_local.receipts(owner text, app text, version text, pool text check(pool in ('analysis','voice')), month text not null, cost bigint not null check(cost>0), actual bigint check(actual>=0), claim text, state text not null check(state in ('pending','uncertain','done','deleted')), answer jsonb, primary key(owner,app,version,pool));
create table reply_local.policies(pool text primary key check(pool in ('analysis','voice')), project_cap bigint not null check(project_cap>=0), account_cap bigint not null check(account_cap>=0));
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
  if old.state='done' and old.answer is not null then return jsonb_build_object('status','ready','answer',old.answer); end if;
  return jsonb_build_object('status',case when old.state='pending' then 'busy' else old.state end);
 end if;
 select * into pol from reply_local.policies where pool=pool_name;
 if not found or quote is null or quote<=0 then return jsonb_build_object('status','budget'); end if;
 month_key:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
 if coalesce((select sum(greatest(cost,coalesce(actual,0))) from reply_local.receipts where pool=pool_name and (month=month_key or actual is null or actual>cost or state in ('pending','uncertain','deleted'))),0)+quote>pol.project_cap
 or coalesce((select sum(greatest(cost,coalesce(actual,0))) from reply_local.receipts where owner=who and pool=pool_name and (month=month_key or actual is null or actual>cost or state in ('pending','uncertain','deleted'))),0)+quote>pol.account_cap then return jsonb_build_object('status','budget'); end if;
 insert into reply_local.receipts values(who,which,ver,pool_name,month_key,quote,null,null,'pending',null);
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
 if erase then update reply_local.receipts set state='deleted',answer=null where owner=who and app=which; end if;
 return true;
end $$;
create function reply_local.finish(who text, which text, ver text, pool_name text, result jsonb, invocation text) returns boolean language plpgsql as $$
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if not exists(select 1 from reply_local.sources where owner=who and app=which and version=ver and not deleted) then
  update reply_local.receipts set state='uncertain' where owner=who and app=which and version=ver and pool=pool_name and state='pending' and claim=invocation;
  return false;
 end if;
 -- No reservation refunds. Timeout/restart/reconciliation never buys a retry.
 update reply_local.receipts set state=case when result is null then 'uncertain' else 'done' end, answer=result
 where owner=who and app=which and version=ver and pool=pool_name and state='pending' and claim=invocation;
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
begin
 update reply_local.mutex set generation=generation+1 where id=1;
 if not found then raise exception 'Missing transaction mutex'; end if;
 if invocation is null or length(invocation)<1 then return false; end if;
 if not exists(select 1 from reply_local.sessions where owner=who and epoch=session_epoch)
 or not exists(select 1 from reply_local.sources where owner=who and app=which and revision=rev and version=ver and not deleted) then return false; end if;
 update reply_local.receipts set claim=invocation where owner=who and app=which and version=ver and pool=pool_name and state='pending' and claim is null;
 return found;
end $$;
