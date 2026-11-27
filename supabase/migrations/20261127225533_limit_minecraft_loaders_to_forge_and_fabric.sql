-- Each administrator chooses the loader actually running on their server.
alter table public.igso_servers
  alter column loader drop default,
  drop constraint igso_servers_loader_check,
  add constraint igso_servers_loader_check check (loader in ('Forge', 'Fabric'));

-- A player-only invitation can see a current aggregate count without telemetry history.
create or replace function public.igso_observer_view(member uuid, target uuid)
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
    'players','[]'::jsonb,
    'playerCount',case when 'players'=any(g.scopes) and s.last_seen > now()-make_interval(secs => s.sample_interval*3)
      then (select t.payload->'players' from public.igso_telemetry t
            where t.server_id=s.id and t.recorded_at=s.last_seen and t.payload->>'platform'=s.loader
            order by t.sample_id limit 1) end)
  from public.igso_invitations g join public.igso_servers s on s.id=g.server_id
  where g.member_id=member and s.id=target;
$$;
