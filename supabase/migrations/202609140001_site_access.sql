-- LandDraft product access. Installation preserves access; activation is a separate release gate.
-- This schema must be included in encrypted backups before activation.
begin;
create schema landdraft_control;
revoke all on schema landdraft_control from public, anon, authenticated;
create table landdraft_control.settings (
 id integer primary key check(id=1), active boolean not null default false,
 fully_locked_down boolean not null default false, allow_new_accounts boolean not null default true,
 allow_invitations boolean not null default true, activated_at timestamptz
);
insert into landdraft_control.settings(id) values(1);
create table landdraft_control.owners(user_id uuid primary key references auth.users(id));
insert into landdraft_control.owners select id from auth.users where lower(trim(email))='dev@glab.co' and email_confirmed_at is not null;
create table landdraft_control.accounts(user_id uuid primary key references auth.users(id), locked_out boolean not null default false);
create table landdraft_control.modules(id text primary key);
insert into landdraft_control.modules values('weather.core'),('pipeline.core'),('water.hydrogeology');
create table landdraft_control.entitlements (
 user_id uuid references auth.users(id), module_id text references landdraft_control.modules(id),
 complimentary boolean not null, source text not null, updated_at timestamptz not null default now(),
 primary key(user_id,module_id)
);
create table landdraft_control.invitations (
 id uuid primary key, email text not null, modules text[] not null default '{}',
 expires_at timestamptz not null, canceled_at timestamptz, accepted_user_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index pending_invite_email on landdraft_control.invitations(email) where canceled_at is null and accepted_user_id is null;
create table landdraft_control.audit (
 operation_id uuid primary key, action text not null, actor text not null, reason text not null,
 payload jsonb not null, at timestamptz not null default now()
);
revoke all on all tables in schema landdraft_control from public,anon,authenticated;
alter table landdraft_control.settings enable row level security;
alter table landdraft_control.owners enable row level security;
alter table landdraft_control.accounts enable row level security;
alter table landdraft_control.modules enable row level security;
alter table landdraft_control.entitlements enable row level security;
alter table landdraft_control.invitations enable row level security;
alter table landdraft_control.audit enable row level security;

create function landdraft_control.is_owner(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null
  and (lower(trim(u.email))='dev@glab.co' or exists(select 1 from landdraft_control.owners o where o.user_id=u.id)));
$$;
create function landdraft_control.allowed(p_user uuid,p_module text default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s landdraft_control.settings; u auth.users;
begin
 select * into s from landdraft_control.settings where id=1;
 if not found then return false; end if;
 if not s.active then return true; end if;
 select * into u from auth.users where id=p_user;
 if not found or u.email_confirmed_at is null then return false; end if;
 if landdraft_control.is_owner(u.id) then return true; end if;
 if s.fully_locked_down then
  return lower(trim(u.email))='jsgrella@gmail.com';
 end if;
 if u.banned_until>now() or exists(select 1 from landdraft_control.accounts a where a.user_id=u.id and a.locked_out) then return false; end if;
 if p_module is null or p_module='mapping.core' then return true; end if;
 return exists(select 1 from landdraft_control.entitlements e where e.user_id=u.id and e.module_id=p_module and e.complimentary);
end $$;
create function public.landdraft_access_status(p_module text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',landdraft_control.allowed(auth.uid(),p_module),'active',(select active from landdraft_control.settings where id=1));
$$;
revoke all on function public.landdraft_access_status(text) from public;
grant execute on function public.landdraft_access_status(text) to anon,authenticated,service_role;

create function landdraft_control.protect_owner() returns trigger language plpgsql set search_path='' as $$
begin
 if new.locked_out and landdraft_control.is_owner(new.user_id) then raise exception 'Protected owner'; end if;
 return new;
end $$;
create trigger protect_owner before insert or update on landdraft_control.accounts for each row execute function landdraft_control.protect_owner();
create function landdraft_control.immutable_audit() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Append-only audit'; end $$;
create trigger immutable_audit before update or delete on landdraft_control.audit for each row execute function landdraft_control.immutable_audit();

-- Auth insert guard covers password signup, OAuth and admin-created accounts alike.
-- Admission is not proof of email ownership and confers no admin privileges.
create function landdraft_control.admit_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare s landdraft_control.settings; e text:=lower(trim(new.email));
begin
 select * into s from landdraft_control.settings where id=1;
 if not found then raise exception 'Registration unavailable'; end if;
 if not s.active then return new; end if;
 if e in ('dev@glab.co','jsgrella@gmail.com') then return new; end if;
 if not s.fully_locked_down and (s.allow_new_accounts or (s.allow_invitations and exists(
  select 1 from landdraft_control.invitations i where i.email=e and i.canceled_at is null and i.accepted_user_id is null and i.expires_at>now()))) then return new; end if;
 raise exception 'New accounts are currently restricted. Contact LandDraft support.';
end $$;
create trigger landdraft_admit_account before insert on auth.users for each row execute function landdraft_control.admit_account();

create function landdraft_control.claim_invitation() returns trigger
language plpgsql security definer set search_path='' as $$
declare i landdraft_control.invitations;
begin
 if new.email_confirmed_at is null then return new; end if;
 for i in select * from landdraft_control.invitations where email=lower(trim(new.email)) and canceled_at is null and accepted_user_id is null and expires_at>now() for update loop
  insert into landdraft_control.entitlements(user_id,module_id,complimentary,source)
   select new.id,m,true,'invitation:'||i.id from unnest(i.modules) m
   on conflict(user_id,module_id) do update set complimentary=true,source=excluded.source,updated_at=now();
  update landdraft_control.invitations set accepted_user_id=new.id where id=i.id;
  insert into landdraft_control.audit values(gen_random_uuid(),'invitation.accepted',new.id::text,'Verified email accepted invitation',jsonb_build_object('id',i.id),now());
 end loop;
 return new;
end $$;
create trigger landdraft_claim_invitation after insert or update of email_confirmed_at on auth.users for each row execute function landdraft_control.claim_invitation();

-- RPC is callable only by the server-held service role; actor is the verified Access subject.
create function public.landdraft_control_admin(p_action text,p_payload jsonb,p_actor text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid; prior landdraft_control.audit; uid uuid; v_email text; mods text[]; s landdraft_control.settings;
begin
 if p_actor is distinct from '65143427-087f-586b-b437-05389750d0e7' then raise exception 'Owner required'; end if;
 if p_action='state' then
  return jsonb_build_object('ready',(select active from landdraft_control.settings where id=1),
   'moduleEnforcementReady',(select active from landdraft_control.settings where id=1),
   'fullyLockedDown',(select fully_locked_down from landdraft_control.settings where id=1),
   'allowNewAccounts',(select allow_new_accounts from landdraft_control.settings where id=1),
   'allowInvitations',(select allow_invitations from landdraft_control.settings where id=1),
   'accounts',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'lockedOut',a.locked_out)) from landdraft_control.accounts a where a.user_id in (select jsonb_array_elements_text(coalesce(p_payload->'userIds','[]'))::uuid)),'[]'::jsonb),
   'entitlements',coalesce((select jsonb_agg(jsonb_build_object('userId',e.user_id,'moduleId',e.module_id,'complimentary',e.complimentary,'source',e.source)) from landdraft_control.entitlements e where e.user_id in (select jsonb_array_elements_text(coalesce(p_payload->'userIds','[]'))::uuid)),'[]'::jsonb),
   'invitations',coalesce((select jsonb_agg(x) from (select id,email,expires_at as "expiresAt", case when canceled_at is not null then 'Canceled' when accepted_user_id is not null then 'Accepted' when expires_at<now() then 'Expired' else 'Pending — share link' end as status from landdraft_control.invitations order by created_at desc limit 100)x),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(x) from (select operation_id as id,action,actor,reason,payload,at from landdraft_control.audit order by at desc limit 100)x),'[]'::jsonb));
 end if;
 select * into s from landdraft_control.settings where id=1 for update;
 if not s.active then raise exception 'Access enforcement release is not activated'; end if;
 if length(trim(coalesce(p_payload->>'reason','')))<5 or length(p_payload->>'reason')>500 then raise exception 'Reason required'; end if;
 op:=(p_payload->>'operationId')::uuid;
 if op is null then raise exception 'Operation required'; end if;
 select * into prior from landdraft_control.audit where operation_id=op;
 if found then
  if prior.action<>p_action or prior.actor<>p_actor or prior.payload<>p_payload then raise exception 'Operation conflict'; end if;
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='settings' then
  if exists(select 1 from jsonb_each(p_payload) x where x.key in ('fullyLockedDown','allowNewAccounts','allowInvitations') and jsonb_typeof(x.value)<>'boolean') then raise exception 'Boolean required'; end if;
  update landdraft_control.settings set
   fully_locked_down=coalesce((p_payload->>'fullyLockedDown')::boolean,fully_locked_down),
   allow_new_accounts=coalesce((p_payload->>'allowNewAccounts')::boolean,allow_new_accounts),
   allow_invitations=coalesce((p_payload->>'allowInvitations')::boolean,allow_invitations) where id=1;
 elsif p_action in ('account','complimentary') then
  uid:=(p_payload->>'userId')::uuid;
  if not exists(select 1 from auth.users where id=uid) then raise exception 'Unknown account'; end if;
  if landdraft_control.is_owner(uid) then raise exception 'Protected owner'; end if;
  if p_action='account' then
   if jsonb_typeof(p_payload->'lockedOut') is distinct from 'boolean' then raise exception 'Boolean required'; end if;
   insert into landdraft_control.accounts values(uid,(p_payload->>'lockedOut')::boolean) on conflict(user_id) do update set locked_out=excluded.locked_out;
  else
   if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'Boolean required'; end if;
   insert into landdraft_control.entitlements values(uid,p_payload->>'moduleId',(p_payload->>'enabled')::boolean,'owner',now())
    on conflict(user_id,module_id) do update set complimentary=excluded.complimentary,source='owner',updated_at=now();
  end if;
 elsif p_action='invitations' then
  v_email:=lower(trim(p_payload->>'email'));
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  if s.fully_locked_down or not s.allow_invitations then raise exception 'Invitation admission disabled'; end if;
  select coalesce(array_agg(distinct v),'{}') into mods from jsonb_array_elements_text(coalesce(p_payload->'modules','[]')) v;
  if exists(select 1 from unnest(mods) m where not exists(select 1 from landdraft_control.modules where id=m)) then raise exception 'Unknown module'; end if;
  if exists(select 1 from auth.users where lower(trim(auth.users.email))=v_email) then raise exception 'Account exists; edit its access in Users'; end if;
  update landdraft_control.invitations set canceled_at=now() where landdraft_control.invitations.email=v_email and accepted_user_id is null and canceled_at is null;
  insert into landdraft_control.invitations(id,email,modules,expires_at) values(op,v_email,mods,now()+interval '7 days');
 elsif p_action='cancel-invitation' then
  update landdraft_control.invitations set canceled_at=now() where id=(p_payload->>'id')::uuid and accepted_user_id is null and canceled_at is null;
  if not found then raise exception 'Invitation not pending'; end if;
 else raise exception 'Unknown action'; end if;
 insert into landdraft_control.audit values(op,p_action,p_actor,trim(p_payload->>'reason'),p_payload,now());
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.landdraft_control_admin(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.landdraft_control_admin(text,jsonb,text) to service_role;

-- Applies even to existing JWTs; no client-provided email or mutable user metadata is trusted.
create function public.landdraft_request_guard() returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role'='service_role' then return; end if;
 if not landdraft_control.allowed(auth.uid()) then raise sqlstate '42501' using message='LandDraft access restricted'; end if;
end $$;
revoke all on function public.landdraft_request_guard() from public;
grant execute on function public.landdraft_request_guard() to anon,authenticated,service_role;
create function public.landdraft_account_allowed() returns boolean
language sql stable security definer set search_path='' as $$ select landdraft_control.allowed(auth.uid()); $$;
revoke all on function public.landdraft_account_allowed() from public;
grant execute on function public.landdraft_account_allowed() to anon,authenticated,service_role;
-- Restrictive policies add a gate; they cannot grant data access existing policies denied.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
  execute format('create policy landdraft_account_gate on public.%I as restrictive for all to anon,authenticated using ((select public.landdraft_account_allowed())) with check ((select public.landdraft_account_allowed()))',t.relname);
 end loop;
end $$;
create policy landdraft_account_gate on storage.objects as restrictive for all to anon,authenticated
 using ((select public.landdraft_account_allowed())) with check ((select public.landdraft_account_allowed()));
revoke all on all functions in schema landdraft_control from public,anon,authenticated;
-- Deliberately no activation or db_pre_request change here. Existing hooks must be inspected first.
commit;

