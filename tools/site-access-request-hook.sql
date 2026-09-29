-- Coordinated release only: preserve any pre-existing request hook by stopping for review.
begin;
do $$ declare hook text; begin
 select substring(c from length('pgrst.db_pre_request=')+1) into hook
 from pg_roles r cross join lateral unnest(coalesce(r.rolconfig,'{}')) c
 where r.rolname='authenticator' and c like 'pgrst.db_pre_request=%';
 if hook is not null and hook<>'' and hook<>'public.landdraft_request_guard' then
  raise exception 'Existing request hook requires composition before release';
 end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.landdraft_request_guard';
notify pgrst,'reload config';
commit;
