-- Restrict direct weather-table access in addition to the product request gate.
begin;
create function public.landdraft_module_allowed(p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select landdraft_control.allowed(auth.uid(),p_module);
$$;
revoke all on function public.landdraft_module_allowed(text) from public;
grant execute on function public.landdraft_module_allowed(text) to anon,authenticated,service_role;
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'weather\_%' escape '\' loop
  if not (select relrowsecurity from pg_class where oid=format('public.%I',t.relname)::regclass) then
   raise exception 'Weather table requires RLS review: %',t.relname;
  end if;
  execute format('create policy landdraft_weather_gate on public.%I as restrictive for all to anon,authenticated using ((select public.landdraft_module_allowed(''weather.core''))) with check ((select public.landdraft_module_allowed(''weather.core'')))',t.relname);
 end loop;
end $$;
commit;
