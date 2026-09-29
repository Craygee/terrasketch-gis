import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  project = "33333333-3333-4333-8333-333333333333";
test("parcel migration, authorization, leases and last-good-copy protection", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.projects(id uuid primary key,owner_id uuid); insert into public.projects values('${project}','${owner}');
 create function public.owns_project(p uuid) returns boolean language sql security definer as $$select exists(select 1 from public.projects where id=p and owner_id=auth.uid())$$;
 create function public.can_view_project(p uuid) returns boolean language sql security definer as $$select public.owns_project(p)$$;
 grant usage on schema public,auth to authenticated,service_role,anon;`);
  await db.exec(
    await readFile(
      new URL("../../supabase/migrations/202609140010_parcel_project_cache.sql", import.meta.url),
      "utf8",
    ),
  );
  const asUser = async (user, sql) => {
    await db.exec("begin; set local role authenticated;");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      const result = await db.query(sql);
      await db.exec("commit");
      return result.rows;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  const configure = `select public.configure_parcel_cache('${project}',array[-97.75,30.26,-97.745,30.265]::double precision[],true)`;
  await assert.rejects(asUser(owner, configure), /not yet enabled/);
  await db.exec(
    "update public.parcel_cache_policy set enabled=true,terms_review_url='https://example.org/approved',terms_reviewed_at=now(),scheduler_last_seen=now()",
  );
  await assert.rejects(asUser(other, configure), /Only the project owner/);
  await asUser(owner, configure);
  assert.equal((await asUser(other, "select * from public.project_parcel_cache")).length, 0);
  await assert.rejects(
    asUser(owner, "update public.project_parcel_cache set data='{}'"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(owner, "select public.claim_parcel_cache_job()"),
    /permission denied/,
  );
  const [job] = (await db.query("select * from public.claim_parcel_cache_job()")).rows;
  assert.equal((await db.query("select * from public.claim_parcel_cache_job()")).rows.length, 0);
  const data = { type: "FeatureCollection", features: [] };
  await db.query("select public.finish_parcel_cache_job($1,$2,$3,$4,null)", [
    project,
    job.lease,
    data,
    { source: "test" },
  ]);
  await db.exec(`update public.project_parcel_cache set next_check_at=now()-interval '1 day'`);
  const [retry] = (await db.query("select * from public.claim_parcel_cache_job()")).rows;
  await db.query("select public.finish_parcel_cache_job($1,$2,null,null,$3)", [
    project,
    retry.lease,
    "provider timeout",
  ]);
  const [saved] = (await db.query("select * from public.project_parcel_cache")).rows;
  assert.deepEqual(saved.data, data);
  assert.equal(saved.status, "error");
  assert.ok(saved.retrieved_at);
  await asUser(owner, `select public.configure_parcel_cache('${project}',null,false,true)`);
  const [paused] = (await db.query("select * from public.project_parcel_cache")).rows;
  assert.equal(paused.weekly, false);
  assert.equal(paused.status, "paused");
  assert.deepEqual(paused.data, data);
});
