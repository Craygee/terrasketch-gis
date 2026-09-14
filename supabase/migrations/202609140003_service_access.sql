-- Server-only access check for trusted inbound integrations without an end-user JWT.
begin;
create function public.landdraft_service_access(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select landdraft_control.allowed(p_user,'mapping.core');
$$;
revoke all on function public.landdraft_service_access(uuid) from public,anon,authenticated;
grant execute on function public.landdraft_service_access(uuid) to service_role;
commit;
