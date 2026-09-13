-- Additive foundation only. Does not alter existing credentials, projects,
-- memberships or free GIS permissions. Apply to a disposable database first.
begin;
create table if not exists public.weather_provider_catalog (
  provider_id text primary key check (provider_id ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  provider_name text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.weather_product_catalog (
  product_id text primary key,
  provider_id text not null references public.weather_provider_catalog(provider_id),
  provider_product text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  stale_after_seconds integer not null check (stale_after_seconds > 0),
  enabled boolean not null default false,
  unique (provider_id, product_id)
);
create table if not exists public.weather_license_reviews (
  review_id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.weather_provider_catalog(provider_id),
  product_id text not null,
  licensing_status text not null check (licensing_status in (
    'PUBLIC_OPEN','COMMERCIAL_LICENSE_REQUIRED','LANDDRAFT_LICENSED','USER_BYOK',
    'USER_OAUTH','ATTRIBUTION_REQUIRED','RESEARCH_ONLY','NONCOMMERCIAL_ONLY','UNKNOWN','DISABLED')),
  connection_type text not null check (connection_type in ('INCLUDED_PUBLIC','LANDDRAFT_MANAGED','USER_BYOK','USER_OAUTH')),
  scope text not null check (scope in ('application','user')),
  user_id uuid references auth.users(id) on delete cascade,
  evidence_reference text not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  proxy_allowed boolean not null default false,
  display_allowed boolean not null default false,
  derived_products_allowed boolean not null default false,
  maximum_cache_seconds integer not null default 0 check (maximum_cache_seconds between 0 and 86400),
  foreign key (provider_id, product_id) references public.weather_product_catalog(provider_id, product_id),
  check (valid_until > reviewed_at),
  check ((scope = 'application' and user_id is null) or (scope = 'user' and user_id is not null))
);
create index if not exists weather_license_reviews_active_idx
  on public.weather_license_reviews (provider_id, product_id, valid_until) where revoked_at is null;
create table if not exists public.weather_product_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  product_id text not null,
  connection_type text not null check (connection_type in ('USER_BYOK','USER_OAUTH','LANDDRAFT_MANAGED')),
  status text not null check (status in ('verified','denied','unknown','expired','revoked')),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, provider_id, product_id, connection_type),
  foreign key (provider_id, product_id) references public.weather_product_catalog(provider_id, product_id),
  check (expires_at > checked_at)
);
create table if not exists public.weather_provider_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  provider_id text not null,
  action text not null check (action in ('connect','disconnect','test','tile','license-review','revoke')),
  outcome text not null check (outcome in ('success','denied','failed')),
  occurred_at timestamptz not null default now()
);
create index if not exists weather_provider_audit_events_time_idx on public.weather_provider_audit_events (occurred_at);
create index if not exists weather_provider_audit_events_user_time_idx on public.weather_provider_audit_events (user_id, occurred_at desc);

alter table public.weather_provider_catalog enable row level security;
alter table public.weather_product_catalog enable row level security;
alter table public.weather_license_reviews enable row level security;
alter table public.weather_product_entitlements enable row level security;
alter table public.weather_provider_audit_events enable row level security;
revoke all on public.weather_provider_catalog, public.weather_product_catalog, public.weather_license_reviews,
  public.weather_product_entitlements, public.weather_provider_audit_events from anon, authenticated;
grant select on public.weather_provider_catalog, public.weather_product_catalog to anon, authenticated;
grant select on public.weather_product_entitlements, public.weather_provider_audit_events to authenticated;
grant all on public.weather_provider_catalog, public.weather_product_catalog, public.weather_license_reviews,
  public.weather_product_entitlements, public.weather_provider_audit_events to service_role;
drop policy if exists weather_provider_catalog_read on public.weather_provider_catalog;
create policy weather_provider_catalog_read on public.weather_provider_catalog for select to anon, authenticated using (true);
drop policy if exists weather_product_catalog_read on public.weather_product_catalog;
create policy weather_product_catalog_read on public.weather_product_catalog for select to anon, authenticated using (true);
drop policy if exists weather_entitlements_read_own on public.weather_product_entitlements;
create policy weather_entitlements_read_own on public.weather_product_entitlements for select to authenticated using (user_id = auth.uid());
drop policy if exists weather_provider_audit_read_own on public.weather_provider_audit_events;
create policy weather_provider_audit_read_own on public.weather_provider_audit_events for select to authenticated using (user_id = auth.uid());
-- No authenticated write policy: users cannot grant their own licenses or entitlements.
comment on table public.weather_license_reviews is 'Server-managed rights evidence. Never expose agreements or review records through the public catalog.';
comment on table public.weather_provider_audit_events is 'Allowlisted operational fields only. No credentials, raw errors, locations, route geometries or media URLs. Proposed retention: 30 days; activate retention job with durable writer.';
commit;
