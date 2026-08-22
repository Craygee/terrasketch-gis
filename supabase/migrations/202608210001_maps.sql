create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled map',
  description text not null default '',
  snapshot jsonb not null default '{"mapName":"Untitled map","basemap":"streets","layers":[]}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','link','public')),
  allow_link_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.maps enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "owners and shared viewers read maps" on public.maps for select using (auth.uid() = owner_id or visibility in ('link','public'));
create policy "signed in users create maps" on public.maps for insert with check (auth.uid() = owner_id);
create policy "owners edit maps" on public.maps for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "signed in link editors update maps" on public.maps for update using (auth.uid() is not null and allow_link_edit and visibility in ('link','public')) with check (allow_link_edit and visibility in ('link','public'));
create policy "owners delete maps" on public.maps for delete using (auth.uid() = owner_id);

create or replace function public.protect_map_access() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner_id := old.owner_id;
  if auth.uid() is distinct from old.owner_id then
    new.visibility := old.visibility;
    new.allow_link_edit := old.allow_link_edit;
  end if;
  return new;
end; $$;
drop trigger if exists protect_map_access_on_update on public.maps;
create trigger protect_map_access_on_update before update on public.maps for each row execute procedure public.protect_map_access();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))) on conflict do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter publication supabase_realtime add table public.maps;
