-- Run only after coordinated application, Edge Function and backup verification.
-- Select and verify the destination project before execution. Never use as a migration.
-- No customer rows are deleted or changed. Existing grants are preserved on retry.
begin;
set local lock_timeout='5s';
lock table auth.users in share row exclusive mode;
do $$
declare s landdraft_control.settings;
begin
 select * into strict s from landdraft_control.settings where id=1 for update;
 if s.active then return; end if;
 if not exists(select 1 from auth.users where landdraft_control.is_owner(id)) then
  raise exception 'Verified protected owner missing';
 end if;
 insert into landdraft_control.entitlements(user_id,module_id,complimentary,source)
  select u.id,m.id,true,'existing-user-at-activation'
  from auth.users u cross join landdraft_control.modules m
  on conflict(user_id,module_id) do nothing;
 update landdraft_control.settings set active=true,activated_at=now() where id=1;
 insert into landdraft_control.audit values(gen_random_uuid(),'release.activated','release',
  'Preserved existing user module access at coordinated activation',
  jsonb_build_object('existingUsers',(select count(*) from auth.users),
   'entitlements',(select count(*) from landdraft_control.entitlements)),now());
end $$;
commit;
