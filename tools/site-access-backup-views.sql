-- Reviewed read-only backup extension; apply after control schema installation.
begin;
grant usage on schema landdraft_control to glab_backup;
create or replace view glab_backup_read.landdraft_control__accounts with (security_barrier=true) as select "locked_out","user_id" from landdraft_control.accounts;
revoke all on glab_backup_read.landdraft_control__accounts from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__accounts to glab_backup;
grant select ("locked_out","user_id") on landdraft_control.accounts to glab_backup;
create or replace view glab_backup_read.landdraft_control__audit with (security_barrier=true) as select "action","actor","at","operation_id","payload","reason" from landdraft_control.audit;
revoke all on glab_backup_read.landdraft_control__audit from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__audit to glab_backup;
grant select ("action","actor","at","operation_id","payload","reason") on landdraft_control.audit to glab_backup;
create or replace view glab_backup_read.landdraft_control__entitlements with (security_barrier=true) as select "complimentary","module_id","source","updated_at","user_id" from landdraft_control.entitlements;
revoke all on glab_backup_read.landdraft_control__entitlements from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__entitlements to glab_backup;
grant select ("complimentary","module_id","source","updated_at","user_id") on landdraft_control.entitlements to glab_backup;
create or replace view glab_backup_read.landdraft_control__invitations with (security_barrier=true) as select "accepted_user_id","canceled_at","created_at","email","expires_at","id","modules" from landdraft_control.invitations;
revoke all on glab_backup_read.landdraft_control__invitations from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__invitations to glab_backup;
grant select ("accepted_user_id","canceled_at","created_at","email","expires_at","id","modules") on landdraft_control.invitations to glab_backup;
create or replace view glab_backup_read.landdraft_control__modules with (security_barrier=true) as select "id" from landdraft_control.modules;
revoke all on glab_backup_read.landdraft_control__modules from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__modules to glab_backup;
grant select ("id") on landdraft_control.modules to glab_backup;
create or replace view glab_backup_read.landdraft_control__owners with (security_barrier=true) as select "user_id" from landdraft_control.owners;
revoke all on glab_backup_read.landdraft_control__owners from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__owners to glab_backup;
grant select ("user_id") on landdraft_control.owners to glab_backup;
create or replace view glab_backup_read.landdraft_control__settings with (security_barrier=true) as select "activated_at","active","allow_invitations","allow_new_accounts","fully_locked_down","id" from landdraft_control.settings;
revoke all on glab_backup_read.landdraft_control__settings from public,anon,authenticated;
grant select on glab_backup_read.landdraft_control__settings to glab_backup;
grant select ("activated_at","active","allow_invitations","allow_new_accounts","fully_locked_down","id") on landdraft_control.settings to glab_backup;
CREATE OR REPLACE VIEW glab_backup_read.__schema_metadata WITH (security_barrier=true) AS SELECT jsonb_build_object(
 'storage_policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname='storage'),
 'table_security',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl)),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','landdraft_control') AND c.relkind IN ('r','p','v','S')),
 'function_grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'acl',p.proacl)),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','landdraft_control')),
 'auth_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND NOT t.tgisinternal),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) FROM pg_extension)
) AS metadata;
REVOKE ALL ON glab_backup_read.__schema_metadata FROM PUBLIC;

GRANT SELECT ON glab_backup_read.__schema_metadata TO glab_backup;
commit;
