-- Opt-in project-area parcel cache. Disabled until source terms and scheduler are verified.
create table public.parcel_cache_policy (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  terms_review_url text,
  terms_reviewed_at timestamptz,
  scheduler_last_seen timestamptz
);
insert into public.parcel_cache_policy(id) values(true);
alter table public.parcel_cache_policy enable row level security;
grant select on public.parcel_cache_policy to authenticated;
create policy parcel_policy_read on public.parcel_cache_policy for select to authenticated using(true);

create table public.project_parcel_cache (
  project_id uuid primary key references public.projects(id) on delete cascade,
  bounds double precision[] not null check(array_length(bounds,1)=4),
  weekly boolean not null default false,
  pending boolean not null default true,
  status text not null default 'queued' check(status in ('queued','loading','ready','error','paused')),
  last_checked_at timestamptz,
  retrieved_at timestamptz,
  next_check_at timestamptz not null default now(),
  error text,
  lease uuid,
  lease_until timestamptz,
  data jsonb,
  previous_data jsonb,
  provenance jsonb,
  previous_provenance jsonb,
  feature_count integer,
  requested_by uuid not null references auth.users(id)
);
alter table public.project_parcel_cache enable row level security;
revoke all on public.project_parcel_cache from anon, authenticated;
grant select on public.project_parcel_cache to authenticated;
create policy parcel_cache_read on public.project_parcel_cache for select to authenticated
  using(public.can_view_project(project_id));
grant all on public.project_parcel_cache, public.parcel_cache_policy to service_role;

create function public.configure_parcel_cache(p_project uuid, p_bounds double precision[], p_weekly boolean, p_pause boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.owns_project(p_project) then raise exception 'Only the project owner can configure saved parcel downloads'; end if;
  if p_pause then
    update public.project_parcel_cache set weekly=false,pending=false,lease=null,lease_until=null,status='paused' where project_id=p_project;
    return;
  end if;
  if not exists(select 1 from public.parcel_cache_policy where enabled and terms_review_url is not null
    and terms_reviewed_at is not null and scheduler_last_seen > now()-interval '2 hours') then
    raise exception 'Saved parcel downloads are not yet enabled: source terms and background scheduler must be verified';
  end if;
  if array_length(p_bounds,1) is distinct from 4 or array_position(p_bounds,null) is not null
    or not (p_bounds[1]>=-107 and p_bounds[3]<=-93 and p_bounds[2]>=25 and p_bounds[4]<=37
      and p_bounds[1]<p_bounds[3] and p_bounds[2]<p_bounds[4]
      and (p_bounds[3]-p_bounds[1])*(p_bounds[4]-p_bounds[2])<=0.05) then
    raise exception 'Save a smaller project area within Texas';
  end if;
  if exists(select 1 from public.project_parcel_cache where project_id=p_project
    and (lease_until>now() or last_checked_at>now()-interval '15 minutes')) then
    raise exception 'A parcel check is running or was attempted recently. Try later';
  end if;
  -- Changing area must not relabel the previous area's data as current coverage.
  if exists(select 1 from public.project_parcel_cache where project_id=p_project and bounds<>p_bounds) then
    raise exception 'The saved parcel area differs. Pause and remove its subscription before selecting a new area';
  end if;
  insert into public.project_parcel_cache(project_id,bounds,weekly,requested_by)
    values(p_project,p_bounds,p_weekly,auth.uid())
  on conflict(project_id) do update set weekly=p_weekly,pending=true,status='queued',next_check_at=now(),error=null;
end; $$;
revoke all on function public.configure_parcel_cache(uuid,double precision[],boolean,boolean) from public;
grant execute on function public.configure_parcel_cache(uuid,double precision[],boolean,boolean) to authenticated;

create function public.claim_parcel_cache_job()
returns setof public.project_parcel_cache language plpgsql security definer set search_path='' as $$
begin
  update public.parcel_cache_policy set scheduler_last_seen=now();
  if not exists(select 1 from public.parcel_cache_policy where enabled and terms_reviewed_at is not null and terms_review_url is not null) then return; end if;
  return query with candidate as (
    select project_id from public.project_parcel_cache where (pending or weekly) and next_check_at<=now()
      and (lease_until is null or lease_until<now()) order by next_check_at for update skip locked limit 1
  ) update public.project_parcel_cache c set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',status='loading',last_checked_at=now()
    from candidate where c.project_id=candidate.project_id returning c.*;
end; $$;
revoke all on function public.claim_parcel_cache_job() from public;
grant execute on function public.claim_parcel_cache_job() to service_role;

create function public.finish_parcel_cache_job(p_project uuid,p_lease uuid,p_data jsonb,p_provenance jsonb,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.parcel_cache_policy where enabled) then return; end if;
  if p_error is null and (p_data->>'type' is distinct from 'FeatureCollection'
    or jsonb_typeof(p_data->'features') is distinct from 'array'
    or jsonb_array_length(p_data->'features')>5000 or octet_length(p_data::text)>16000000) then
    raise exception 'Invalid parcel snapshot';
  end if;
  update public.project_parcel_cache set
    previous_data=case when p_error is null then data else previous_data end,
    previous_provenance=case when p_error is null then provenance else previous_provenance end,
    data=case when p_error is null then p_data else data end,
    provenance=case when p_error is null then p_provenance else provenance end,
    feature_count=case when p_error is null then jsonb_array_length(p_data->'features') else feature_count end,
    retrieved_at=case when p_error is null then now() else retrieved_at end,
    status=case when p_error is null then 'ready' else 'error' end,error=left(p_error,300),
    pending=false,lease=null,lease_until=null,
    next_check_at=now()+case when p_error is null then interval '7 days' else interval '1 day' end
    where project_id=p_project and lease=p_lease and lease_until>now();
end; $$;
revoke all on function public.finish_parcel_cache_job(uuid,uuid,jsonb,jsonb,text) from public;
grant execute on function public.finish_parcel_cache_job(uuid,uuid,jsonb,jsonb,text) to service_role;
