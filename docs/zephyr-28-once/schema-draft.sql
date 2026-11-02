-- REVIEW ONLY. Not a migration. No approval seed, live account, key or install command.
create table public.zephyr_28_once (
 singleton boolean primary key default true check(singleton),
 approval_id text not null check(approval_id='yeoni-zephyr-28-20261102'),
 request_id uuid not null unique check(request_id='bba03bc1-0ca2-46a5-8635-55ed913bd424'),
 owner_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 execution_approved boolean not null default false,
 all_in_cap_verified boolean not null default false,
 cost_evidence_id text not null check(length(trim(cost_evidence_id))>0),
 maximum_usd numeric not null check(maximum_usd=0.01),
 reserved_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes')
);
alter table public.zephyr_28_once enable row level security;
revoke all on public.zephyr_28_once from public,anon,authenticated,service_role;
grant select on public.zephyr_28_once to service_role;
grant update(reserved_at) on public.zephyr_28_once to service_role;
create function public.guard_zephyr_28_once() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.reserved_at is not null or new.reserved_at is null
   or (to_jsonb(new)-'reserved_at') is distinct from (to_jsonb(old)-'reserved_at') then
   raise exception 'IMMUTABLE_OR_CONSUMED';
 end if;
 return new;
end; $$;
create trigger zephyr_28_immutable before update on public.zephyr_28_once
 for each row execute function public.guard_zephyr_28_once();
create function public.reserve_zephyr_28_once(p_owner uuid,p_approval text,p_request uuid)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.zephyr_28_once%rowtype; stamp timestamptz;
begin
 select * into item from public.zephyr_28_once where singleton and owner_id=p_owner
   and approval_id=p_approval and request_id=p_request for update;
 if not found then return jsonb_build_object('allowed',false); end if;
 stamp:=clock_timestamp();
 if item.reserved_at is not null or not item.execution_approved or not item.all_in_cap_verified
   or item.created_at>stamp or item.expires_at<=stamp+interval '10 seconds' then
   return jsonb_build_object('allowed',false);
 end if;
 update public.zephyr_28_once set reserved_at=stamp where singleton;
 return jsonb_build_object('allowed',true,'ownerId',item.owner_id,'approvalId',item.approval_id,
   'requestId',item.request_id,'characters',28,'reservedAt',extract(epoch from stamp)*1000,
   'sendBefore',extract(epoch from stamp+interval '10 seconds')*1000);
end; $$;
revoke all on function public.guard_zephyr_28_once() from public,anon,authenticated,service_role;
revoke all on function public.reserve_zephyr_28_once(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_zephyr_28_once(uuid,text,uuid) to service_role;
