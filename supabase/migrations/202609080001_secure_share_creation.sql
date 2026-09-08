-- Create map shares through a guarded RPC. Ownership is derived from the
-- authenticated JWT instead of trusting a browser-supplied owner_id, and the
-- snapshot path must belong to the same user and project.

create or replace function public.create_project_share(
  p_id uuid,
  p_project_id uuid,
  p_name text,
  p_state_path text,
  p_map_view jsonb,
  p_layer_scope jsonb
)
returns setof public.project_shares
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
  if p_id is null or p_project_id is null then
    raise exception 'Share and project IDs are required';
  end if;
  if not public.can_admin_project(p_project_id) then
    raise exception 'Project administrator access is required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 160 then
    raise exception 'Share name must contain between 1 and 160 characters';
  end if;

  expected_prefix := current_user_id::text || '/' || p_project_id::text || '/shares/' || p_id::text || '/';
  if p_state_path is null
    or p_state_path not like expected_prefix || '%'
    or position('..' in p_state_path) > 0
  then
    raise exception 'Share snapshot path is invalid' using errcode = '42501';
  end if;

  return query
    insert into public.project_shares (
      id,
      project_id,
      owner_id,
      name,
      state_path,
      map_view,
      layer_scope
    )
    values (
      p_id,
      p_project_id,
      current_user_id,
      trim(p_name),
      p_state_path,
      coalesce(p_map_view, '{}'::jsonb),
      coalesce(p_layer_scope, '[]'::jsonb)
    )
    returning *;
end;
$$;

revoke all on function public.create_project_share(uuid, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.create_project_share(uuid, uuid, text, text, jsonb, jsonb) from anon;
grant execute on function public.create_project_share(uuid, uuid, text, text, jsonb, jsonb) to authenticated;

