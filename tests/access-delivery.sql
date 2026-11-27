-- Run as the database owner on a migrated database. All fixtures are rolled back.
begin;

create function pg_temp.require(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Regression: %', message; end if;
end;
$$;

-- This is the conditional UPDATE used by the Edge redemption endpoint after email verification.
create function pg_temp.claim(invite_hash text, verified_email text, member uuid)
returns integer language plpgsql as $$
declare affected integer;
begin
  update public.igso_invitations set member_id = member, code_hash = null
    where code_hash = invite_hash and recipient_email = lower(verified_email)
      and member_id is null and expires_at > now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

do $checks$
declare
  owner_a uuid := gen_random_uuid();
  member_b uuid := gen_random_uuid();
  outsider_c uuid := gen_random_uuid();
  member_session uuid := gen_random_uuid();
  server_a uuid := gen_random_uuid();
  server_c uuid := gen_random_uuid();
  invitation uuid := gen_random_uuid();
  oldest uuid := gen_random_uuid();
  newest uuid := gen_random_uuid();
  sample_time timestamptz := now();
  key_hash text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  code_hash text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  email_b text := member_b::text || '@example.invalid';
  reading jsonb := '{"platform":"Forge","mspt":20,"tps":20,"cpu":12,"memory":30,"entities":4,"players":1,"privateSentinel":"hide"}';
  visible jsonb;
  n integer;
begin
  insert into auth.users(id) values (owner_a), (member_b), (outsider_c);
  insert into auth.sessions(id,user_id) values (member_session,member_b);
  insert into public.igso_servers(id,owner_id,name,agent_key_hash,loader,minecraft_version)
    values (server_a,owner_a,'QA Forge',key_hash,'Forge','1.20.1'),
           (server_c,outsider_c,'QA Fabric',reverse(key_hash),'Fabric','26.3');
  insert into public.igso_invitations(id,server_id,recipient_email,scopes,code_hash,expires_at)
    values(invitation,server_a,email_b,array['overview'],code_hash,now() - interval '1 second');
  perform pg_temp.require(pg_temp.claim(code_hash,email_b,member_b) = 0, 'expired code');
  update public.igso_invitations set expires_at=now() + interval '1 hour' where id=invitation;
  perform pg_temp.require(pg_temp.claim(code_hash,'wrong-' || email_b,outsider_c) = 0, 'other email');
  perform pg_temp.require(pg_temp.claim(code_hash,upper(email_b),member_b) = 1, 'verified intended email');
  perform pg_temp.require(pg_temp.claim(code_hash,email_b,member_b) = 0, 'replayed code');
  perform pg_temp.require((select i.code_hash is null from public.igso_invitations i where i.id=invitation), 'redeemed hash erased');

  -- Exercise the actual deployed delivery and shared-view functions as the API database role.
  execute 'set local role service_role';
  perform pg_temp.require(public.igso_deliver_sample(server_a,'wrong',newest,sample_time,2,reading) = 'unauthorized', 'invalid agent key');
  perform pg_temp.require(public.igso_deliver_sample(server_a,key_hash,newest,sample_time,2,reading || '{"platform":"Fabric"}'::jsonb) = 'unauthorized', 'wrong loader');
  perform pg_temp.require(public.igso_deliver_sample(server_a,key_hash,newest,sample_time,2,reading) = 'stored', 'newest reading');
  perform pg_temp.require(public.igso_deliver_sample(server_a,key_hash,newest,sample_time,2,reading) = 'duplicate', 'retry deduplicated');
  perform pg_temp.require(public.igso_deliver_sample(server_a,key_hash,oldest,sample_time - interval '2 seconds',1,reading || '{"cpu":5}'::jsonb) = 'stored', 'older arrival retained');
  perform pg_temp.require((select count(*)=2 from public.igso_telemetry where server_id=server_a), 'unique telemetry rows');
  perform pg_temp.require((select last_seen=sample_time and sample_interval=2 from public.igso_servers where id=server_a), 'heartbeat and interval do not regress');
  perform pg_temp.require(public.igso_deliver_sample(server_c,reverse(key_hash),newest,sample_time,2,reading || '{"platform":"Fabric"}'::jsonb) = 'stored', 'Fabric stores its own server-scoped sample');
  visible := public.igso_observer_view(member_b,server_a);
  perform pg_temp.require(visible->'online' = 'true'::jsonb and jsonb_array_length(visible->'telemetry')=1 and visible->'playerCount'='null'::jsonb, 'overview only');
  perform pg_temp.require((visible - array['id','name','online','scopes','telemetry','players','playerCount']) = '{}'::jsonb, 'shared response exposes only observer fields');
  perform pg_temp.require(((visible->'telemetry'->0) - array['timestamp','tps','cpu','memory','mspt','entities','players']) = '{}'::jsonb, 'unapproved metric fields withheld');
  perform pg_temp.require(public.igso_observer_view(outsider_c,server_a) is null and public.igso_observer_view(member_b,server_c) is null, 'other accounts and servers isolated');

  update public.igso_invitations set scopes=array['history'] where id=invitation;
  visible := public.igso_observer_view(member_b,server_a);
  perform pg_temp.require(visible->'scopes'='["history"]'::jsonb and jsonb_array_length(visible->'telemetry')=2 and (visible#>>'{telemetry,0,cpu}')::int=5, 'history scope uses chronological source time');
  update public.igso_invitations set scopes=array['players'] where id=invitation;
  visible := public.igso_observer_view(member_b,server_a);
  perform pg_temp.require(visible->'telemetry'='[]'::jsonb and visible->'playerCount'='1'::jsonb, 'player-only permission shows a count');
  update public.igso_servers set last_seen=now()-interval '5.9 seconds' where id=server_a;
  perform pg_temp.require(public.igso_observer_view(member_b,server_a)->'online'='true'::jsonb, 'fresh before three intervals');
  update public.igso_servers set last_seen=now()-interval '6 seconds' where id=server_a;
  visible := public.igso_observer_view(member_b,server_a);
  perform pg_temp.require(visible->'online'='false'::jsonb and visible->'playerCount'='null'::jsonb, 'stale at three intervals');
  begin
    update public.igso_servers set loader='Paper' where id=server_a;
    raise exception 'Unsupported loader was accepted';
  exception when check_violation then null;
  end;
  update public.igso_servers set loader='Fabric' where id=server_a;
  perform pg_temp.require((select last_seen is null and sample_interval is null and not tracking_enabled and not console_enabled
    from public.igso_servers where id=server_a), 'switching loader clears the previous heartbeat and controls');

  execute 'reset role';
  perform set_config('request.jwt.claims',json_build_object('sub',member_b,'session_id',member_session,'aal','aal1','role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform pg_temp.require(public.igso_workspace_session_ready(), 'observer fixture has a current session');
  perform pg_temp.require(not exists(select 1 from public.igso_servers where id=server_a), 'no direct observer access to owner table');
  update public.igso_servers set name='QA forbidden' where id=server_a;
  get diagnostics n = row_count;
  perform pg_temp.require(n=0, 'observer cannot change owner configuration');
  perform pg_temp.require(not has_function_privilege(current_user,'public.igso_observer_view(uuid,uuid)','EXECUTE'), 'observer cannot select the member passed to service RPC');
  perform pg_temp.require(not has_function_privilege(current_user,'public.igso_deliver_sample(uuid,text,uuid,timestamptz,integer,jsonb)','EXECUTE'), 'observer cannot invoke ingest RPC');
  perform pg_temp.require(not has_table_privilege(current_user,'public.igso_invitations','SELECT') and not has_table_privilege(current_user,'public.igso_invitations','UPDATE'), 'no direct invitations table access');
  execute 'reset role';
  delete from public.igso_invitations where id=invitation;
  perform pg_temp.require(public.igso_observer_view(member_b,server_a) is null, 'revocation effective');
end $checks$;
rollback;
