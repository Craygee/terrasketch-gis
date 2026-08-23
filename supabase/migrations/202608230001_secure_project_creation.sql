-- Create projects through a narrowly scoped RPC so ownership always comes from
-- the authenticated JWT rather than a browser-supplied owner_id.

create or replace function public.create_project(
  p_id uuid,
  p_name text,
  p_autosave boolean,
  p_state_path text
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  expected_prefix text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Project ID is required';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 160 then
    raise exception 'Project name must contain between 1 and 160 characters';
  end if;

  expected_prefix := current_user_id::text || '/' || p_id::text || '/states/';
  if p_state_path is null
    or p_state_path not like expected_prefix || '%'
    or position('..' in p_state_path) > 0
  then
    raise exception 'Project snapshot path is invalid' using errcode = '42501';
  end if;

  return query
    insert into public.projects (id, owner_id, name, autosave, state_path)
    values (p_id, current_user_id, trim(p_name), coalesce(p_autosave, true), p_state_path)
    returning *;
end;
$$;

revoke all on function public.create_project(uuid, text, boolean, text) from public;
revoke all on function public.create_project(uuid, text, boolean, text) from anon;
grant execute on function public.create_project(uuid, text, boolean, text) to authenticated;

-- Project creation is now available only through the guarded function above.
revoke insert on public.projects from authenticated;
drop policy if exists "projects_insert_own" on public.projects;
