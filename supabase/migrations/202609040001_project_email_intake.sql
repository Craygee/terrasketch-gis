-- LandDraft production email intake. Opaque account/project aliases route
-- signature-verified inbound mail into private project records.

create table if not exists public.project_email_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  local_part text not null unique
    check (local_part ~ '^[a-z0-9][a-z0-9-]{15,63}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_email_aliases_active_project_idx
  on public.project_email_aliases (owner_id, project_id)
  where active and project_id is not null;
create unique index if not exists project_email_aliases_active_account_idx
  on public.project_email_aliases (owner_id)
  where active and project_id is null;

create table if not exists public.project_inbound_emails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  alias_id uuid not null references public.project_email_aliases(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  provider text not null default 'resend' check (provider in ('resend')),
  provider_email_id text not null unique,
  message_id text,
  from_address text not null default '',
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  reply_to_addresses text[] not null default '{}',
  subject text not null default '(no subject)',
  text_body text,
  body_storage_path text,
  raw_storage_path text,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'partial', 'error')),
  error_message text,
  received_at timestamptz not null default now(),
  imported_at timestamptz,
  imported_project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_inbound_emails_owner_received_idx
  on public.project_inbound_emails (owner_id, received_at desc);
create index if not exists project_inbound_emails_project_received_idx
  on public.project_inbound_emails (project_id, received_at desc);

create table if not exists public.project_inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.project_inbound_emails(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_attachment_id text not null,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  storage_path text,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'skipped', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  unique (email_id, provider_attachment_id)
);

create index if not exists project_inbound_attachments_email_idx
  on public.project_inbound_attachments (email_id);

alter table public.project_email_aliases enable row level security;
alter table public.project_inbound_emails enable row level security;
alter table public.project_inbound_attachments enable row level security;

drop policy if exists "project_email_aliases_select_own" on public.project_email_aliases;
create policy "project_email_aliases_select_own" on public.project_email_aliases
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "project_inbound_emails_select_own" on public.project_inbound_emails;
create policy "project_inbound_emails_select_own" on public.project_inbound_emails
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "project_inbound_emails_delete_own" on public.project_inbound_emails;
create policy "project_inbound_emails_delete_own" on public.project_inbound_emails
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "project_inbound_attachments_select_own" on public.project_inbound_attachments;
create policy "project_inbound_attachments_select_own" on public.project_inbound_attachments
  for select to authenticated using (owner_id = auth.uid());

drop trigger if exists project_email_aliases_set_updated_at on public.project_email_aliases;
create trigger project_email_aliases_set_updated_at
before update on public.project_email_aliases
for each row execute function public.set_updated_at();

drop trigger if exists project_inbound_emails_set_updated_at on public.project_inbound_emails;
create trigger project_inbound_emails_set_updated_at
before update on public.project_inbound_emails
for each row execute function public.set_updated_at();

create or replace function public.ensure_project_email_alias(p_project_id uuid)
returns setof public.project_email_aliases
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing public.project_email_aliases;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not public.owns_project(p_project_id) then
    raise exception 'Project owner access is required' using errcode = '42501';
  end if;

  select * into existing
  from public.project_email_aliases
  where owner_id = current_user_id and project_id = p_project_id and active
  limit 1;
  if found then return next existing; return; end if;

  begin
    insert into public.project_email_aliases (owner_id, project_id, local_part)
    values (current_user_id, p_project_id, 'p-' || encode(extensions.gen_random_bytes(15), 'hex'))
    returning * into existing;
  exception when unique_violation then
    select * into existing
    from public.project_email_aliases
    where owner_id = current_user_id and project_id = p_project_id and active
    limit 1;
  end;
  return next existing;
end;
$$;

create or replace function public.ensure_account_email_alias()
returns setof public.project_email_aliases
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing public.project_email_aliases;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into existing
  from public.project_email_aliases
  where owner_id = current_user_id and project_id is null and active
  limit 1;
  if found then return next existing; return; end if;

  begin
    insert into public.project_email_aliases (owner_id, project_id, local_part)
    values (current_user_id, null, 'inbox-' || encode(extensions.gen_random_bytes(15), 'hex'))
    returning * into existing;
  exception when unique_violation then
    select * into existing
    from public.project_email_aliases
    where owner_id = current_user_id and project_id is null and active
    limit 1;
  end;
  return next existing;
end;
$$;

create or replace function public.assign_inbound_email(
  p_email_id uuid,
  p_project_id uuid
)
returns setof public.project_inbound_emails
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not public.owns_project(p_project_id) then
    raise exception 'Project owner access is required' using errcode = '42501';
  end if;

  return query
  update public.project_inbound_emails
  set project_id = p_project_id
  where id = p_email_id and owner_id = current_user_id
  returning *;
end;
$$;

create or replace function public.mark_inbound_email_imported(
  p_email_id uuid,
  p_project_id uuid
)
returns setof public.project_inbound_emails
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not public.owns_project(p_project_id) then
    raise exception 'Project owner access is required' using errcode = '42501';
  end if;

  return query
  update public.project_inbound_emails
  set imported_at = now(), imported_project_id = p_project_id
  where id = p_email_id and owner_id = current_user_id
  returning *;
end;
$$;

revoke all on function public.ensure_project_email_alias(uuid) from public, anon;
revoke all on function public.ensure_account_email_alias() from public, anon;
revoke all on function public.assign_inbound_email(uuid, uuid) from public, anon;
revoke all on function public.mark_inbound_email_imported(uuid, uuid) from public, anon;
grant execute on function public.ensure_project_email_alias(uuid) to authenticated;
grant execute on function public.ensure_account_email_alias() to authenticated;
grant execute on function public.assign_inbound_email(uuid, uuid) to authenticated;
grant execute on function public.mark_inbound_email_imported(uuid, uuid) to authenticated;

grant select on public.project_email_aliases to authenticated;
grant select, delete on public.project_inbound_emails to authenticated;
grant select on public.project_inbound_attachments to authenticated;

-- The Edge Function uses a server-only secret key and requires direct access.
grant all on public.project_email_aliases to service_role;
grant all on public.project_inbound_emails to service_role;
grant all on public.project_inbound_attachments to service_role;

