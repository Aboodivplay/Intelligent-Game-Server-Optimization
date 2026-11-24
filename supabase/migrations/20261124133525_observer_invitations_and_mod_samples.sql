-- Older Paper installations keep their existing freshness and delivery behavior.
alter table public.igso_servers add column loader text not null default 'Paper' check(loader in ('Paper','Forge','Fabric')),
  add column sample_interval integer check(sample_interval between 1 and 5);
grant select(loader,sample_interval), update(loader) on public.igso_servers to authenticated;
alter table public.igso_telemetry add column sample_id uuid;
create unique index igso_sample_once on public.igso_telemetry(server_id,sample_id) where sample_id is not null;

-- Retries use the original sample ID. Older arrivals fill gaps without moving the heartbeat backwards.
create function public.igso_deliver_sample(target uuid, credential text, sample uuid, observed timestamptz, seconds integer, reading jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.igso_servers where id=target and agent_key_hash=credential and loader=reading->>'platform' for update;
  if not found then return 'unauthorized'; end if;
  insert into public.igso_telemetry(server_id,sample_id,recorded_at,payload) values(target,sample,observed,reading)
    on conflict (server_id,sample_id) where sample_id is not null do nothing;
  if not found then return 'duplicate'; end if;
  update public.igso_servers set last_seen=observed,sample_interval=seconds,
    tracking_enabled=false,console_enabled=false,player_snapshot='[]'::jsonb
    where id=target and (last_seen is null or last_seen <= observed);
  return 'stored';
end;
$$;
revoke all on function public.igso_deliver_sample(uuid,text,uuid,timestamptz,integer,jsonb) from public,anon,authenticated;
grant execute on function public.igso_deliver_sample(uuid,text,uuid,timestamptz,integer,jsonb) to service_role;
-- Invitations belong to one server and one verified email. Only the API accesses these rows.
create table public.igso_invitations (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.igso_servers(id) on delete cascade,
  recipient_email text not null,
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['overview','history','players']::text[] and array_position(scopes,null) is null),
  code_hash text unique,
  expires_at timestamptz not null default now() + interval '24 hours',
  member_id uuid references auth.users(id) on delete cascade,
  unique(server_id,recipient_email),
  check ((member_id is null) = (code_hash is not null))
);
create index igso_invitations_member on public.igso_invitations(member_id) where member_id is not null;
alter table public.igso_invitations enable row level security;
revoke all on public.igso_invitations from public, anon, authenticated;
grant select,insert,update,delete on public.igso_invitations to service_role;

-- The shared view reads permissions and data together. The API supplies the verified member.
create function public.igso_observer_view(member uuid, target uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',s.id,'name',s.name,'scopes',g.scopes,
    'online',coalesce(s.last_seen > now()-make_interval(secs => coalesce(s.sample_interval*3,30)),false),
    'telemetry',case when g.scopes && array['overview','history'] then
      coalesce((select jsonb_agg(row_data order by stamp) from (
        select t.recorded_at as stamp, jsonb_build_object('timestamp',t.recorded_at,
          'tps',t.payload->'tps','cpu',t.payload->'cpu','memory',t.payload->'memory',
          'mspt',t.payload->'mspt','entities',t.payload->'entities','players',t.payload->'players') as row_data
        from public.igso_telemetry t where t.server_id=s.id and t.recorded_at>=now()-interval '30 days'
        order by t.recorded_at desc limit (case when 'history'=any(g.scopes) then 300 else 1 end)
      ) readings),'[]'::jsonb) else '[]'::jsonb end,
    'players',case when 'players'=any(g.scopes) and s.tracking_enabled and s.last_seen > now()-make_interval(secs => coalesce(s.sample_interval*3,30))
      then coalesce((select jsonb_agg(jsonb_build_object('name',p->'name','activity',p->'activity')) from jsonb_array_elements(s.player_snapshot) p),'[]'::jsonb) else '[]'::jsonb end)
  from public.igso_invitations g join public.igso_servers s on s.id=g.server_id
  where g.member_id=member and s.id=target;
$$;
revoke all on function public.igso_observer_view(uuid,uuid) from public,anon,authenticated;
grant execute on function public.igso_observer_view(uuid,uuid) to service_role;
