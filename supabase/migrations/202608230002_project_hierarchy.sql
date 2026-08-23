-- Cross-device project hierarchy. Parent changes go through a guarded RPC so a
-- project can only be attached to another project owned by the same user.

alter table public.projects
  add column if not exists parent_project_id uuid null
  references public.projects(id) on delete set null;

create index if not exists projects_parent_idx
  on public.projects (parent_project_id, updated_at desc);

create or replace function public.set_project_parent(
  p_project_id uuid,
  p_parent_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cursor_id uuid := p_parent_project_id;
  next_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_project_id = p_parent_project_id then
    raise exception 'A project cannot be its own parent';
  end if;
  if not exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = current_user_id
  ) then
    raise exception 'Project was not found' using errcode = '42501';
  end if;
  if p_parent_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_parent_project_id and owner_id = current_user_id
  ) then
    raise exception 'Parent project was not found' using errcode = '42501';
  end if;

  while cursor_id is not null loop
    if cursor_id = p_project_id then
      raise exception 'Project hierarchy cannot contain a cycle';
    end if;
    select parent_project_id into next_id
    from public.projects
    where id = cursor_id and owner_id = current_user_id;
    cursor_id := next_id;
  end loop;

  update public.projects
  set parent_project_id = p_parent_project_id
  where id = p_project_id and owner_id = current_user_id;
end;
$$;

revoke all on function public.set_project_parent(uuid, uuid) from public;
revoke all on function public.set_project_parent(uuid, uuid) from anon;
grant execute on function public.set_project_parent(uuid, uuid) to authenticated;
