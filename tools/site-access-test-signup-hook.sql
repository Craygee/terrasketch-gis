-- TEST project unuxnecqjvmtztxxqudb only. Preserves the old dev-only rule until activation.
begin;
create or replace function public.hook_landdraft_test_signup(event jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s landdraft_control.settings; e text:=lower(trim(event->'user'->>'email'));
begin
 select * into strict s from landdraft_control.settings where id=1;
 if (not s.active and e='dev@glab.co') or
    (s.active and (e in ('dev@glab.co','jsgrella@gmail.com') or
     (not s.fully_locked_down and (s.allow_new_accounts or
      (s.allow_invitations and exists(select 1 from landdraft_control.invitations i
        where i.email=e and i.canceled_at is null and i.accepted_user_id is null and i.expires_at>now())))))) then
  return '{}'::jsonb;
 end if;
 return '{"error":{"http_code":403,"message":"New accounts are currently restricted. Contact LandDraft support."}}'::jsonb;
end $$;
revoke all on function public.hook_landdraft_test_signup(jsonb) from public,anon,authenticated;
grant execute on function public.hook_landdraft_test_signup(jsonb) to supabase_auth_admin;
commit;
