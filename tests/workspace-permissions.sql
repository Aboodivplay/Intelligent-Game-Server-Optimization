-- Run against the migrated database. Even an empty server list needs column grants.
begin;
set local role authenticated;
select id, name, threshold, manual_override, last_seen,
       tracking_enabled, console_enabled, minecraft_version
  from public.igso_servers order by created_at limit 0;
update public.igso_servers set minecraft_version = '1.20.1' where false;
rollback;
